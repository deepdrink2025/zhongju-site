/**
 * 冒烟测试：内存假库跑通统一认证、名片路由与角色鉴权（无需 MySQL）
 * 角色模型：仅 admin / contract_admin 两种登录账号；业务负责人档案在 contract_owners，与账号解耦
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
let adminToken = '';
let contractToken = '';
{
  const a = await login('admin', TEST_PASSWORDS.admin);
  adminToken = a.body?.token || '';
  check('主管理员登录成功', a.status === 200 && a.body?.user?.role === 'admin');
  check('返回 token 与用户信息', !!adminToken && a.body?.user?.username === 'admin');

  const c = await login('contract', TEST_PASSWORDS.contract);
  contractToken = c.body?.token || '';
  check('合同管理员登录成功', c.status === 200 && c.body?.user?.role === 'contract_admin');

  const s = await login('staff', TEST_PASSWORDS.staff);
  check('业务员账号无法登录（已退出账号体系）', s.status === 401);

  const bad = await login('admin', 'wrong-password');
  check('错误密码返回 401', bad.status === 401);

  const empty = await login('', '');
  check('空账号密码返回 400', empty.status === 400);

  const me = await fetch(`${base}/api/auth/me`, { headers: auth(adminToken) });
  const meJson = await me.json();
  check('token 可查询当前身份', me.status === 200 && meJson.user?.username === 'admin');

  const forged = await fetch(`${base}/api/auth/me`, {
    headers: auth(`${adminToken.slice(0, -2)}xx`),
  });
  check('被篡改的 token 返回 401', forged.status === 401);

  const noAuth = await fetch(`${base}/api/cards`, { headers: { 'X-Card-Token': 'legacy' } });
  check('旧口令头已彻底失效', noAuth.status === 401);
}

console.log('创建名片（仅主管理员）');
let shortCode = '';
{
  const r0 = await fetch(`${base}/api/cards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(okCard),
  });
  check('未登录创建被拒绝 401', r0.status === 401, `got ${r0.status}`);

  const rc = await fetch(`${base}/api/cards`, {
    method: 'POST',
    headers: auth(contractToken),
    body: JSON.stringify({ ...okCard, phone: '13805340001' }),
  });
  check('合同管理员无名片权限 403', rc.status === 403, `got ${rc.status}`);

  const r1 = await fetch(`${base}/api/cards`, {
    method: 'POST',
    headers: auth(adminToken),
    body: JSON.stringify({ ...okCard, phone: '123' }),
  });
  check('非法手机号被拒绝 400', r1.status === 400);

  const r2 = await fetch(`${base}/api/cards`, {
    method: 'POST',
    headers: auth(adminToken),
    body: JSON.stringify(okCard),
  });
  const j = await r2.json();
  shortCode = j.record?.shortCode || '';
  check('主管理员创建名片成功', r2.status === 200 && j.ok === true);
  check('短码 8 位合法字符', /^[a-hj-km-np-z2-9]{8}$/.test(shortCode), shortCode);
  check('创建记录带归属用户', j.record?.ownerUserId === 1);
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
  const c = await fetch(`${base}/api/cards`, { headers: auth(contractToken) });
  check('合同管理员不能看全量列表 403', c.status === 403, `got ${c.status}`);

  const a = await fetch(`${base}/api/cards?limit=10`, { headers: auth(adminToken) });
  const j = await a.json();
  check('管理员可看全量列表', a.status === 200 && Array.isArray(j.items));
  check('列表不含头像大字段', j.items.every((it) => !it.avatar));

  const pa = await fetch(`${base}/api/cards/${shortCode}/status`, {
    method: 'PATCH',
    headers: auth(adminToken),
    body: JSON.stringify({ status: 'disabled' }),
  });
  check('管理员停用成功', pa.status === 200);

  const pub = await fetch(`${base}/api/cards/${shortCode}`);
  const pj = await pub.json();
  check('停用后不返回联系方式', pub.status === 200 && pj.status === 'disabled');

  const re = await fetch(`${base}/api/cards/${shortCode}/status`, {
    method: 'PATCH',
    headers: auth(adminToken),
    body: JSON.stringify({ status: 'active' }),
  });
  check('管理员重新启用成功', re.status === 200);

  const mine = await fetch(`${base}/api/cards/mine`, { headers: auth(adminToken) });
  const jm = await mine.json();
  check('管理员可看本人名片列表', mine.status === 200 && jm.total >= 1);
}

console.log('每日配额（按账号）');
{
  // 当前 admin 已创建 1 张，再建 4 张后达到上限
  for (let i = 0; i < 4; i++) {
    await fetch(`${base}/api/cards`, {
      method: 'POST',
      headers: auth(adminToken),
      body: JSON.stringify({ ...okCard, name: `员工${i}`, phone: `1390000000${i}` }),
    });
  }
  const over = await fetch(`${base}/api/cards`, {
    method: 'POST',
    headers: auth(adminToken),
    body: JSON.stringify({ ...okCard, name: '员工9', phone: '13900000009' }),
  });
  check('超出每日上限返回 429', over.status === 429, `got ${over.status}`);

  const q = await fetch(`${base}/api/quota`, { headers: auth(adminToken) });
  const qj = await q.json();
  check('配额按账号统计', q.status === 200 && qj.quota?.used === 5 && qj.quota?.remaining === 0);
}

console.log('合同接口（业务负责人档案）');
{
  const owners = await fetch(`${base}/api/contract/owners`, { headers: auth(contractToken) });
  const oj = await owners.json();
  check('负责人列表可查（含迁移档案）', owners.status === 200 && oj.owners?.some((o) => o.name === '业务员甲'));

  const future = (n) => {
    const d = new Date(Date.now() + n * 86400000);
    return d.toISOString().slice(0, 10);
  };
  const baseBody = {
    name: '测试合同',
    type: '劳务派遣',
    customer_name: '德州某某机械有限公司',
    sign_date: future(-1),
    start_date: future(0),
    end_date: future(365),
    invoice_type: '全额专票',
  };

  // 新姓名：owner_user_id 留空，仅传 owner_name → 自动建档
  const c1 = await fetch(`${base}/api/contract/contracts`, {
    method: 'POST',
    headers: auth(contractToken),
    body: JSON.stringify({ ...baseBody, owner_name: '王新员' }),
  });
  const c1j = await c1.json();
  check('新业务负责人自动建档并保存合同', c1.status === 200, `got ${c1.status} ${JSON.stringify(c1j)}`);

  const owners2 = await fetch(`${base}/api/contract/owners`, { headers: auth(contractToken) });
  const oj2 = await owners2.json();
  check('新姓名已出现在负责人列表', oj2.owners?.some((o) => o.name === '王新员'));

  // 已有档案：owner_user_id 选择
  const owner = oj2.owners?.find((o) => o.name === '王新员');
  const c2 = await fetch(`${base}/api/contract/contracts`, {
    method: 'POST',
    headers: auth(adminToken),
    body: JSON.stringify({ ...baseBody, owner_user_id: owner?.id }),
  });
  check('按 owner_user_id 选择已有负责人成功', c2.status === 200, `got ${c2.status}`);

  const c3 = await fetch(`${base}/api/contract/contracts`, {
    method: 'POST',
    headers: auth(adminToken),
    body: JSON.stringify({ ...baseBody, owner_user_id: 9999 }),
  });
  check('不存在的负责人返回 400', c3.status === 400);

  const c4 = await fetch(`${base}/api/contract/contracts`, {
    method: 'POST',
    headers: auth(adminToken),
    body: JSON.stringify({ ...baseBody }),
  });
  check('缺少业务负责人返回 400', c4.status === 400);

  const list = await fetch(`${base}/api/contract/contracts`, { headers: auth(contractToken) });
  const lj = await list.json();
  check('合同列表可访问', list.status === 200 && Array.isArray(lj?.contracts));

  const stats = await fetch(`${base}/api/contract/contracts/stats`, { headers: auth(contractToken) });
  check('合同统计返回总览与分类', stats.status === 200);
}

console.log('用户管理（仅两种登录角色）');
{
  const cu = await fetch(`${base}/api/contract/users`, { headers: auth(contractToken) });
  const cuj = await cu.json();
  check('账号列表不含业务员', cu.status === 200 && !cuj.users?.some((u) => u.role === 'staff'));

  const caCreate = await fetch(`${base}/api/contract/users`, {
    method: 'POST',
    headers: auth(contractToken),
    body: JSON.stringify({ name: '越权', username: 'nope', role: 'contract_admin', password: 'password123' }),
  });
  check('合同管理员不能新建账号 403', caCreate.status === 403);

  const staffRole = await fetch(`${base}/api/contract/users`, {
    method: 'POST',
    headers: auth(adminToken),
    body: JSON.stringify({ name: '业务员', username: 'staff-new', role: 'staff', password: 'password123' }),
  });
  check('业务员角色不可再创建 400', staffRole.status === 400);

  const adminCreate = await fetch(`${base}/api/contract/users`, {
    method: 'POST',
    headers: auth(adminToken),
    body: JSON.stringify({ name: '新账号', username: 'newbie', role: 'contract_admin', password: 'password123' }),
  });
  check('主管理员可新建账号', adminCreate.status === 200, `got ${adminCreate.status}`);

  const userList = await fetch(`${base}/api/contract/users`, { headers: auth(adminToken) });
  const uj = await userList.json();
  check(
    '账号列表包含新建账号',
    userList.status === 200 && uj?.users?.some((u) => u.username === 'newbie'),
    `count=${uj?.users?.length}`
  );
}

console.log('退出登录');
{
  const out = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: auth(adminToken) });
  check('退出成功', out.status === 200);
  const me = await fetch(`${base}/api/auth/me`, { headers: auth(adminToken) });
  check('退出后 token 失效', me.status === 401);
}

server.close();
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
