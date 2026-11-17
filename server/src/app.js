import express from 'express';
import crypto from 'node:crypto';
import { createRepository } from './repository.js';
import { WindowLimiter, normalizeCard, quotaClock, trustProxyConfig } from './security.js';
import { createContractRouter } from './contracts/router.js';
import * as auth from './auth.js';
import { hashPassword, verifyPassword, TOKEN_EXPIRE_HOURS } from './contracts/util.js';

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const shortCode = () =>
  Array.from(crypto.randomBytes(8), (byte) => ALPHABET[byte % ALPHABET.length]).join('');
const error = (status, message) => Object.assign(new Error(message), { status });
const canManage = (actor, row) => actor.role === 'admin' || row.owner_user_id === actor.id;

function record(row, actor) {
  const result = {
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
    ownerUserId: row.owner_user_id ?? null,
    ownerName: row.owner_name ?? null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
  if (actor) result.permissions = { edit: canManage(actor, row), delete: canManage(actor, row) };
  return result;
}

export function createApp({
  pool,
  repository = pool?.repository || createRepository(pool),
  dailyLimit = 5,
  loginLimit = 10,
  trustProxy = process.env.TRUST_PROXY || false,
  quotaTimeZone = process.env.QUOTA_TIME_ZONE || 'Asia/Shanghai',
}) {
  if (
    !Number.isInteger(dailyLimit) ||
    dailyLimit < 1 ||
    !Number.isInteger(loginLimit) ||
    loginLimit < 1
  )
    throw new Error('Rate limits must be positive integers');
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxyConfig(trustProxy));
  app.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.use(express.json({ limit: '512kb' }));

  const failures = new WindowLimiter(loginLimit, 10 * 60000);
  const loginBurst = new WindowLimiter(120, 60000);
  const createBurst = new WindowLimiter(100, 60000);
  const clock = quotaClock(quotaTimeZone);
  const authenticated = auth.authRequired(pool);
  const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

  const quota = async (userId) => {
    const info = clock(),
      used = await repository.quota(userId, info.day);
    return { ...info, used, limit: dailyLimit, remaining: Math.max(0, dailyLimit - used) };
  };
  const find = async (code) => {
    if (!/^[a-hj-km-np-z2-9]{8}$/.test(code)) throw error(404, 'not_found');
    const row = await repository.getCard(code);
    if (!row) throw error(404, 'not_found');
    return row;
  };
  const listOptions = (req) => {
    const limit = Number(req.query.limit ?? 50),
      offset = Number(req.query.offset ?? 0),
      keyword = String(req.query.q || '').trim(),
      status = String(req.query.status || 'all');
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 200 ||
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset > 10000000 ||
      keyword.length > 100 ||
      !['all', 'active', 'disabled'].includes(status)
    )
      throw error(400, '分页或筛选参数不正确');
    return { limit, offset, keyword, status };
  };

  app.use((req, res, next) => {
    const origin = process.env.CORS_ORIGIN;
    if (origin && (origin === '*' || req.get('Origin') === origin))
      res.set('Access-Control-Allow-Origin', origin);
    res.vary('Origin');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.get(
    '/api/health',
    asyncRoute(async (_req, res) => {
      try {
        await pool.query('SELECT 1');
        res.json({ ok: true });
      } catch {
        res.status(503).json({ ok: false, error: '服务暂不可用' });
      }
    })
  );

  // ---------- 统一认证 ----------
  app.post(
    '/api/auth/login',
    asyncRoute(async (req, res) => {
      const ip = req.ip || 'unknown';
      const username = String(req.body?.username || '').trim().slice(0, 50);
      if (!loginBurst.consume(ip) || !failures.available(ip)) {
        await auth.addLoginLog(pool, username, null, ip, false);
        throw error(429, '尝试次数过多，请 10 分钟后再试');
      }
      const lockMin = auth.userLockRemaining(username);
      if (lockMin > 0) {
        await auth.addLoginLog(pool, username, null, ip, false);
        throw error(429, `该账号因多次登录失败已被锁定，请约 ${lockMin} 分钟后再试`);
      }
      if (!username || !req.body?.password) throw error(400, '请输入登录名和密码');
      const user = await auth.doLogin(pool, username, req.body.password);
      if (!user) {
        failures.consume(ip);
        auth.recordFail(ip);
        auth.recordUserFail(username);
        await auth.addLoginLog(pool, username, null, ip, false);
        throw error(401, '账号或密码错误');
      }
      auth.clearFails(ip);
      auth.clearUserFails(username);
      await auth.addLoginLog(pool, username, user.id, ip, true);
      const token = await auth.createSession(pool, user.id);
      res.json({
        ok: true,
        token,
        user: { id: user.id, name: user.name, username: user.username, role: user.role },
        expires_in_hours: TOKEN_EXPIRE_HOURS,
      });
    })
  );
  app.get('/api/auth/me', authenticated, (req, res) => res.json({ user: req.user }));
  app.post(
    '/api/auth/logout',
    authenticated,
    asyncRoute(async (req, res) => {
      await auth.destroySession(pool, auth.tokenFromReq(req));
      res.json({ ok: true });
    })
  );
  app.post(
    '/api/auth/password',
    authenticated,
    asyncRoute(async (req, res) => {
      const { old_password, new_password } = req.body || {};
      const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
      const row = rows[0];
      if (!row || !verifyPassword(String(old_password || ''), row.salt, row.password_hash)) {
        throw error(400, '原密码不正确');
      }
      const pw = String(new_password || '');
      if (pw.length < 8) throw error(400, '新密码至少 8 位');
      const { salt, hash } = hashPassword(pw);
      await pool.query('UPDATE users SET salt = ?, password_hash = ? WHERE id = ?', [salt, hash, req.user.id]);
      res.json({ ok: true });
    })
  );
  app.get(
    '/api/auth/login-logs',
    authenticated,
    auth.requireRole('admin', 'contract_admin'),
    asyncRoute(async (_req, res) => {
      const [rows] = await pool.query(
        `SELECT l.id, l.username, l.ip, l.success, l.created_at, u.name AS user_name
         FROM contract_login_logs l LEFT JOIN users u ON u.id = l.user_id
         ORDER BY l.id DESC LIMIT 100`
      );
      res.json({ logs: rows });
    })
  );

  // ---------- 名片 ----------
  app.get(
    '/api/quota',
    authenticated,
    auth.requireRole('admin'),
    asyncRoute(async (req, res) => res.json({ ok: true, quota: await quota(req.user.id) }))
  );

  app.get(
    '/api/cards/mine',
    authenticated,
    auth.requireRole('admin'),
    asyncRoute(async (req, res) => {
      const options = listOptions(req),
        result = await repository.listCards({
          ...options,
          userId: req.user.id,
          includeAvatar: true,
        });
      res.json({
        ok: true,
        items: result.rows.map((row) => record(row, req.user)),
        total: result.total,
        counts: result.counts,
        offset: options.offset,
        limit: options.limit,
      });
    })
  );
  app.get(
    '/api/cards',
    authenticated,
    auth.requireRole('admin'),
    asyncRoute(async (req, res) => {
      const options = listOptions(req),
        result = await repository.listCards(options);
      res.json({
        ok: true,
        items: result.rows.map((row) => record(row, req.user)),
        total: result.total,
        counts: result.counts,
        offset: options.offset,
        limit: options.limit,
      });
    })
  );
  app.post(
    '/api/cards',
    authenticated,
    auth.requireRole('admin'),
    asyncRoute(async (req, res) => {
      if (!createBurst.consume(req.ip || 'unknown')) throw error(429, '请求过于频繁，请稍后重试');
      const data = await normalizeCard(req.body),
        now = Date.now();
      const row = await repository.createCard(
        { ...data, status: 'active', created_at: now, updated_at: now },
        { userId: req.user.id, day: clock(now).day, limit: dailyLimit, generateCode: shortCode }
      );
      row.owner_name = req.user.name;
      res.json({ ok: true, record: record(row, req.user), quota: await quota(req.user.id) });
    })
  );
  app.get(
    '/api/cards/:code/manage',
    authenticated,
    auth.requireRole('admin'),
    asyncRoute(async (req, res) => {
      const row = await find(req.params.code);
      if (!canManage(req.user, row)) throw error(403, '只能管理本人名片');
      res.json({ ok: true, record: record(row, req.user) });
    })
  );
  app.get(
    '/api/cards/:code',
    asyncRoute(async (req, res) => {
      const row = await find(req.params.code);
      if (row.status !== 'active') return res.json({ ok: true, status: 'disabled' });
      res.json({ ok: true, status: 'active', record: record(row) });
    })
  );
  app.put(
    '/api/cards/:code',
    authenticated,
    auth.requireRole('admin'),
    asyncRoute(async (req, res) => {
      const row = await find(req.params.code);
      if (!canManage(req.user, row)) throw error(403, '只能修改本人名片');
      const saved = await repository.updateCard(req.params.code, await normalizeCard(req.body));
      if (!saved) throw error(404, 'not_found');
      res.json({ ok: true, record: record(saved, req.user) });
    })
  );
  app.patch(
    '/api/cards/:code/status',
    authenticated,
    auth.requireRole('admin'),
    asyncRoute(async (req, res) => {
      await find(req.params.code);
      if (!['active', 'disabled'].includes(req.body?.status)) throw error(400, '状态参数不正确');
      if (!(await repository.setStatus(req.params.code, req.body.status)))
        throw error(404, 'not_found');
      res.json({ ok: true, status: req.body.status });
    })
  );
  app.put(
    '/api/cards/:code/owner',
    authenticated,
    auth.requireRole('admin'),
    asyncRoute(async (req, res) => {
      await find(req.params.code);
      const userId = Number(req.body?.user_id);
      if (!Number.isInteger(userId) || userId <= 0) throw error(400, '请选择要归属的账号');
      const [users] = await pool.query(
        "SELECT id FROM users WHERE id = ? AND status = 'active' LIMIT 1",
        [userId]
      );
      if (!users.length) throw error(400, '目标账号不存在或已停用');
      if (!(await repository.setOwner(req.params.code, userId))) throw error(404, 'not_found');
      res.json({ ok: true });
    })
  );
  app.delete(
    '/api/cards/:code',
    authenticated,
    auth.requireRole('admin'),
    asyncRoute(async (req, res) => {
      const row = await find(req.params.code);
      if (!canManage(req.user, row)) throw error(403, '只能删除本人名片');
      if (!(await repository.deleteCard(req.params.code))) throw error(404, 'not_found');
      res.json({ ok: true });
    })
  );

  // 合同管理模块：挂载在 /api/contract 下，与名片 API 共用进程、连接池与统一账号
  app.use('/api/contract', createContractRouter(pool, { filesDir: process.env.FILES_DIR }));

  app.use((_req, _res, next) => next(error(404, 'not_found')));
  app.use((err, _req, res, _next) => {
    const status =
      Number.isInteger(err.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
    if (status >= 500) console.error('[api]', err.code || err.name || 'internal_error');
    const message =
      err.type === 'entity.parse.failed'
        ? 'JSON 格式不正确'
        : status === 413
          ? '请求内容过大'
          : status >= 500
            ? '服务暂不可用，请稍后重试'
            : err.message;
    res.status(status).json({ ok: false, error: message });
  });
  return app;
}
