import express from 'express';
import crypto from 'node:crypto';
import { createRepository } from './repository.js';
import { WindowLimiter, normalizeCard, quotaClock, trustProxyConfig } from './security.js';

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const TTL = 12 * 3600000;
const shortCode = () =>
  Array.from(crypto.randomBytes(8), (byte) => ALPHABET[byte % ALPHABET.length]).join('');
const error = (status, message) => Object.assign(new Error(message), { status });
const canManage = (actor, row) => actor.role === 'admin' || row.owner_key === actor.owner;
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
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
  if (actor) result.permissions = { edit: canManage(actor, row), delete: canManage(actor, row) };
  return result;
}

export function createApp({
  pool,
  repository = pool?.repository || createRepository(pool),
  adminToken = '',
  staffToken = '',
  tokenSecret = '',
  dailyLimit = 5,
  loginLimit = 10,
  trustProxy = process.env.TRUST_PROXY || false,
  quotaTimeZone = process.env.QUOTA_TIME_ZONE || 'Asia/Shanghai',
}) {
  if (!staffToken || !adminToken || staffToken === adminToken)
    throw new Error('Distinct staff and administrator passcodes are required');
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
  const rootKey =
    tokenSecret ||
    crypto
      .createHash('sha256')
      .update(adminToken + '\0' + staffToken)
      .digest('hex');
  const sign = (payload, role) =>
    crypto
      .createHmac(
        'sha256',
        crypto
          .createHmac('sha256', rootKey)
          .update(role + '\0' + (role === 'admin' ? adminToken : staffToken))
          .digest()
      )
      .update(payload)
      .digest('base64url');
  const failures = new WindowLimiter(loginLimit, 10 * 60000);
  const loginBurst = new WindowLimiter(120, 60000);
  const createBurst = new WindowLimiter(100, 60000);
  const clock = quotaClock(quotaTimeZone);
  let lastCleanup = 0;
  function verify(req) {
    const match = /^Bearer ([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/.exec(
      req.get('Authorization') || ''
    );
    if (!match || match[1].length > 1024) return null;
    try {
      const data = JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8'));
      if (
        !['staff', 'admin'].includes(data.role) ||
        !Number.isFinite(data.exp) ||
        data.exp <= Date.now() ||
        !/^[a-f0-9]{32}$/.test(data.id) ||
        !/^[a-f0-9]{64}$/.test(data.owner)
      )
        return null;
      if (!crypto.timingSafeEqual(Buffer.from(match[2]), Buffer.from(sign(match[1], data.role))))
        return null;
      return data;
    } catch {
      return null;
    }
  }
  const roles = (allowed) => async (req, _res, next) => {
    try {
      const actor = verify(req);
      if (!actor || !(await repository.sessionActive(actor.id, Date.now())))
        throw error(401, '请重新登录');
      if (!allowed.includes(actor.role)) throw error(403, '无权访问');
      req.actor = actor;
      next();
    } catch (err) {
      next(err);
    }
  };
  const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
  const quota = async (owner) => {
    const info = clock(),
      used = await repository.quota(owner, info.day);
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
  app.post(
    '/api/admin/login',
    asyncRoute(async (req, res) => {
      const ip = req.ip || 'unknown';
      if (!loginBurst.consume(ip) || !failures.available(ip))
        throw error(429, '尝试次数过多，请稍后再试');
      const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode.trim() : '';
      const role = passcode === adminToken ? 'admin' : passcode === staffToken ? 'staff' : null;
      if (!role) {
        failures.consume(ip);
        throw error(passcode ? 401 : 400, passcode ? '口令不正确' : '请输入口令');
      }
      const device = req.body.deviceId || crypto.randomBytes(16).toString('hex');
      if (typeof device !== 'string' || !/^[a-f0-9]{32}$/.test(device))
        throw error(400, '恢复码格式不正确');
      const actor = {
        id: crypto.randomBytes(16).toString('hex'),
        role,
        owner: crypto.createHash('sha256').update(device).digest('hex'),
        exp: Date.now() + TTL,
      };
      if (Date.now() - lastCleanup > 60000) {
        await repository.cleanupSessions(Date.now());
        lastCleanup = Date.now();
      }
      await repository.createSession(actor);
      const payload = Buffer.from(JSON.stringify(actor)).toString('base64url');
      res.json({ ok: true, token: payload + '.' + sign(payload, role), role, exp: actor.exp });
    })
  );
  app.get('/api/admin/me', roles(['staff', 'admin']), (req, res) =>
    res.json({ ok: true, role: req.actor.role, exp: req.actor.exp })
  );
  app.post(
    '/api/admin/logout',
    roles(['staff', 'admin']),
    asyncRoute(async (req, res) => {
      await repository.revokeSession(req.actor.id, Date.now());
      res.json({ ok: true });
    })
  );
  app.get(
    '/api/quota',
    roles(['staff', 'admin']),
    asyncRoute(async (req, res) => res.json({ ok: true, quota: await quota(req.actor.owner) }))
  );
  app.get(
    '/api/cards/mine',
    roles(['staff', 'admin']),
    asyncRoute(async (req, res) => {
      const options = listOptions(req),
        result = await repository.listCards({
          ...options,
          owner: req.actor.owner,
          includeAvatar: true,
        });
      res.json({
        ok: true,
        items: result.rows.map((row) => record(row, req.actor)),
        total: result.total,
        counts: result.counts,
        offset: options.offset,
        limit: options.limit,
      });
    })
  );
  app.get(
    '/api/cards',
    roles(['admin']),
    asyncRoute(async (req, res) => {
      const options = listOptions(req),
        result = await repository.listCards(options);
      res.json({
        ok: true,
        items: result.rows.map((row) => record(row, req.actor)),
        total: result.total,
        counts: result.counts,
        offset: options.offset,
        limit: options.limit,
      });
    })
  );
  app.post(
    '/api/cards',
    roles(['staff', 'admin']),
    asyncRoute(async (req, res) => {
      if (!createBurst.consume(req.ip || 'unknown')) throw error(429, '请求过于频繁，请稍后重试');
      const data = await normalizeCard(req.body),
        now = Date.now();
      const row = await repository.createCard(
        { ...data, status: 'active', created_at: now, updated_at: now },
        { owner: req.actor.owner, day: clock(now).day, limit: dailyLimit, generateCode: shortCode }
      );
      res.json({ ok: true, record: record(row, req.actor), quota: await quota(req.actor.owner) });
    })
  );
  app.get(
    '/api/cards/:code/manage',
    roles(['staff', 'admin']),
    asyncRoute(async (req, res) => {
      const row = await find(req.params.code);
      if (!canManage(req.actor, row)) throw error(403, '只能管理本人名片；历史名片请联系管理员');
      res.json({ ok: true, record: record(row, req.actor) });
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
    roles(['staff', 'admin']),
    asyncRoute(async (req, res) => {
      const row = await find(req.params.code);
      if (!canManage(req.actor, row)) throw error(403, '只能修改本人名片');
      const saved = await repository.updateCard(req.params.code, await normalizeCard(req.body));
      if (!saved) throw error(404, 'not_found');
      res.json({ ok: true, record: record(saved, req.actor) });
    })
  );
  app.patch(
    '/api/cards/:code/status',
    roles(['admin']),
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
    roles(['admin']),
    asyncRoute(async (req, res) => {
      await find(req.params.code);
      const device = req.body?.deviceId;
      if (typeof device !== 'string' || !/^[a-f0-9]{32}$/.test(device))
        throw error(400, '恢复码格式不正确');
      if (
        !(await repository.setOwner(
          req.params.code,
          crypto.createHash('sha256').update(device).digest('hex')
        ))
      )
        throw error(404, 'not_found');
      res.json({ ok: true });
    })
  );
  app.delete(
    '/api/cards/:code',
    roles(['staff', 'admin']),
    asyncRoute(async (req, res) => {
      const row = await find(req.params.code);
      if (!canManage(req.actor, row)) throw error(403, '只能删除本人名片');
      if (!(await repository.deleteCard(req.params.code))) throw error(404, 'not_found');
      res.json({ ok: true });
    })
  );
  app.use((_req, _res, next) => next(error(404, 'not_found')));
  app.use((err, _req, res, _next) => {
    const status =
      Number.isInteger(err.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
    if (status >= 500) console.error('[card-api]', err.code || err.name || 'internal_error');
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
