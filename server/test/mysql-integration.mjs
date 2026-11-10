import assert from 'node:assert/strict';
import { pool, ensureSchema } from '../src/db.js';
import { createApp } from '../src/app.js';

if (
  process.env.RUN_MYSQL_INTEGRATION !== '1' ||
  !/^zhongju_test_[a-f0-9]{8,}$/.test(process.env.DB_NAME || '')
)
  throw new Error(
    'Integration tests require an explicitly enabled, isolated zhongju_test_<random> database'
  );
const STAFF = 'integration-staff-passcode',
  ADMIN = 'integration-admin-passcode',
  SECRET = 'integration-signing-key-12345678901234567890';
let server;
try {
  // Start with the pre-upgrade schema to verify the additive migration.
  await pool.query(
    `CREATE TABLE cards (id VARCHAR(32) PRIMARY KEY, short_code VARCHAR(8) UNIQUE NOT NULL, name VARCHAR(64) NOT NULL, title VARCHAR(64) NOT NULL DEFAULT '', department VARCHAR(64) NOT NULL DEFAULT '', phone VARCHAR(16) NOT NULL, wechat VARCHAR(64) NOT NULL DEFAULT '', bio VARCHAR(128) NOT NULL DEFAULT '', avatar MEDIUMTEXT NULL, status ENUM('active','disabled') NOT NULL DEFAULT 'active', created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
  await pool.query(
    'INSERT INTO cards (id,short_code,name,phone,created_at,updated_at) VALUES (?,?,?,?,?,?)',
    ['history', 'abcd2345', '历史测试名片', '13800000000', 1, 1]
  );
  await ensureSchema();
  const [old] = await pool.query('SELECT name,owner_key FROM cards WHERE id=?', ['history']);
  assert.equal(old[0].name, '历史测试名片');
  assert.equal(old[0].owner_key, null);
  const app = createApp({
    pool,
    staffToken: STAFF,
    adminToken: ADMIN,
    tokenSecret: SECRET,
    dailyLimit: 2,
  });
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const req = async (path, { method = 'GET', body, token } = {}) => {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json() };
  };
  const login = async (deviceId, passcode = STAFF) =>
    (await req('/api/admin/login', { method: 'POST', body: { passcode, deviceId } })).data.token;
  const a = await login('a'.repeat(32)),
    b = await login('b'.repeat(32)),
    admin = await login('c'.repeat(32), ADMIN);
  assert.ok(a && b && admin);
  const card = {
    name: '集成测试',
    phone: '13800000000',
    title: '原职位',
    department: '测试部',
    wechat: '',
    bio: '',
    avatar: '',
  };
  const concurrent = await Promise.all(
    Array.from({ length: 5 }, () => req('/api/cards', { method: 'POST', body: card, token: a }))
  );
  assert.equal(concurrent.filter((result) => result.status === 200).length, 2);
  assert.equal(concurrent.filter((result) => result.status === 429).length, 3);
  const code = concurrent.find((result) => result.status === 200).data.record.shortCode;
  assert.equal((await req('/api/cards', { method: 'POST', body: card, token: b })).status, 200);
  assert.equal((await req(`/api/cards/${code}`, { method: 'DELETE', token: b })).status, 403);
  const edited = await req(`/api/cards/${code}`, {
    method: 'PUT',
    body: { ...card, title: '新职位' },
    token: a,
  });
  assert.equal(edited.status, 200);
  assert.equal(edited.data.record.shortCode, code);
  const seed = [];
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  for (let i = 0; i < 501; i++) {
    let n = i,
      s = '';
    for (let p = 0; p < 6; p++) {
      s = alphabet[n % alphabet.length] + s;
      n = Math.floor(n / alphabet.length);
    }
    seed.push([
      'seed' + i,
      'zz' + s,
      i === 0 ? 'literal%_=' : '分页名片',
      '13800000000',
      i + 10,
      i + 10,
    ]);
  }
  await pool.query('INSERT INTO cards (id,short_code,name,phone,created_at,updated_at) VALUES ?', [
    seed,
  ]);
  const last = await req('/api/cards?limit=100&offset=500', { token: admin });
  assert.equal(last.status, 200);
  assert.equal(last.data.total, 505);
  assert.equal(last.data.items.length, 5);
  const escaped = await req('/api/cards?q=' + encodeURIComponent('literal%_='), { token: admin });
  assert.equal(escaped.status, 200);
  assert.equal(escaped.data.total, 1);
  assert.equal(
    (
      await req('/api/cards/abcd2345/owner', {
        method: 'PUT',
        body: { deviceId: 'a'.repeat(32) },
        token: b,
      })
    ).status,
    403
  );
  assert.equal(
    (
      await req('/api/cards/abcd2345/owner', {
        method: 'PUT',
        body: { deviceId: 'a'.repeat(32) },
        token: admin,
      })
    ).status,
    200
  );
  const restored = await login('a'.repeat(32));
  const mine = await req('/api/cards/mine', { token: restored });
  assert.equal(mine.data.total, 3);
  await req('/api/admin/logout', { method: 'POST', token: restored });
  assert.equal((await req('/api/admin/me', { token: restored })).status, 401);
  console.log(
    'PASS real MySQL: legacy migration preserves rows; concurrent quota is atomic; ownership, update, session revocation, escaped search and pagination work'
  );
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  await pool.end();
}
