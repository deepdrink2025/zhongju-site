import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createApp } from '../src/app.js';
import { fakePool } from './fakePool.mjs';
import {
  quotaClock,
  validateProductionSecrets,
  WindowLimiter,
  trustProxyConfig,
} from '../src/security.js';

const STAFF = 'test-staff-passcode-1234',
  ADMIN = 'test-admin-passcode-1234',
  SECRET = 'test-signing-key-12345678901234567890';
const DEVICE_A = 'a'.repeat(32),
  DEVICE_B = 'b'.repeat(32),
  DEVICE_ADMIN = 'c'.repeat(32);
const CARD = {
  name: '回归测试',
  phone: '13800000000',
  title: '业务顾问',
  department: '业务部',
  wechat: 'test',
  bio: '测试',
  avatar: '',
};
async function fixture(t, options = {}) {
  const pool = options.pool || fakePool();
  const app = createApp({
    pool,
    staffToken: STAFF,
    adminToken: ADMIN,
    tokenSecret: SECRET,
    ...options,
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const req = async (path, { method = 'GET', body, token, headers = {} } = {}) => {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, headers: response.headers, data: await response.json() };
  };
  const login = async (device = DEVICE_A, passcode = STAFF) => {
    const result = await req('/api/admin/login', {
      method: 'POST',
      body: { passcode, deviceId: device },
    });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    return result.data.token;
  };
  return { pool, base, req, login };
}

test('forged forwarding headers cannot reset login limits; legacy passcodes are rejected', async (t) => {
  const f = await fixture(t, { loginLimit: 2 });
  const status = [];
  for (const ip of ['198.51.100.1', '198.51.100.1', '198.51.100.2'])
    status.push(
      (
        await f.req('/api/admin/login', {
          method: 'POST',
          body: { passcode: 'wrong' },
          headers: { 'X-Forwarded-For': ip },
        })
      ).status
    );
  assert.deepEqual(status, [401, 401, 429]);
  assert.equal((await f.req('/api/cards', { headers: { 'X-Card-Token': ADMIN } })).status, 401);
  assert.equal(trustProxyConfig('false'), false);
  assert.throws(() => trustProxyConfig('true'));
});
test('successful logins do not consume the failure allowance', async (t) => {
  const f = await fixture(t, { loginLimit: 2 });
  for (let i = 0; i < 4; i++) await f.login();
  assert.equal(
    (await f.req('/api/admin/login', { method: 'POST', body: { passcode: 'wrong' } })).status,
    401
  );
});
test('device quota persists, does not share a NAT quota, and restores the same assets', async (t) => {
  const f = await fixture(t, { dailyLimit: 1 });
  const a = await f.login(),
    b = await f.login(DEVICE_B);
  const first = await f.req('/api/cards', { method: 'POST', body: CARD, token: a });
  assert.equal(first.status, 200);
  assert.equal(
    (
      await f.req('/api/cards', {
        method: 'POST',
        body: CARD,
        token: a,
        headers: { 'X-Forwarded-For': '203.0.113.5' },
      })
    ).status,
    429
  );
  assert.equal((await f.req('/api/cards', { method: 'POST', body: CARD, token: b })).status, 200);
  const restored = await f.login(DEVICE_A);
  const mine = await f.req('/api/cards/mine', { token: restored });
  assert.equal(mine.data.total, 1);
  assert.equal(mine.data.items[0].shortCode, first.data.record.shortCode);
  const quota = await f.req('/api/quota', { token: restored });
  assert.equal(quota.data.quota.remaining, 0);
  assert.equal(quota.data.quota.timeZone, 'Asia/Shanghai');
  const restart = await fixture(t, { pool: f.pool, dailyLimit: 1 });
  const afterRestart = await restart.login();
  assert.equal(
    (await restart.req('/api/cards', { method: 'POST', body: CARD, token: afterRestart })).status,
    429
  );
});
test('only the owner or administrator can edit/delete; editing preserves the short link', async (t) => {
  const f = await fixture(t);
  const a = await f.login(),
    b = await f.login(DEVICE_B),
    admin = await f.login(DEVICE_ADMIN, ADMIN);
  const created = await f.req('/api/cards', { method: 'POST', body: CARD, token: a });
  const code = created.data.record.shortCode;
  for (const [path, method, body] of [
    [`/api/cards/${code}`, 'DELETE', undefined],
    [`/api/cards/${code}`, 'PUT', CARD],
    [`/api/cards/${code}/manage`, 'GET', undefined],
  ])
    assert.equal((await f.req(path, { method, body, token: b })).status, 403);
  const updated = await f.req(`/api/cards/${code}`, {
    method: 'PUT',
    body: { ...CARD, title: '更新职位' },
    token: a,
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.record.shortCode, code);
  assert.equal((await f.req('/api/quota', { token: a })).data.quota.used, 1);
  const publicCard = await f.req(`/api/cards/${code}`);
  assert.equal(publicCard.data.record.title, '更新职位');
  assert.equal(publicCard.headers.get('cache-control'), 'no-store');
  assert.equal('owner' in publicCard.data.record, false);
  assert.equal(
    (
      await f.req(`/api/cards/${code}/status`, {
        method: 'PATCH',
        body: { status: 'disabled' },
        token: a,
      })
    ).status,
    403
  );
  await f.req(`/api/cards/${code}/status`, {
    method: 'PATCH',
    body: { status: 'disabled' },
    token: admin,
  });
  assert.equal((await f.req(`/api/cards/${code}`)).data.record, undefined);
  assert.equal((await f.req(`/api/cards/${code}`, { method: 'DELETE', token: a })).status, 200);
});
test('passcode rotation revokes the relevant role and logout revokes a stored session', async (t) => {
  const f = await fixture(t);
  const staff = await f.login(),
    admin = await f.login(DEVICE_ADMIN, ADMIN);
  const rotated = await fixture(t, { pool: f.pool, staffToken: STAFF + 'changed' });
  assert.equal((await rotated.req('/api/admin/me', { token: staff })).status, 401);
  assert.equal((await rotated.req('/api/admin/me', { token: admin })).status, 200);
  assert.equal((await f.req('/api/admin/logout', { method: 'POST', token: staff })).status, 200);
  const restart = await fixture(t, { pool: f.pool });
  assert.equal((await restart.req('/api/admin/me', { token: staff })).status, 401);
});
test('avatar validation rejects external/SVG/malformed/oversized images and normalizes a real PNG', async (t) => {
  const f = await fixture(t);
  const token = await f.login();
  for (const avatar of [
    'https://example.invalid/pixel.gif',
    'data:image/svg+xml;base64,AAAA',
    'data:image/png;base64,AAAA',
    'A'.repeat(350001),
  ])
    assert.equal(
      (await f.req('/api/cards', { method: 'POST', body: { ...CARD, avatar }, token })).status,
      400
    );
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#ff6633' } })
    .png()
    .toBuffer();
  const valid = await f.req('/api/cards', {
    method: 'POST',
    body: { ...CARD, avatar: 'data:image/png;base64,' + png.toString('base64') },
    token,
  });
  assert.equal(valid.status, 200);
  assert.match(valid.data.record.avatar, /^data:image\/jpeg;base64,/);
  const meta = await sharp(
    Buffer.from(valid.data.record.avatar.split(',')[1], 'base64')
  ).metadata();
  assert.equal(meta.width, 180);
  assert.equal(meta.height, 180);
});
test('admin search/pagination reaches old rows beyond 500, and invalid pagination returns 400', async (t) => {
  const f = await fixture(t);
  const token = await f.login(DEVICE_ADMIN, ADMIN);
  for (let i = 0; i < 601; i++)
    f.pool.rows.push({
      ...CARD,
      id: String(i).padStart(8, '0'),
      short_code: String(i).padStart(8, '0'),
      status: i % 2 ? 'active' : 'disabled',
      created_at: i,
      updated_at: i,
      owner_key: null,
      name: i === 0 ? '最旧名片' : '员工',
    });
  const first = await f.req('/api/cards?limit=100', { token });
  assert.equal(first.data.total, 601);
  assert.equal(first.data.items.length, 100);
  const last = await f.req('/api/cards?limit=100&offset=600', { token });
  assert.equal(last.data.items[0].name, '最旧名片');
  const search = await f.req('/api/cards?q=' + encodeURIComponent('最旧') + '&status=disabled', {
    token,
  });
  assert.equal(search.data.total, 1);
  for (const query of ['limit=-1', 'limit=1.5', 'offset=-2', 'status=unknown'])
    assert.equal((await f.req('/api/cards?' + query, { token })).status, 400);
});
test('JSON/client errors keep their HTTP status and health details remain private', async (t) => {
  const f = await fixture(t);
  const malformed = await fetch(f.base + '/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{',
  });
  assert.equal(malformed.status, 400);
  const tooLarge = await fetch(f.base + '/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passcode: 'A'.repeat(600000) }),
  });
  assert.equal(tooLarge.status, 413);
  f.pool.query = async () => {
    throw new Error('private database endpoint');
  };
  const health = await f.req('/api/health');
  assert.equal(health.status, 503);
  assert.ok(!JSON.stringify(health.data).includes('private database'));
});
test('production configuration rejects equal, weak and placeholder credentials', () => {
  assert.throws(() =>
    validateProductionSecrets({ staffToken: STAFF, adminToken: STAFF, tokenSecret: SECRET })
  );
  assert.throws(() =>
    validateProductionSecrets({ staffToken: 'short', adminToken: ADMIN, tokenSecret: SECRET })
  );
  validateProductionSecrets({ staffToken: STAFF, adminToken: ADMIN, tokenSecret: SECRET });
});
test('limiter memory is bounded and expired keys are removed; business timezone controls reset', () => {
  const limiter = new WindowLimiter(2, 1000, 2);
  assert.ok(limiter.consume('a', 100));
  assert.ok(limiter.consume('b', 100));
  assert.equal(limiter.consume('c', 100), false);
  assert.equal(limiter.entries.size, 2);
  assert.ok(limiter.consume('c', 2000));
  assert.equal(limiter.entries.size, 1);
  const info = quotaClock('Asia/Shanghai')(Date.parse('2026-11-10T15:59:59Z'));
  assert.equal(info.day, '2026-11-10');
  assert.ok(Math.abs(info.resetAt - Date.parse('2026-11-10T16:00:00Z')) <= 1000);
});
