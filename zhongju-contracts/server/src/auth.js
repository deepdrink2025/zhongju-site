import crypto from 'node:crypto';
import { sha256, verifyPassword, TOKEN_EXPIRE_HOURS, LOGIN_ROLES } from './util.js';

const WINDOW = 10 * 60 * 1000;
const MAX_FAILS = Number(process.env.LOGIN_LIMIT || 10);
const attempts = new Map(); // ip -> { count, resetAt }

function cleanup(now = Date.now()) {
  for (const [ip, entry] of attempts) {
    if (entry.resetAt <= now) attempts.delete(ip);
  }
}

export function loginTooMany(ip) {
  cleanup();
  const entry = attempts.get(ip);
  return !!entry && entry.count >= MAX_FAILS;
}

export function recordFail(ip) {
  cleanup();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt <= Date.now()) {
    attempts.set(ip, { count: 1, resetAt: Date.now() + WINDOW });
  } else {
    entry.count += 1;
  }
}

export function clearFails(ip) {
  attempts.delete(ip);
}

// ---------- 账号级失败锁定（内存态） ----------
const userFails = new Map(); // username -> { count, lockUntil }
const LOCK_FAILS = Number(process.env.LOGIN_LOCK_FAILS || 5);
const LOCK_MINUTES = Number(process.env.LOGIN_LOCK_MINUTES || 30);

export function userLockRemaining(username) {
  const entry = userFails.get(username);
  if (!entry || !entry.lockUntil) return 0;
  const remainMin = Math.ceil((entry.lockUntil - Date.now()) / 60000);
  if (remainMin <= 0) {
    userFails.delete(username);
    return 0;
  }
  return remainMin;
}

export function recordUserFail(username) {
  const entry = userFails.get(username) ?? { count: 0, lockUntil: 0 };
  entry.count += 1;
  if (entry.count >= LOCK_FAILS) {
    entry.lockUntil = Date.now() + LOCK_MINUTES * 60000;
    entry.count = 0;
  }
  userFails.set(username, entry);
}

export function clearUserFails(username) {
  userFails.delete(username);
}

export async function doLogin(pool, username, password) {
  const name = String(username || '').trim();
  if (!name || !password) return null;
  const [rows] = await pool.query('SELECT * FROM users WHERE username = ? LIMIT 1', [name]);
  const user = rows[0];
  const ok =
    user &&
    user.status === 'active' &&
    LOGIN_ROLES.includes(user.role) && // 业务人员档案不参与登录
    verifyPassword(password, user.salt, user.password_hash);
  return ok ? user : null;
}

export async function createSession(pool, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query(
    'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))',
    [sha256(token), userId, TOKEN_EXPIRE_HOURS]
  );
  await pool.query('DELETE FROM sessions WHERE expires_at < NOW()');
  return token;
}

export async function destroySession(pool, token) {
  if (!token) return;
  await pool.query('DELETE FROM sessions WHERE token_hash = ?', [sha256(token)]);
}

export function tokenFromReq(req) {
  const header = req.headers['authorization'] || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  if (req.query && req.query.token) return String(req.query.token);
  return null;
}

export function authRequired(pool) {
  return async (req, res, next) => {
    try {
      const token = tokenFromReq(req);
      if (!token) return res.status(401).json({ error: '未登录' });
      const [rows] = await pool.query(
        'SELECT s.id AS session_id, s.expires_at, u.id AS user_id, u.name, u.username, u.role, u.status FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? LIMIT 1',
        [sha256(token)]
      );
      const row = rows[0];
      if (!row || new Date(row.expires_at) < new Date()) {
        return res.status(401).json({ error: '登录已过期，请重新登录' });
      }
      if (row.status !== 'active') {
        return res.status(401).json({ error: '账号已停用' });
      }
      req.user = {
        id: row.user_id,
        name: row.name,
        username: row.username,
        role: row.role,
        session_id: row.session_id,
      };
      next();
    } catch (e) {
      next(e);
    }
  };
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: '没有权限执行此操作' });
    }
    next();
  };
}
