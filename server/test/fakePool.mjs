/**
 * 内存假库：模拟统一账户（users / contract_sessions / 登录日志）与本项目用到的 SQL，
 * 名片读写走 fakeRepository（无需 MySQL）。
 */
import crypto from 'node:crypto';
import { fakeRepository } from './fakeRepository.mjs';
import { hashPassword } from '../src/contracts/util.js';

export const TEST_PASSWORDS = {
  admin: 'admin-pass-123',
  staff: 'staff-pass-123',
  staff2: 'staff2-pass-123',
  contract: 'contract-pass-123',
};

function makeUser(id, name, username, role, password) {
  const { salt, hash } = hashPassword(password);
  return {
    id,
    name,
    username,
    role,
    salt,
    password_hash: hash,
    status: 'active',
    created_at: '2026-01-01 00:00:00',
  };
}

export function fakePool() {
  const repository = fakeRepository();
  const rows = repository.rows;
  const users = [
    makeUser(1, '主管理员', 'admin', 'admin', TEST_PASSWORDS.admin),
    makeUser(2, '业务员甲', 'staff', 'staff', TEST_PASSWORDS.staff),
    makeUser(3, '业务员乙', 'staff2', 'staff', TEST_PASSWORDS.staff2),
    makeUser(4, '合同管理员', 'contract', 'contract_admin', TEST_PASSWORDS.contract),
  ];
  const sessions = new Map();
  let sessionSeq = 1;
  const loginLogs = [];

  const userById = (id) => users.find((u) => u.id === Number(id)) || null;

  return {
    repository,
    rows,
    users,
    sessions,
    loginLogs,
    async query(sql, params = []) {
      const s = sql.replace(/\s+/g, ' ').trim();
      if (s === 'SELECT 1') return [[{ '1': 1 }]];
      if (s.startsWith('SELECT * FROM users WHERE username'))
        return [users.filter((u) => u.username === params[0]).slice(0, 1)];
      if (s.startsWith('SELECT * FROM users WHERE id')) {
        const user = userById(params[0]);
        return [user ? [user] : []];
      }
      if (s.startsWith('SELECT id FROM users WHERE id')) {
        const user = userById(params[0]);
        return [user && user.status === 'active' ? [{ id: user.id }] : []];
      }
      if (s.startsWith('SELECT id, name FROM users'))
        return [users.filter((u) => u.status === 'active').map((u) => ({ id: u.id, name: u.name }))];
      // 列表查询必须放在单条查询之前：两者的 SELECT 前缀相同
      if (s.startsWith('SELECT id, name, username, role, status, created_at FROM users'))
        return [users.map(({ id, name, username, role, status, created_at }) => ({ id, name, username, role, status, created_at }))];
      if (s.startsWith('SELECT id, name, username, role, status'))
        return [userById(params[0]) ? [userById(params[0])] : []];
      if (s.startsWith('INSERT INTO users')) {
        const [name, username, role, salt, password_hash] = params;
        const id = users.length + 1;
        users.push({ id, name, username, role, salt, password_hash, status: 'active', created_at: '2026-01-01 00:00:00' });
        return [{ insertId: id, affectedRows: 1 }];
      }
      if (s.startsWith('UPDATE users'))
        return [{ affectedRows: 1 }];
      if (s.startsWith('INSERT INTO contract_sessions')) {
        const [token_hash, user_id, hours] = params;
        const id = sessionSeq++;
        sessions.set(token_hash, {
          id,
          user_id: Number(user_id),
          expires_at: new Date(Date.now() + Number(hours || 12) * 3600000),
        });
        return [{ insertId: id, affectedRows: 1 }];
      }
      if (s.startsWith('SELECT s.id AS session_id')) {
        const session = sessions.get(params[0]);
        if (!session) return [[]];
        const user = userById(session.user_id);
        if (!user) return [[]];
        return [
          [
            {
              session_id: session.id,
              expires_at: session.expires_at,
              user_id: user.id,
              name: user.name,
              username: user.username,
              role: user.role,
              status: user.status,
            },
          ],
        ];
      }
      if (s.startsWith('DELETE FROM contract_sessions WHERE token_hash')) {
        sessions.delete(params[0]);
        return [{ affectedRows: 1 }];
      }
      if (s.startsWith('DELETE FROM contract_sessions WHERE expires_at')) {
        const now = new Date();
        for (const [key, session] of sessions) if (session.expires_at < now) sessions.delete(key);
        return [{ affectedRows: 0 }];
      }
      if (s.startsWith('DELETE FROM contract_sessions WHERE user_id')) {
        for (const [key, session] of sessions)
          if (session.user_id === Number(params[0])) sessions.delete(key);
        return [{ affectedRows: 1 }];
      }
      if (s.startsWith('INSERT INTO contract_login_logs')) {
        loginLogs.unshift({ username: params[0], user_id: params[1], ip: params[2], success: params[3] });
        return [{ insertId: loginLogs.length, affectedRows: 1 }];
      }
      // 合同报表/列表：内存假库不保存合同，统一返回空集（不抛 500，便于前端联调）
      if (s.startsWith('SELECT COUNT(*) AS total FROM contracts')) return [[{ total: 0 }]];
      if (/^SELECT COUNT\(\*\) AS total, SUM\(CASE/.test(s))
        return [[{ total: 0, active: 0, signed_this_month: 0, expiring: 0, expired: 0 }]];
      if (s.includes('GROUP BY type')) return [[]];
      if (s.includes('FROM contracts c')) return [[]];
      if (s.includes('FROM contract_customers')) return [[]];
      return [[], []];
    },
  };
}

export function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
