/**
 * Express 应用（依赖注入 pool，便于测试与替换）
 * 接口约定：
 *   POST   /api/cards                 创建名片（需口令）
 *   GET    /api/cards/:code           公开读取（active 返回数据，disabled 仅返回状态）
 *   PATCH  /api/cards/:code/status    启用/停用（需口令）
 *   DELETE /api/cards/:code           删除（需口令）
 *   GET    /api/cards                 列表（需口令，管理用）
 *   GET    /api/health                健康检查
 */
import express from 'express';
import crypto from 'node:crypto';

const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

function generateShortCode() {
  const buf = crypto.randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) out += CODE_ALPHABET[buf[i] % CODE_ALPHABET.length];
  return out;
}

function uuid() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

/** 字段校验（与前端规则一致，服务端为准） */
function validateCard(data) {
  const name = String(data.name ?? '').trim();
  const phone = String(data.phone ?? '').trim();
  if (!name) return '请填写姓名';
  if (name.length > 12) return '姓名不能超过 12 个字';
  if (!/^1\d{10}$/.test(phone)) return '请填写正确的 11 位手机号';
  if (String(data.title ?? '').trim().length > 20) return '职位不能超过 20 个字';
  if (String(data.department ?? '').trim().length > 20) return '部门不能超过 20 个字';
  if (String(data.wechat ?? '').trim().length > 30) return '微信号过长';
  if (String(data.bio ?? '').trim().length > 60) return '一句话介绍不能超过 60 个字';
  return null;
}

function rowToRecord(row) {
  return {
    id: row.id,
    shortCode: row.short_code,
    name: row.name,
    title: row.title,
    department: row.department,
    phone: row.phone,
    wechat: row.wechat,
    bio: row.bio,
    avatar: row.avatar || '',
    status: row.status,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function createApp({
  pool,
  adminToken = 'zhongju-admin-2026',
  staffToken = 'zhongju2026',
  tokenSecret = '',
  dailyLimit = 5,
  loginLimit = 10,
}) {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '2mb' }));

  /* ---------- token（HMAC 签名，无第三方依赖） ---------- */
  const SECRET = tokenSecret || `zhongju::${adminToken}::${staffToken}`;
  const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 小时

  const b64 = (s) => Buffer.from(s).toString('base64url');
  const sign = (payload) =>
    crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');

  function issueToken(role) {
    const exp = Date.now() + TOKEN_TTL_MS;
    const payload = b64(JSON.stringify({ role, exp }));
    return { token: `${payload}.${sign(payload)}`, role, exp };
  }

  function verifyToken(tok) {
    const idx = String(tok).lastIndexOf('.');
    if (idx <= 0) return null;
    const payload = tok.slice(0, idx);
    const sig = tok.slice(idx + 1);
    const expect = sign(payload);
    if (sig.length !== expect.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
    try {
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
      if (typeof data.exp !== 'number' || data.exp < Date.now()) return null;
      if (!['admin', 'staff'].includes(data.role)) return null;
      return data;
    } catch {
      return null;
    }
  }

  /** 解析请求身份：Bearer token 优先，兼容旧版 X-Card-Token 直传口令 */
  function identityOf(req) {
    const bearer = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (bearer) return verifyToken(bearer);
    const legacy = req.get('X-Card-Token') || '';
    if (!legacy) return null;
    if (legacy === adminToken) return { role: 'admin', exp: Infinity };
    if (legacy === staffToken) return { role: 'staff', exp: Infinity };
    return null;
  }

  /** 角色鉴权 */
  function requireRoles(roles) {
    return (req, res, next) => {
      const who = identityOf(req);
      if (!who) return res.status(401).json({ ok: false, error: '请先登录' });
      if (!roles.includes(who.role)) {
        return res.status(403).json({ ok: false, error: '无权访问' });
      }
      req.actor = who;
      next();
    };
  }

  const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Card-Token, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  /** 登录失败限流：每 IP 每 10 分钟最多 loginLimit 次 */
  const loginLog = new Map();
  function loginAllowed(ip) {
    const now = Date.now();
    const rec = loginLog.get(ip);
    if (!rec || now - rec.start > 10 * 60 * 1000) {
      loginLog.set(ip, { start: now, count: 1 });
      return true;
    }
    if (rec.count >= loginLimit) return false;
    rec.count += 1;
    return true;
  }

  /** 每 IP 每日创建次数限制（内存计数，容器重启后归零，MVP 可接受） */
  const genLog = new Map();
  function checkDailyLimit(ip) {
    const k = todayKey();
    const rec = genLog.get(ip);
    if (!rec || rec.day !== k) {
      genLog.set(ip, { day: k, count: 1 });
      return true;
    }
    if (rec.count >= dailyLimit) return false;
    rec.count += 1;
    return true;
  }

  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ ok: true, time: Date.now() });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  /** 口令登录：换取 12 小时 token，避免口令进入前端构建产物 */
  app.post('/api/admin/login', (req, res) => {
    const ip = req.ip || 'unknown';
    if (!loginAllowed(ip)) {
      return res.status(429).json({ ok: false, error: '尝试次数过多，请稍后再试' });
    }
    const passcode = String(req.body?.passcode ?? '').trim();
    if (!passcode) return res.status(400).json({ ok: false, error: '请输入口令' });

    let role = null;
    if (passcode === adminToken) role = 'admin';
    else if (passcode === staffToken) role = 'staff';
    if (!role) return res.status(401).json({ ok: false, error: '口令不正确' });

    const { token, exp } = issueToken(role);
    res.json({ ok: true, token, role, exp });
  });

  /** 当前登录态 */
  app.get('/api/admin/me', requireRoles(['admin', 'staff']), (req, res) => {
    res.json({ ok: true, role: req.actor.role, exp: req.actor.exp });
  });

  /** 创建名片（业务员或管理员） */
  app.post('/api/cards', requireRoles(['staff', 'admin']), async (req, res, next) => {
    try {
      const ip = req.ip || 'unknown';
      const data = req.body || {};
      const invalid = validateCard(data);
      if (invalid) return res.status(400).json({ ok: false, error: invalid });

      if (!checkDailyLimit(ip)) {
        return res
          .status(429)
          .json({ ok: false, error: `今日生成次数已达上限（${dailyLimit} 张），请明天再试` });
      }

      const now = Date.now();
      let shortCode = generateShortCode();
      for (let i = 0; i < 5; i++) {
        const [rows] = await pool.query(
          'SELECT 1 FROM cards WHERE short_code = ? LIMIT 1',
          [shortCode]
        );
        if (rows.length === 0) break;
        shortCode = generateShortCode();
      }

      const record = {
        id: uuid(),
        shortCode,
        name: String(data.name).trim(),
        title: String(data.title ?? '').trim(),
        department: String(data.department ?? '').trim(),
        phone: String(data.phone).trim(),
        wechat: String(data.wechat ?? '').trim(),
        bio: String(data.bio ?? '').trim(),
        avatar: typeof data.avatar === 'string' ? data.avatar : '',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };

      await pool.query(
        `INSERT INTO cards
          (id, short_code, name, title, department, phone, wechat, bio, avatar, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.id,
          record.shortCode,
          record.name,
          record.title,
          record.department,
          record.phone,
          record.wechat,
          record.bio,
          record.avatar,
          record.status,
          record.createdAt,
          record.updatedAt,
        ]
      );

      res.json({ ok: true, record });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/cards/:code', async (req, res, next) => {
    try {
      const code = String(req.params.code || '');
      const [rows] = await pool.query('SELECT * FROM cards WHERE short_code = ? LIMIT 1', [code]);
      if (rows.length === 0) return res.status(404).json({ ok: false, error: 'not_found' });
      const row = rows[0];
      if (row.status !== 'active') return res.json({ ok: true, status: 'disabled' });
      res.setHeader('Cache-Control', 'public, max-age=60');
      res.json({ ok: true, status: 'active', record: rowToRecord(row) });
    } catch (err) {
      next(err);
    }
  });

  app.patch('/api/cards/:code/status', requireRoles(['admin']), async (req, res, next) => {
    try {
      const code = String(req.params.code || '');
      const status = String(req.body?.status || '');
      if (!['active', 'disabled'].includes(status)) {
        return res.status(400).json({ ok: false, error: 'status 只能是 active 或 disabled' });
      }
      const [result] = await pool.query(
        'UPDATE cards SET status = ?, updated_at = ? WHERE short_code = ?',
        [status, Date.now(), code]
      );
      if (result.affectedRows === 0) return res.status(404).json({ ok: false, error: 'not_found' });
      res.json({ ok: true, shortCode: code, status });
    } catch (err) {
      next(err);
    }
  });

  app.delete('/api/cards/:code', requireRoles(['admin']), async (req, res, next) => {
    try {
      const code = String(req.params.code || '');
      const [result] = await pool.query('DELETE FROM cards WHERE short_code = ?', [code]);
      if (result.affectedRows === 0) return res.status(404).json({ ok: false, error: 'not_found' });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/cards', requireRoles(['admin']), async (req, res, next) => {
    try {
      const limit = Math.min(Number(req.query.limit || 100), 500);
      const [rows] = await pool.query(
        `SELECT id, short_code, name, title, department, phone, wechat, bio,
                status, created_at, updated_at
         FROM cards ORDER BY created_at DESC LIMIT ?`,
        [limit]
      );
      res.json({ ok: true, items: rows.map((r) => rowToRecord({ ...r, avatar: '' })) });
    } catch (err) {
      next(err);
    }
  });

  app.use((_req, res) => res.status(404).json({ ok: false, error: 'not_found' }));
  app.use((err, _req, res, _next) => {
    console.error('[error]', err);
    res.status(500).json({ ok: false, error: '服务器内部错误' });
  });

  return app;
}
