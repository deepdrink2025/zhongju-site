/**
 * 冒烟测试：内存假库跑通统一认证、名片路由与角色鉴权（无需 MySQL）
 * 运行：node test/smoke.mjs
 */
import { createApp } from '../src/app.js';
import { fakePool, TEST_PASSWORDS } from './fakePool.mjs';

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
const app = createApp({ pool, dailyLimit: 5 });
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
  avatar: '',
};

async function login(username, password) {
  const r = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
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

console.log('统一账户登录');
let staffToken = '';
let adminToken = '';
let staff2Token = '';
let contractToken = '';
{
  const s = await login('staff', TEST_PASSWORDS.staff);
  staffToken = s.body?.token || '';
  check('业务员账号登录成功', s.status === 200 && s.body?.user?.role === 'staff');
  check('返回 token 与用户信息', !!staffToken && s.body?.user?.username === 'staff');

  const a = await login('admin', TEST_PASSWORDS.admin);
  adminToken = a.body?.token || '';
  check('主管理员登录成功', a.status === 200 && a.body?.user?.role === 'admin');

  const c = await login('contract', TEST_PASSWORDS.contract);
  contractToken = c.body?.token || '';
  check('合同管理员登录成功', c.status === 200 && c.body?.user?.role === 'contract_admin');

  const s2 = await login('staff2', TEST_PASSWORDS.staff2);
  staff2Token = s2.body?.token || '';

  const bad = await login('staff', 'wrong-password');
  check('错误密码返回 401', bad.status === 401);

  const empty = await login('', '');
  check('空账号密码返回 400', empty.status === 400);

  const me = await fetch(`${base}/api/auth/me`, { headers: auth(staffToken) });
  const meJson = await me.json();
  check('token 可查询当前身份', me.status === 200 && meJson.user?.username === 'staff');

  const forged = await fetch(`${base}/api/auth/me`, {
    headers: auth(`${staffToken.slice(0, -2)}xx`),
  });
  check('被篡改的 token 返回 401', forged.status === 401);

  const noAuth = await fetch(`${base}/api/cards`, { headers: { 'X-Card-Token': 'legacy' } });
  check('旧口令头已彻底失效', noAuth.status === 401);
}

console.log('创建名片（角色与配额）');
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
  check('业务员创建成功', r2.status === 200 && j.ok === true);
  check('短码 8 位合法字符', /^[a-hj-km-np-z2-9]{8}$/.test(shortCode), shortCode);
  check('创建记录带归属用户', j.record?.ownerUserId === 2);

  const r3 = await fetch(`${base}/api/cards`, {
    method: 'POST',
    headers: auth(adminToken),
    body: JSON.stringify({ ...okCard, name: '李经理', phone: '13805349999' }),
  });
  check('管理员也能创建', r3.status === 200);

  const contractTry = await fetch(`${base}/api/cards`, {
    method: 'POST',
    headers: auth((await login('contract', TEST_PASSWORDS.contract)).body.token),
    body: JSON.stringify({ ...okCard, name: '合同员', phone: '13805347777' }),
  });
  check('合同管理员无名片权限 403', contractTry.status === 403);
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

console.log('管理接口（权限）');
{
  const s = await fetch(`${base}/api/cards`, { headers: auth(staffToken) });
  check('业务员不能看全量列表 403', s.status === 403, `got ${s.status}`);

  const a = await fetch(`${base}/api/cards?limit=10`, { headers: auth(adminToken) });
  const j = await a.json();
  check('管理员可看全量列表', a.status === 200 && Array.isArray(j.items));
  check(
    '列表不含头像大字段',
    j.items.every((it) => !it.avatar)
  );

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
    headers: auth(staff2Token),
  });
  check('业务员不能删除他人名片 403', delStaff.status === 403);

  const mine = await fetch(`${base}/api/cards/mine`, { headers: auth(staff2Token) });
  const jm = await mine.json();
  check('业务员只能看到本人名片', mine.status === 200 && jm.total === 0);
}

console.log('归属改派');
{
  const assign = await fetch(`${base}/api/cards/${shortCode}/owner`, {
    method: 'PUT',
    headers: auth(adminToken),
    body: JSON.stringify({ user_id: 3 }),
  });
  check('管理员改派归属成功', assign.status === 200);

  const edit = await fetch(`${base}/api/cards/${shortCode}`, {
    method: 'PUT',
    headers: auth(staff2Token),
    body: JSON.stringify({ ...okCard, title: '改派后的职位' }),
  });
  check('新归属人可编辑名片', edit.status === 200);

  const mine = await fetch(`${base}/api/cards/mine`, { headers: auth(staff2Token) });
  const jm = await mine.json();
  check('改派后出现在新归属人列表', mine.status === 200 && jm.total === 1);
}

console.log('每日配额（按账号）');
{
  // 当前 staff 已创建 1 张，再建 4 张后达到上限
  for (let i = 0; i < 4; i++) {
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

  const other = await fetch(`${base}/api/cards`, {
    method: 'POST',
    headers: auth(staff2Token),
    body: JSON.stringify({ ...okCard, name: '另一个人', phone: '13900000088' }),
  });
  check('配额按账号独立统计', other.status === 200);
}

console.log('合同接口（统一后台挂载）');
{
  const list = await fetch(`${base}/api/contract/contracts?page=1&page_size=10`, {
    headers: auth(adminToken),
  });
  const lj = await list.json().catch(() => null);
  check('合同列表可访问', list.status === 200 && lj?.total === 0 && Array.isArray(lj?.contracts));

  const staffList = await fetch(`${base}/api/contract/contracts`, { headers: auth(staff2Token) });
  const sj = await staffList.json().catch(() => null);
  check('业务员可读本人合同列表', staffList.status === 200 && Array.isArray(sj?.contracts));

  const stats = await fetch(`${base}/api/contract/contracts/stats`, { headers: auth(adminToken) });
  const stj = await stats.json().catch(() => null);
  check(
    '合同统计返回总览与分类',
    stats.status === 200 && stj?.overview?.total === 0 && stj?.categories?.length === 3,
    `got ${stats.status}`
  );

  const staffUsers = await fetch(`${base}/api/contract/users`, { headers: auth(staff2Token) });
  check('业务员不能访问用户管理 403', staffUsers.status === 403);

  const caCreate = await fetch(`${base}/api/contract/users`, {
    method: 'POST',
    headers: auth(contractToken),
    body: JSON.stringify({ name: '新同事', username: 'newbie', password: 'newbie-pass-123', role: 'staff' }),
  });
  check('合同管理员不能新建账号 403', caCreate.status === 403);

  const adminCreate = await fetch(`${base}/api/contract/users`, {
    method: 'POST',
    headers: auth(adminToken),
    body: JSON.stringify({ name: '新同事', username: 'newbie', password: 'newbie-pass-123', role: 'staff' }),
  });
  check('主管理员可新建账号', adminCreate.status === 200, `got ${adminCreate.status}`);

  const userList = await fetch(`${base}/api/contract/users`, { headers: auth(adminToken) });
  const uj = await userList.json().catch(() => null);
  check(
    '账号列表包含新建账号（改派归属下拉可用）',
    userList.status === 200 && uj?.users?.some((u) => u.username === 'newbie'),
    `count=${uj?.users?.length}`
  );
}

console.log('退出登录');
{
  const out = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: auth(staffToken) });
  check('退出成功', out.status === 200);
  const me = await fetch(`${base}/api/auth/me`, { headers: auth(staffToken) });
  check('退出后 token 失效', me.status === 401);
}

server.close();
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
