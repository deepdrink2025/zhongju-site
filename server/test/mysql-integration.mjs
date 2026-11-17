import assert from 'node:assert/strict';
import { pool, ensureSchema, migrateCardOwnership } from '../src/db.js';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/contracts/util.js';

if (
  process.env.RUN_MYSQL_INTEGRATION !== '1' ||
  !/^zhongju_test_[a-f0-9]{8,}$/.test(process.env.DB_NAME || '')
)
  throw new Error(
    'Integration tests require an explicitly enabled, isolated zhongju_test_<random> database'
  );
let server;
try {
  // 1. 模拟升级前的旧表（无 owner_user_id、无 users 表）
  await pool.query(
    `CREATE TABLE cards (id VARCHAR(32) PRIMARY KEY, short_code VARCHAR(8) UNIQUE NOT NULL, name VARCHAR(64) NOT NULL, title VARCHAR(64) NOT NULL DEFAULT '', department VARCHAR(64) NOT NULL DEFAULT '', phone VARCHAR(16) NOT NULL, wechat VARCHAR(64) NOT NULL DEFAULT '', bio VARCHAR(128) NOT NULL DEFAULT '', avatar MEDIUMTEXT NULL, status ENUM('active','disabled') NOT NULL DEFAULT 'active', created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, owner_key CHAR(64) NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
  await pool.query(
    'INSERT INTO cards (id,short_code,name,phone,created_at,updated_at) VALUES (?,?,?,?,?,?)',
    ['history', 'abcd2345', '历史测试名片', '13800000000', 1, 1]
  );
  await ensureSchema();

  // 2. 创建账号：仅 admin / contract_admin 两种登录角色
  const accounts = [
    ['主管理员', 'admin', 'admin', 'integration-admin-pass'],
    ['合同管理员', 'contract', 'contract_admin', 'integration-contract-pass'],
  ];
  for (const [name, username, role, password] of accounts) {
    const { salt, hash } = hashPassword(password);
    await pool.query(
      'INSERT INTO users (name, username, role, salt, password_hash) VALUES (?, ?, ?, ?, ?)',
      [name, username, role, salt, hash]
    );
  }
  // 3. 迁移语义验证：存量业务员账号在 ensureSchema 后应被停用且不可登录
  {
    const { salt, hash } = hashPassword('integration-staff-pass');
    await pool.query(
      'INSERT INTO users (name, username, role, salt, password_hash) VALUES (?, ?, ?, ?, ?)',
      ['业务员甲', 'staff', 'staff', salt, hash]
    );
  }
  await ensureSchema(); // 幂等重跑：应停用 staff 并完成外键切换
  const [staffRow] = await pool.query("SELECT status FROM users WHERE username='staff'");
  assert.equal(staffRow[0].status, 'disabled');
  const [ownerRow] = await pool.query("SELECT id, status FROM contract_owners WHERE name='业务员甲'");
  assert.equal(ownerRow.length, 1);
  assert.equal(ownerRow[0].status, 'active');

  // 4. 存量名片归属迁移：无归属 → 主管理员
  assert.equal(await migrateCardOwnership(), 1);
  const [old] = await pool.query('SELECT name, owner_user_id FROM cards WHERE id=?', ['history']);
  assert.equal(old[0].name, '历史测试名片');
  assert.equal(Number(old[0].owner_user_id), 1);

  const app = createApp({ pool, dailyLimit: 2 });
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
  const login = async (username, password) => {
    const r = await req('/api/auth/login', { method: 'POST', body: { username, password } });
    return { status: r.status, token: r.data?.token };
  };
  const admin = (await login('admin', 'integration-admin-pass')).token;
  const contract = (await login('contract', 'integration-contract-pass')).token;
  assert.ok(admin && contract);
  assert.equal((await login('staff', 'integration-staff-pass')).status, 401);

  // 5. 名片仅主管理员可创建，配额按账号统计
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
    Array.from({ length: 5 }, () => req('/api/cards', { method: 'POST', body: card, token: admin }))
  );
  assert.equal(concurrent.filter((result) => result.status === 200).length, 2);
  assert.equal(concurrent.filter((result) => result.status === 429).length, 3);
  assert.equal((await req('/api/cards', { method: 'POST', body: card, token: contract })).status, 403);
  const code = concurrent.find((result) => result.status === 200).data.record.shortCode;
  const edited = await req(`/api/cards/${code}`, {
    method: 'PUT',
    body: { ...card, title: '新职位' },
    token: admin,
  });
  assert.equal(edited.status, 200);
  assert.equal(edited.data.record.shortCode, code);

  // 6. 分页与转义搜索
  const seed = [];
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  for (let i = 0; i < 501; i++) {
    let n = i,
      s = '';
    for (let p = 0; p < 6; p++) {
      s = alphabet[n % alphabet.length] + s;
      n = Math.floor(n / alphabet.length);
    }
    seed.push(['seed' + i, 'zz' + s, i === 0 ? 'literal%_=' : '分页名片', '13800000000', i + 10, i + 10, 1]);
  }
  await pool.query(
    'INSERT INTO cards (id,short_code,name,phone,created_at,updated_at,owner_user_id) VALUES ?',
    [seed]
  );
  const last = await req('/api/cards?limit=100&offset=500', { token: admin });
  assert.equal(last.status, 200);
  assert.equal(last.data.total, 504);
  assert.equal(last.data.items.length, 4);
  const escaped = await req('/api/cards?q=' + encodeURIComponent('literal%_='), { token: admin });
  assert.equal(escaped.status, 200);
  assert.equal(escaped.data.total, 1);

  // 7. 合同业务负责人：新姓名自动建档、按 id 选择、非法 id 拒绝
  const future = (n) => {
    const d = new Date(Date.now() + n * 86400000);
    return d.toISOString().slice(0, 10);
  };
  const baseBody = {
    name: '集成测试合同',
    type: '劳务派遣',
    customer_name: '德州某某机械有限公司',
    sign_date: future(-1),
    start_date: future(0),
    end_date: future(365),
    invoice_type: '全额专票',
  };
  const created = await req('/api/contract/contracts', {
    method: 'POST',
    token: contract,
    body: { ...baseBody, owner_name: '王新员' },
  });
  assert.equal(created.status, 200);
  const owners = (await req('/api/contract/owners', { token: contract })).data.owners;
  const owner = owners.find((o) => o.name === '王新员');
  assert.ok(owner);
  assert.equal(
    (
      await req('/api/contract/contracts', {
        method: 'POST',
        token: admin,
        body: { ...baseBody, owner_user_id: owner.id },
      })
    ).status,
    200
  );
  assert.equal(
    (
      await req('/api/contract/contracts', {
        method: 'POST',
        token: admin,
        body: { ...baseBody, owner_user_id: 99999 },
      })
    ).status,
    400
  );

  // 8. 归属改派（名片）：仅主管理员可改派
  assert.equal(
    (
      await req('/api/cards/abcd2345/owner', {
        method: 'PUT',
        body: { user_id: 1 },
        token: contract,
      })
    ).status,
    403
  );
  assert.equal(
    (
      await req('/api/cards/abcd2345/owner', {
        method: 'PUT',
        body: { user_id: 1 },
        token: admin,
      })
    ).status,
    200
  );
  const mine = await req('/api/cards/mine', { token: admin });
  assert.equal(mine.data.total, 3);
  await req('/api/auth/logout', { method: 'POST', token: admin });
  assert.equal((await req('/api/auth/me', { token: admin })).status, 401);
  console.log(
    'PASS real MySQL: two-role accounts, staff deprecation migration, owner archiving, legacy card migration, concurrent quota, ownership reassignment, escaped search and pagination work'
  );
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  await pool.end();
}
