import express from 'express';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import ExcelJS from 'exceljs';
import * as u from './util.js';
import * as a from './auth.js';

function fixName(name) {
  // multer 把 originalname 当 latin1，中文文件名需要转回 utf8
  try {
    return Buffer.from(name, 'latin1').toString('utf8');
  } catch {
    return name;
  }
}

export function createContractRouter(pool, opts = {}) {
  const router = express.Router();
  const FILES_DIR = opts.filesDir || process.env.FILES_DIR || '/data/files';
  try {
    fs.mkdirSync(FILES_DIR, { recursive: true });
  } catch {
    // 无权限环境（如单元测试）跳过，上传附件时会再尝试创建
  }

  router.use((_req, res, next) => {
    res.set('X-Robots-Tag', 'noindex');
    next();
  });

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: u.MAX_FILE_SIZE, files: 1 },
  });

  const auth = a.authRequired(pool);

  async function addLog(contractId, userId, action, detail) {
    await pool.query(
      'INSERT INTO contract_logs (contract_id, user_id, action, detail) VALUES (?, ?, ?, ?)',
      [contractId, userId, action, detail == null ? null : JSON.stringify(detail)]
    );
  }

  function canEditContract(user, row) {
    // 主管理员 / 合同管理员均可编辑全部合同（业务人员不登录，只是负责人标签）
    return user.role === 'admin' || user.role === 'contract_admin';
  }

  async function nextCode(conn, year) {
    const [rows] = await conn.query(
      'SELECT code FROM contracts WHERE code LIKE ? ORDER BY code DESC LIMIT 1 FOR UPDATE',
      [`HT-${year}-%`]
    );
    const n = rows.length ? Number(rows[0].code.slice(-4)) + 1 : 1;
    return `HT-${year}-${String(n).padStart(4, '0')}`;
  }

  async function ensureCustomer(conn, name) {
    await conn.query('INSERT INTO contract_customers (name) VALUES (?) ON DUPLICATE KEY UPDATE name = VALUES(name)', [name]);
    const [rows] = await conn.query('SELECT id FROM contract_customers WHERE name = ? LIMIT 1', [name]);
    return rows[0].id;
  }

  // ---------- 健康检查 ----------
  router.get('/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ ok: true });
    } catch {
      res.status(500).json({ ok: false });
    }
  });

  // ---------- 登录 / 会话 ----------
  async function addLoginLog(username, userId, ip, success) {
    try {
      await pool.query(
        'INSERT INTO contract_login_logs (username, user_id, ip, success) VALUES (?, ?, ?, ?)',
        [String(username || '').slice(0, 50), userId ?? null, ip, success ? 1 : 0]
      );
    } catch {
      // 日志失败不阻断登录
    }
  }

  router.post('/auth/login', async (req, res, next) => {
    try {
      const ip = req.ip || 'unknown';
      const username = String((req.body || {}).username || '').trim().slice(0, 50);
      if (a.loginTooMany(ip)) {
        await addLoginLog(username, null, ip, false);
        return res.status(429).json({ error: '尝试次数过多，请 10 分钟后再试' });
      }
      const lockMin = a.userLockRemaining(username);
      if (lockMin > 0) {
        await addLoginLog(username, null, ip, false);
        return res.status(429).json({ error: `该账号因多次登录失败已被锁定，请约 ${lockMin} 分钟后再试` });
      }
      const user = await a.doLogin(pool, username, (req.body || {}).password);
      if (!user) {
        a.recordFail(ip);
        a.recordUserFail(username);
        await addLoginLog(username, null, ip, false);
        return res.status(401).json({ error: '账号或密码错误' });
      }
      a.clearFails(ip);
      a.clearUserFails(username);
      await addLoginLog(username, user.id, ip, true);
      const token = await a.createSession(pool, user.id);
      res.json({
        token,
        user: { id: user.id, name: user.name, username: user.username, role: user.role },
        expires_in_hours: u.TOKEN_EXPIRE_HOURS,
      });
    } catch (e) {
      next(e);
    }
  });

  router.get('/auth/login-logs', auth, a.requireRole('admin', 'contract_admin'), async (req, res, next) => {
    try {
      const [rows] = await pool.query(
        `SELECT l.id, l.username, l.ip, l.success, l.created_at, u.name AS user_name
         FROM contract_login_logs l LEFT JOIN users u ON u.id = l.user_id
         ORDER BY l.id DESC LIMIT 100`
      );
      res.json({ logs: rows });
    } catch (e) {
      next(e);
    }
  });

  router.post('/auth/logout', auth, async (req, res, next) => {
    try {
      await a.destroySession(pool, a.tokenFromReq(req));
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  router.get('/auth/me', auth, (req, res) => {
    res.json({ user: req.user });
  });

  router.post('/auth/password', auth, async (req, res, next) => {
    try {
      const { old_password, new_password } = req.body || {};
      const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
      const row = rows[0];
      if (!row || !u.verifyPassword(String(old_password || ''), row.salt, row.password_hash)) {
        return res.status(400).json({ error: '原密码不正确' });
      }
      const pw = String(new_password || '');
      if (pw.length < 8) return res.status(400).json({ error: '新密码至少 8 位' });
      const { salt, hash } = u.hashPassword(pw);
      await pool.query('UPDATE users SET salt = ?, password_hash = ? WHERE id = ?', [salt, hash, req.user.id]);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  // ---------- 用户与业务人员（主管理员/合同管理员可访问） ----------
  router.get('/users', auth, a.requireRole('admin', 'contract_admin'), async (req, res, next) => {
    try {
      const [rows] = await pool.query(
        'SELECT id, name, username, role, status, created_at FROM users ORDER BY id'
      );
      res.json({ users: rows });
    } catch (e) {
      next(e);
    }
  });

  router.post('/users', auth, a.requireRole('admin', 'contract_admin'), async (req, res, next) => {
    try {
      const { name, username, role, password } = req.body || {};
      const n = String(name || '').trim();
      const r = String(role || 'staff');
      if (!n || n.length > 50) return res.status(400).json({ error: '姓名必填且不超过 50 字' });
      if (!u.ROLES.includes(r)) return res.status(400).json({ error: '角色不合法' });

      // 登录账号（主/合同管理员）只能由主管理员创建；业务人员为档案，不登录、无密码
      const isStaff = r === 'staff';
      if (!isStaff && req.user.role !== 'admin') {
        return res.status(403).json({ error: '只有主管理员可以创建登录账号' });
      }

      let un = String(username || '').trim();
      if (isStaff && !un) {
        // 业务人员不登录，登录名自动生成唯一占位值
        un = `p-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
      }
      if (!/^[a-zA-Z0-9_-]{3,30}$/.test(un)) {
        return res.status(400).json({ error: '登录名需为 3-30 位字母、数字、中划线或下划线' });
      }
      const [dup] = await pool.query('SELECT id FROM users WHERE username = ?', [un]);
      if (dup.length) return res.status(409).json({ error: '登录名已存在' });

      let salt = '';
      let hash = '';
      if (!isStaff) {
        const pw = String(password || '');
        if (pw.length < 8) return res.status(400).json({ error: '初始密码至少 8 位' });
        ({ salt, hash } = u.hashPassword(pw));
      }
      const [ins] = await pool.query(
        'INSERT INTO users (name, username, role, salt, password_hash) VALUES (?, ?, ?, ?, ?)',
        [n, un, r, salt, hash]
      );
      const [rows] = await pool.query('SELECT id, name, username, role, status, created_at FROM users WHERE id = ?', [ins.insertId]);
      res.json({ user: rows[0] });
    } catch (e) {
      next(e);
    }
  });

  router.patch('/users/:id', auth, a.requireRole('admin', 'contract_admin'), async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: '参数不合法' });
      const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
      if (!rows.length) return res.status(404).json({ error: '用户不存在' });
      const target = rows[0];
      const body = req.body || {};
      const isSelf = id === req.user.id;
      const targetIsLogin = u.LOGIN_ROLES.includes(target.role);

      // 登录账号（主/合同管理员）只能由主管理员维护
      if (targetIsLogin && req.user.role !== 'admin') {
        return res.status(403).json({ error: '只有主管理员可以管理登录账号' });
      }
      if (isSelf && (body.status === 'disabled' || (body.role !== undefined && body.role !== target.role))) {
        return res.status(400).json({ error: '不能停用自己或修改自己的角色' });
      }

      const sets = [];
      const params = [];
      let clearPassword = false;
      if (body.name !== undefined) {
        const n = String(body.name).trim();
        if (!n || n.length > 50) return res.status(400).json({ error: '姓名不合法' });
        sets.push('name = ?');
        params.push(n);
      }
      if (body.role !== undefined && body.role !== target.role) {
        if (req.user.role !== 'admin') return res.status(403).json({ error: '只有主管理员可以调整角色' });
        if (!u.ROLES.includes(body.role)) return res.status(400).json({ error: '角色不合法' });
        sets.push('role = ?');
        params.push(body.role);
        // 登录角色 → 业务人员：清空密码、踢掉会话；业务人员 → 登录角色：必须同时设置密码
        if (targetIsLogin && body.role === 'staff') {
          clearPassword = true;
        } else if (!targetIsLogin && u.LOGIN_ROLES.includes(body.role)) {
          const pw = String(body.password || '');
          if (pw.length < 8) return res.status(400).json({ error: '设置为登录账号需提供至少 8 位的初始密码' });
          const { salt, hash } = u.hashPassword(pw);
          sets.push('salt = ?', 'password_hash = ?');
          params.push(salt, hash);
        }
      }
      if (body.password !== undefined && body.password !== '') {
        if (req.user.role !== 'admin') return res.status(403).json({ error: '只有主管理员可以重置密码' });
        if (String(body.password).length < 8) return res.status(400).json({ error: '密码至少 8 位' });
        const { salt, hash } = u.hashPassword(String(body.password));
        sets.push('salt = ?', 'password_hash = ?');
        params.push(salt, hash);
      }
      if (body.status !== undefined) {
        if (!['active', 'disabled'].includes(body.status)) return res.status(400).json({ error: '状态不合法' });
        sets.push('status = ?');
        params.push(body.status);
      }
      if (!sets.length) return res.status(400).json({ error: '没有需要修改的字段' });
      if (clearPassword) {
        sets.push('salt = ?', 'password_hash = ?');
        params.push('', '');
      }
      await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
      if (body.status === 'disabled' || clearPassword) {
        await pool.query('DELETE FROM contract_sessions WHERE user_id = ?', [id]);
      }
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  // ---------- 客户（用工单位） ----------
  router.get('/customers', auth, async (req, res, next) => {
    try {
      const q = String(req.query.q || '').trim();
      let sql = 'SELECT id, name, contact, phone, address, status, created_at FROM contract_customers';
      const params = [];
      if (q) {
        sql += ' WHERE name LIKE ?';
        params.push(`%${q}%`);
      }
      sql += ' ORDER BY name';
      const [rows] = await pool.query(sql, params);
      res.json({ contract_customers: rows });
    } catch (e) {
      next(e);
    }
  });

  router.post('/customers', auth, a.requireRole('admin', 'contract_admin'), async (req, res, next) => {
    try {
      const { errors, values } = u.validateCustomerInput(req.body || {});
      if (errors.length) return res.status(400).json({ error: errors.join('；') });
      const [dup] = await pool.query('SELECT id FROM contract_customers WHERE name = ?', [values.name]);
      if (dup.length) return res.status(409).json({ error: '该单位已存在' });
      const [ins] = await pool.query(
        'INSERT INTO contract_customers (name, contact, phone, address, status) VALUES (?, ?, ?, ?, ?)',
        [values.name, values.contact, values.phone, values.address, values.status]
      );
      res.json({ customer: { id: ins.insertId, ...values } });
    } catch (e) {
      next(e);
    }
  });

  router.put('/customers/:id', auth, a.requireRole('admin'), async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const [rows] = await pool.query('SELECT * FROM contract_customers WHERE id = ?', [id]);
      if (!rows.length) return res.status(404).json({ error: '客户不存在' });
      const { errors, values } = u.validateCustomerInput(req.body || {});
      if (errors.length) return res.status(400).json({ error: errors.join('；') });
      const [dup] = await pool.query('SELECT id FROM contract_customers WHERE name = ? AND id != ?', [values.name, id]);
      if (dup.length) return res.status(409).json({ error: '该单位名称已被使用' });
      await pool.query(
        'UPDATE contract_customers SET name = ?, contact = ?, phone = ?, address = ?, status = ? WHERE id = ?',
        [values.name, values.contact, values.phone, values.address, values.status, id]
      );
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  router.delete('/customers/:id', auth, a.requireRole('admin'), async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const [used] = await pool.query('SELECT id FROM contracts WHERE customer_id = ? AND deleted_at IS NULL LIMIT 1', [id]);
      if (used.length) return res.status(409).json({ error: '该客户下仍有合同，无法删除' });
      const [rs] = await pool.query('DELETE FROM contract_customers WHERE id = ?', [id]);
      if (!rs.affectedRows) return res.status(404).json({ error: '客户不存在' });
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  // ---------- 合同 ----------
  const CONTRACT_SELECT = `
    SELECT c.*, cu.name AS customer_name, uu.name AS owner_name
    FROM contracts c
    JOIN contract_customers cu ON cu.id = c.customer_id
    LEFT JOIN users uu ON uu.id = c.owner_user_id
  `;

  router.get('/contracts', auth, async (req, res, next) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.page_size) || 20));
      const { whereSql, params } = buildContractWhere(req.query, req.user.role);
      const [cnt] = await pool.query(
        `SELECT COUNT(*) AS total FROM contracts c JOIN contract_customers cu ON cu.id = c.customer_id WHERE ${whereSql}`,
        params
      );
      const [rows] = await pool.query(
        `${CONTRACT_SELECT} WHERE ${whereSql} ORDER BY c.id DESC LIMIT ? OFFSET ?`,
        [...params, pageSize, (page - 1) * pageSize]
      );
      res.json({
        total: cnt[0].total,
        page,
        page_size: pageSize,
        contracts: rows.map((r) => u.sanitizeContract(r, req.user.role)),
      });
    } catch (e) {
      next(e);
    }
  });

  function buildContractWhere(query, role) {
    const where = [];
    const params = [];
    // 管理员可通过 status=deleted 查看回收站；其他角色该筛选恒为空
    if (String(query.status || '').trim() === 'deleted') {
      if (role === 'admin') where.push('c.deleted_at IS NOT NULL');
      else where.push('1 = 0');
    } else {
      where.push('c.deleted_at IS NULL');
    }
    const q = String(query.q || '').trim();
    if (q) {
      where.push('(c.name LIKE ? OR c.code LIKE ? OR cu.name LIKE ?)');
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    const type = String(query.type || '').trim();
    if (type) {
      where.push('c.type = ?');
      params.push(type);
    }
    const customerId = Number(query.customer_id);
    if (Number.isInteger(customerId) && customerId > 0) {
      where.push('c.customer_id = ?');
      params.push(customerId);
    }
    const ownerId = Number(query.owner_id);
    if (Number.isInteger(ownerId) && ownerId > 0) {
      where.push('c.owner_user_id = ?');
      params.push(ownerId);
    }
    const status = String(query.status || '').trim();
    if (status === 'deleted') {
      // 已在上面作为回收站筛选处理，不再当作合同状态
    } else if (status === 'expiring') {
      where.push("c.status = 'active' AND c.end_date >= CURDATE() AND c.end_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)");
    } else if (status === 'expired') {
      where.push("c.status = 'active' AND c.end_date < CURDATE()");
    } else if (status) {
      where.push('c.status = ?');
      params.push(status);
    }
    return { whereSql: where.join(' AND '), params };
  }

  // ---------- 负责人列表（所有登录用户可查，供筛选） ----------
  router.get('/owners', auth, async (req, res, next) => {
    try {
      const [rows] = await pool.query("SELECT id, name FROM users WHERE status = 'active' ORDER BY id");
      res.json({ owners: rows });
    } catch (e) {
      next(e);
    }
  });

  // ---------- 合同列表导出（管理员/财务） ----------
  router.get('/contracts/export', auth, a.requireRole('admin', 'contract_admin'), async (req, res, next) => {
    try {
      const { whereSql, params } = buildContractWhere(req.query, req.user.role);
      const [rows] = await pool.query(`${CONTRACT_SELECT} WHERE ${whereSql} ORDER BY c.id DESC`, params);
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('合同台账');
      ws.columns = [
        { header: '编号', key: 'code', width: 18 },
        { header: '合同名称', key: 'name', width: 32 },
        { header: '类型', key: 'type', width: 14 },
        { header: '对方单位', key: 'customer_name', width: 28 },
        { header: '我方签约主体', key: 'our_entity', width: 14 },
        { header: '业务负责人', key: 'owner_name', width: 12 },
        { header: '合同金额', key: 'amountText', width: 18 },
        { header: '发票类型', key: 'invoice_type', width: 12 },
        { header: '结算方式', key: 'settle_type', width: 10 },
        { header: '服务人数', key: 'headcount', width: 10 },
        { header: '签订日期', key: 'sign_date', width: 12 },
        { header: '生效日期', key: 'start_date', width: 12 },
        { header: '到期日期', key: 'end_date', width: 12 },
        { header: '续签方式', key: 'renewal_type', width: 12 },
        { header: '状态', key: 'display_status', width: 10 },
        { header: '纸质存放位置', key: 'storage_location', width: 20 },
        { header: '终止原因', key: 'terminate_reason', width: 20 },
      ];
      const fmtDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
      rows.forEach((r) => {
        const s = u.sanitizeContract(r, req.user.role);
        ws.addRow({
          code: s.code,
          name: s.name,
          type: s.type,
          customer_name: s.customer_name,
          our_entity: s.our_entity ?? '',
          owner_name: s.owner_name ?? '',
          amountText: s.amount != null ? `${s.amount}${s.amount_unit ? ` ${s.amount_unit}` : ''}` : '',
          invoice_type: s.invoice_type ?? '',
          settle_type: s.settle_type ?? '',
          headcount: s.headcount ?? '',
          sign_date: fmtDate(s.sign_date),
          start_date: fmtDate(s.start_date),
          end_date: fmtDate(s.end_date),
          renewal_type: s.renewal_type ?? '',
          display_status: s.display_status,
          storage_location: s.storage_location ?? '',
          terminate_reason: s.terminate_reason ?? '',
        });
      });
      ws.getRow(1).font = { bold: true };
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFE9' } };
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      const fname = encodeURIComponent(`合同台账_${new Date().toISOString().slice(0, 10)}.xlsx`);
      res.setHeader('Content-Disposition', `attachment; filename="contracts.xlsx"; filename*=UTF-8''${fname}`);
      await wb.xlsx.write(res);
      res.end();
    } catch (e) {
      next(e);
    }
  });

  router.get('/contracts/stats', auth, async (req, res, next) => {
    try {
      const [rows] = await pool.query(`
        SELECT type, COUNT(*) AS total,
               SUM(CASE WHEN status IN ('active','renewed') AND end_date >= CURDATE() THEN 1 ELSE 0 END) AS active
        FROM contracts WHERE deleted_at IS NULL GROUP BY type
      `);
      const byType = new Map(rows.map((r) => [r.type, { total: r.total, active: Number(r.active) || 0 }]));
      const categories = u.CONTRACT_CATEGORIES.map((cat) => {
        const types = cat.types.map((t) => ({
          type: t,
          total: byType.get(t)?.total ?? 0,
          active: byType.get(t)?.active ?? 0,
        }));
        return {
          key: cat.key,
          label: cat.label,
          total: types.reduce((s, t) => s + t.total, 0),
          active: types.reduce((s, t) => s + t.active, 0),
          types,
        };
      });

      // 总览指标
      const [ov] = await pool.query(`
        SELECT COUNT(*) AS total,
               SUM(CASE WHEN status IN ('active','renewed') AND end_date >= CURDATE() THEN 1 ELSE 0 END) AS active,
               SUM(CASE WHEN sign_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01') THEN 1 ELSE 0 END) AS signed_this_month,
               SUM(CASE WHEN status = 'active' AND end_date >= CURDATE()
                         AND end_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS expiring,
               SUM(CASE WHEN status = 'active' AND end_date < CURDATE() THEN 1 ELSE 0 END) AS expired
        FROM contracts WHERE deleted_at IS NULL
      `);
      const overview = {
        total: Number(ov[0].total) || 0,
        active: Number(ov[0].active) || 0,
        signed_this_month: Number(ov[0].signed_this_month) || 0,
        expiring: Number(ov[0].expiring) || 0,
        expired: Number(ov[0].expired) || 0,
      };

      res.json({ categories, overview });
    } catch (e) {
      next(e);
    }
  });

  router.get('/contracts/:id', auth, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const [rows] = await pool.query(`${CONTRACT_SELECT} WHERE c.id = ?`, [id]);
      if (!rows.length) return res.status(404).json({ error: '合同不存在' });
      // 已删除（回收站）的合同仅管理员可见
      if (rows[0].deleted_at && req.user.role !== 'admin') return res.status(404).json({ error: '合同不存在' });
      res.json({ contract: u.sanitizeContract(rows[0], req.user.role) });
    } catch (e) {
      next(e);
    }
  });

  router.post('/contracts', auth, a.requireRole('admin', 'contract_admin'), async (req, res, next) => {
    const conn = await pool.getConnection();
    try {
      const { errors, values } = u.validateContractInput(req.body || {});
      if (errors.length) {
        conn.release();
        return res.status(400).json({ error: errors.join('；') });
      }
      const [own] = await conn.query("SELECT id FROM users WHERE id = ? AND status = 'active'", [values.owner_user_id]);
      if (!own.length) {
        conn.release();
        return res.status(400).json({ error: '业务负责人不存在' });
      }
      await conn.beginTransaction();
      values.customer_id = await ensureCustomer(conn, values.customer_name);
      let finalCode;
      if (values.code) {
        const [dup] = await conn.query('SELECT id FROM contracts WHERE code = ?', [values.code]);
        if (dup.length) {
          await conn.rollback();
          conn.release();
          return res.status(409).json({ error: `合同编号 ${values.code} 已存在` });
        }
        finalCode = values.code;
      } else {
        finalCode = await nextCode(conn, values.sign_date.slice(0, 4));
      }
      const [ins] = await conn.query(
        `INSERT INTO contracts
          (code, name, type, our_entity, customer_id, owner_user_id, amount, amount_unit, invoice_type, settle_type, headcount,
           sign_date, start_date, end_date, renewal_type, storage_location, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
        [finalCode, values.name, values.type, values.our_entity, values.customer_id, values.owner_user_id,
         values.amount, values.amount_unit, values.invoice_type, values.settle_type, values.headcount,
         values.sign_date, values.start_date, values.end_date, values.renewal_type, values.storage_location, req.user.id]
      );
      await conn.query(
        'INSERT INTO contract_logs (contract_id, user_id, action, detail) VALUES (?, ?, ?, ?)',
        [ins.insertId, req.user.id, 'create', JSON.stringify({ code: finalCode, name: values.name })]
      );
      await conn.commit();
      res.json({ id: ins.insertId, code: finalCode });
    } catch (e) {
      try { await conn.rollback(); } catch { /* 忽略回滚失败 */ }
      next(e);
    } finally {
      conn.release();
    }
  });

  router.put('/contracts/:id', auth, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const [rows] = await pool.query('SELECT * FROM contracts WHERE id = ?', [id]);
      const old = rows[0];
      if (!old || old.deleted_at) return res.status(404).json({ error: '合同不存在' });
      if (!canEditContract(req.user, old)) return res.status(403).json({ error: '只能编辑本人负责的合同' });
      const { errors, values } = u.validateContractInput(req.body || {});
      if (errors.length) return res.status(400).json({ error: errors.join('；') });
      const [own] = await pool.query("SELECT id FROM users WHERE id = ? AND status = 'active'", [values.owner_user_id]);
      if (!own.length) return res.status(400).json({ error: '业务负责人不存在' });
      values.customer_id = await ensureCustomer(pool, values.customer_name);
      if (values.code && values.code !== old.code) {
        const [dup] = await pool.query('SELECT id FROM contracts WHERE code = ? AND id != ?', [values.code, id]);
        if (dup.length) return res.status(409).json({ error: `合同编号 ${values.code} 已存在` });
      }
      await pool.query(
        `UPDATE contracts SET
          code = ?, name = ?, type = ?, our_entity = ?, customer_id = ?, owner_user_id = ?, amount = ?,
          amount_unit = ?, invoice_type = ?, settle_type = ?, headcount = ?, sign_date = ?, start_date = ?,
          end_date = ?, renewal_type = ?, storage_location = ?
         WHERE id = ?`,
        [values.code || old.code, values.name, values.type, values.our_entity, values.customer_id,
         values.owner_user_id, values.amount, values.amount_unit, values.invoice_type, values.settle_type,
         values.headcount, values.sign_date, values.start_date, values.end_date, values.renewal_type,
         values.storage_location, id]
      );
      const changed = Object.keys(values)
        .filter((k) => k !== 'customer_name')
        .filter((k) => String(old[k] ?? '') !== String(values[k] ?? ''));
      await addLog(id, req.user.id, 'update', { changed });
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  router.patch('/contracts/:id/status', auth, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const [rows] = await pool.query('SELECT * FROM contracts WHERE id = ?', [id]);
      const row = rows[0];
      if (!row) return res.status(404).json({ error: '合同不存在' });
      const action = String((req.body || {}).action || '');
      if (action === 'restore') {
        if (!['admin', 'contract_admin'].includes(req.user.role)) return res.status(403).json({ error: '只有主管理员或合同管理员可以恢复合同' });
        if (!row.deleted_at) return res.status(400).json({ error: '合同未被删除' });
        await pool.query('UPDATE contracts SET deleted_at = NULL WHERE id = ?', [id]);
        await addLog(id, req.user.id, 'restore', null);
        return res.json({ ok: true });
      }
      if (row.deleted_at) return res.status(400).json({ error: '合同已被删除，请先恢复' });
      if (action === 'terminate') {
        const canTerminate = req.user.role === 'admin' || req.user.role === 'contract_admin';
        if (!canTerminate) return res.status(403).json({ error: '只有主管理员或合同管理员可以终止合同' });
        const reason = String((req.body || {}).reason || '').trim().slice(0, 255);
        if (!reason) return res.status(400).json({ error: '请选择终止原因' });
        await pool.query(
          "UPDATE contracts SET status = 'terminated', terminate_reason = ?, terminated_at = NOW() WHERE id = ?",
          [reason, id]
        );
        await addLog(id, req.user.id, 'terminate', { reason });
        return res.json({ ok: true });
      }
      if (action === 'renew') {
        if (!['admin', 'contract_admin'].includes(req.user.role)) return res.status(403).json({ error: '只有主管理员或合同管理员可以标记续签' });
        const pick = (v) => {
          const s = String(v || '').trim();
          return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
        };
        const sign_date = pick((req.body || {}).sign_date);
        const start_date = pick((req.body || {}).start_date);
        const end_date = pick((req.body || {}).end_date);
        if (!sign_date || !start_date || !end_date) {
          return res.status(400).json({ error: '请填写新的签订日期、生效日期与到期日期' });
        }
        if (end_date < start_date) {
          return res.status(400).json({ error: '到期日期不能早于生效日期' });
        }
        await pool.query(
          "UPDATE contracts SET status = 'renewed', sign_date = ?, start_date = ?, end_date = ? WHERE id = ?",
          [sign_date, start_date, end_date, id]
        );
        await addLog(id, req.user.id, 'renew', { sign_date, start_date, end_date });
        return res.json({ ok: true });
      }
      if (action === 'reactivate') {
        const canReactivate = req.user.role === 'admin' || req.user.role === 'contract_admin';
        if (!canReactivate) return res.status(403).json({ error: '只有主管理员或合同管理员可以恢复合作' });
        if (row.status !== 'terminated') return res.status(400).json({ error: '只有已终止的合同可以恢复合作' });
        await pool.query(
          "UPDATE contracts SET status = 'active', terminate_reason = NULL, terminated_at = NULL WHERE id = ?",
          [id]
        );
        await addLog(id, req.user.id, 'reactivate', { previous_reason: row.terminate_reason });
        return res.json({ ok: true });
      }
      return res.status(400).json({ error: '不支持的状态操作' });
    } catch (e) {
      next(e);
    }
  });

  router.delete('/contracts/:id', auth, a.requireRole('admin', 'contract_admin'), async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const [rows] = await pool.query('SELECT * FROM contracts WHERE id = ?', [id]);
      if (!rows.length || rows[0].deleted_at) return res.status(404).json({ error: '合同不存在' });
      await pool.query('UPDATE contracts SET deleted_at = NOW() WHERE id = ?', [id]);
      await addLog(id, req.user.id, 'delete', { code: rows[0].code });
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  // ---------- 附件 ----------
  router.get('/contracts/:id/files', auth, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const [rows] = await pool.query(
        `SELECT f.id, f.contract_id, f.original_name, f.size, f.created_at, u.name AS uploaded_by_name
         FROM contract_files f LEFT JOIN users u ON u.id = f.uploaded_by
         WHERE f.contract_id = ? ORDER BY f.id DESC`,
        [id]
      );
      res.json({ files: rows });
    } catch (e) {
      next(e);
    }
  });

  router.post('/contracts/:id/files', auth, (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: '上传失败：文件超过 10MB 或格式不支持' });
      }
      next();
    });
  }, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const [rows] = await pool.query('SELECT * FROM contracts WHERE id = ? AND deleted_at IS NULL', [id]);
      if (!rows.length) return res.status(404).json({ error: '合同不存在' });
      if (!canEditContract(req.user, rows[0])) return res.status(403).json({ error: '只能给本人负责的合同上传附件' });
      if (!req.file) return res.status(400).json({ error: '请选择要上传的文件' });
      const ext = u.ALLOWED_MIME[req.file.mimetype];
      if (!ext) return res.status(400).json({ error: '仅支持 PDF / JPG / PNG 文件' });
      const original = fixName(req.file.originalname);
      const stored = `${id}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
      await fsp.mkdir(FILES_DIR, { recursive: true }).catch(() => {});
      await fsp.writeFile(path.join(FILES_DIR, stored), req.file.buffer);
      const [ins] = await pool.query(
        'INSERT INTO contract_files (contract_id, original_name, stored_name, size, sha256, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)',
        [id, original, stored, req.file.size, u.sha256(req.file.buffer), req.user.id]
      );
      await addLog(id, req.user.id, 'file_upload', { file: original });
      res.json({ file: { id: ins.insertId, original_name: original, size: req.file.size } });
    } catch (e) {
      next(e);
    }
  });

  router.get('/files/:id/download', auth, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const [rows] = await pool.query(
        `SELECT f.*, c.deleted_at AS contract_deleted FROM contract_files f
         JOIN contracts c ON c.id = f.contract_id WHERE f.id = ?`,
        [id]
      );
      const f = rows[0];
      if (!f || f.contract_deleted) return res.status(404).json({ error: '附件不存在' });
      const filePath = path.join(FILES_DIR, f.stored_name);
      if (!fs.existsSync(filePath)) return res.status(404).json({ error: '文件已丢失' });
      const ext = path.extname(f.stored_name);
      res.setHeader('Content-Type', u.EXT_MIME[ext] || 'application/octet-stream');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      // inline=1 用于浏览器内预览（图片 / PDF），默认仍为下载
      const disposition = req.query.inline === '1' ? 'inline' : 'attachment';
      res.setHeader('Content-Disposition',
        `${disposition}; filename="file-${f.id}${ext}"; filename*=UTF-8''${encodeURIComponent(f.original_name)}`);
      fs.createReadStream(filePath).pipe(res);
    } catch (e) {
      next(e);
    }
  });

  router.delete('/files/:id', auth, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const [rows] = await pool.query(
        `SELECT f.*, c.owner_user_id, c.deleted_at AS contract_deleted FROM contract_files f
         JOIN contracts c ON c.id = f.contract_id WHERE f.id = ?`,
        [id]
      );
      const f = rows[0];
      if (!f || f.contract_deleted) return res.status(404).json({ error: '附件不存在' });
      const allowed =
        req.user.role === 'admin' || f.uploaded_by === req.user.id ||
        (req.user.role === 'staff' && f.owner_user_id === req.user.id);
      if (!allowed) return res.status(403).json({ error: '没有权限删除此附件' });
      await pool.query('DELETE FROM contract_files WHERE id = ?', [id]);
      await fsp.unlink(path.join(FILES_DIR, f.stored_name)).catch(() => {});
      await addLog(f.contract_id, req.user.id, 'file_delete', { file: f.original_name });
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  // ---------- 操作日志 ----------
  router.get('/contracts/:id/logs', auth, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const [exists] = await pool.query('SELECT id FROM contracts WHERE id = ?', [id]);
      if (!exists.length) return res.status(404).json({ error: '合同不存在' });
      const [rows] = await pool.query(
        `SELECT l.id, l.action, l.detail, l.created_at, u.name AS user_name
         FROM contract_logs l LEFT JOIN users u ON u.id = l.user_id
         WHERE l.contract_id = ? ORDER BY l.id DESC LIMIT 200`,
        [id]
      );
      res.json({ logs: rows });
    } catch (e) {
      next(e);
    }
  });

  // ---------- 错误兜底（路由级） ----------
  router.use((err, _req, res, _next) => {
    if (err && (err.code === 'LIMIT_FILE_SIZE' || err.name === 'MulterError')) {
      return res.status(400).json({ error: '上传失败：文件超过 10MB 或格式不支持' });
    }
    console.error('[contract-api]', err);
    res.status(500).json({ error: '服务器内部错误' });
  });

  return router;
}
