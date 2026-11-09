/**
 * 冒烟测试：内存假库跑通全部路由与角色鉴权（无需 MySQL）
 * 运行：node test/smoke.mjs
 */
import { createApp } from '../src/app.js';
import { fakePool } from './fakePool.mjs';

const ADMIN = 'admin-pass';
const STAFF = 'staff-pass';

let pass = 0;
let fail = 0;
function check(name, cond, extra = '') {
  if (cond) {
    pass++;
    console.log(`  ok  ${name}`);
  } else {
    fail++;
    console.error(`  FAIL ${name} ${extra}`);
  }
}

const pool = fakePool();
const app = createApp({ pool, adminToken: ADMIN, staffToken: STAFF, dailyLimit: 5 });
const server = app.listen(0);
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;

const okCard = {
  name: '张明远',
  title: '劳务派遣部 · 高级顾问',
  department: '劳务派遣部',
  phone: '13805341234',
  wechat: 'zhangmy2026',
  bio: '专注制造业用工方案，累计服务企业 60+ 家。',
  avatar: 'data:image/png;base64,AAAA',
};

async function login(passcode) {
  const r = await fetch(`${base}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passcode }),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

function auth(token) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

console.log('健康检查');
{
  const r = await fetch(`${base}/api/health`);
  check('GET /api/health 返回 200', r.status === 200);
}

console.log('登录换 token');
let staffToken = '';
let adminToken = '';
{
  const s = await login(STAFF);
  staffToken = s.body?.token || '';
  check('业务员口令登录成功', s.status === 200 && s.body?.role === 'staff');
  check('返回 token 与过期时间', !!staffToken && typeof s.body?.exp === 'number');

  const a = await login(ADMIN);
  adminToken = a.body?.token || '';
  check('管理员口令登录成功', a.status === 200 && a.body?.role === 'admin');

  const bad = await login('wrong-pass');
  check('错误口令返回 401', bad.status === 401);

  const empty = await login('');
  check('空口令返回 400', empty.status === 400);

  const me = await fetch(`${base}/api/admin/me`, { headers: auth(staffToken) });
  const meJson = await me.json();
  check('token 可查询当前身份', me.status === 200 && meJson.role === 'staff');

  const forged = await fetch(`${base}/api/admin/me`, {
    headers: auth(`${staffToken.slice(0, -2)}xx`),
  });
  check('被篡改的 token 返回 401', forged.status === 401);
}

console.log('创建名片（角色）');
let shortCode = '';
{
  const r0 = await fetch(`${base}/api/cards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(okCard),
  });
  check('未登录创建被拒绝 401', r0.status === 401, `got ${r0.status}`);

  const r1 = await fetch(`${base}/api/cards`, {
    method: 'POST',
    headers: auth(staffToken),
    body: JSON.stringify({ ...okCard, phone: '123' }),
  });
  check('非法手机号被拒绝 400', r1.status === 400);

  const r2 = await fetch(`${base}/api/cards`, {
    method: 'POST',
    headers: auth(staffToken),
    body: JSON.stringify(okCard),
  });
  const j = await r2.json();
  shortCode = j.record?.shortCode || '';
  check('业务员 token 创建成功', r2.status === 200 && j.ok === true);
  check('短码 8 位合法字符', /^[a-hj-km-np-z2-9]{8}$/.test(shortCode), shortCode);

  const r3 = await fetch(`${base}/api/cards`, {
    method: 'POST',
    headers: { ...auth(adminToken) },
    body: JSON.stringify({ ...okCard, name: '李经理', phone: '13805349999' }),
  });
  check('管理员 token 也能创建', r3.status === 200);

  const legacy = await fetch(`${base}/api/cards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Card-Token': STAFF },
    body: JSON.stringify({ ...okCard, name: '王经理', phone: '13805348888' }),
  });
  check('兼容旧版口令头创建', legacy.status === 200);
}

console.log('读取名片');
{
  const r = await fetch(`${base}/api/cards/${shortCode}`);
  const j = await r.json();
  check('短链公开可读', r.status === 200 && j.status === 'active');
  check('字段完整', j.record?.name === '张明远' && j.record?.phone === '13805341234');

  const r2 = await fetch(`${base}/api/cards/notexist`);
  check('不存在短码返回 404', r2.status === 404);
}

console.log('管理接口（仅管理员）');
{
  const s = await fetch(`${base}/api/cards`, { headers: auth(staffToken) });
  check('业务员不能看全量列表 403', s.status === 403, `got ${s.status}`);

  const a = await fetch(`${base}/api/cards?limit=10`, { headers: auth(adminToken) });
  const j = await a.json();
  check('管理员可看全量列表', a.status === 200 && Array.isArray(j.items));
  check('列表不含头像大字段', j.items.every((it) => !it.avatar));

  const ss = await fetch(`${base}/api/cards/${shortCode}/status`, {
    method: 'PATCH',
    headers: auth(staffToken),
    body: JSON.stringify({ status: 'disabled' }),
  });
  check('业务员不能停用名片 403', ss.status === 403);

  const pa = await fetch(`${base}/api/cards/${shortCode}/status`, {
    method: 'PATCH',
    headers: auth(adminToken),
    body: JSON.stringify({ status: 'disabled' }),
  });
  check('管理员停用成功', pa.status === 200);

  const pub = await fetch(`${base}/api/cards/${shortCode}`);
  const jp = await pub.json();
  check('停用后不返回联系方式', pub.status === 200 && jp.status === 'disabled' && !jp.record);

  await fetch(`${base}/api/cards/${shortCode}/status`, {
    method: 'PATCH',
    headers: auth(adminToken),
    body: JSON.stringify({ status: 'active' }),
  });

  const delStaff = await fetch(`${base}/api/cards/${shortCode}`, {
    method: 'DELETE',
    headers: auth(staffToken),
  });
  check('业务员不能删除 403', delStaff.status === 403);

  const del = await fetch(`${base}/api/cards/${shortCode}`, {
    method: 'DELETE',
    headers: auth(adminToken),
  });
  check('管理员删除成功', del.status === 200);

  const gone = await fetch(`${base}/api/cards/${shortCode}`);
  check('删除后 404', gone.status === 404);
}

console.log('创建限流');
{
  // 已成功创建 3 次（staff 1 + admin 1 + legacy 1），再 2 次后达 5 次上限
  for (let i = 0; i < 2; i++) {
    await fetch(`${base}/api/cards`, {
      method: 'POST',
      headers: auth(staffToken),
      body: JSON.stringify({ ...okCard, name: `员工${i}`, phone: `1390000000${i}` }),
    });
  }
  const over = await fetch(`${base}/api/cards`, {
    method: 'POST',
    headers: auth(staffToken),
    body: JSON.stringify({ ...okCard, name: '员工9', phone: '13900000009' }),
  });
  check('超出每日上限返回 429', over.status === 429, `got ${over.status}`);
}

server.close();
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
