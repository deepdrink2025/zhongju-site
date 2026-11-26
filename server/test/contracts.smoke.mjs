import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { createSession } from '../src/auth.js';
import { createContractRouter } from '../src/contracts/router.js';
import { fakePool } from './fakePool.mjs';
import {
  hashPassword,
  verifyPassword,
  sanitizeContract,
  computeDisplayStatus,
  validateContractInput,
  validateCustomerInput,
  CONTRACT_TYPES,
  DEFAULT_INTERNAL_INVOICE_TYPE,
  MAX_FILE_SIZE,
} from '../src/contracts/util.js';

test('密码哈希与校验', () => {
  const { salt, hash } = hashPassword('s3cretPass!');
  assert.equal(salt.length, 32);
  assert.equal(hash.length, 64);
  assert.equal(verifyPassword('s3cretPass!', salt, hash), true);
  assert.equal(verifyPassword('wrong', salt, hash), false);
});

test('金额对所有登录角色可见（业务员已退出账号体系）', () => {
  const row = { id: 1, amount: 12345.5, end_date: '2099-01-01', status: 'active', deleted_at: null };
  assert.equal('amount' in sanitizeContract(row, 'admin'), true);
  assert.equal('amount' in sanitizeContract(row, 'contract_admin'), true);
});

test('展示状态计算', () => {
  const now = new Date('2026-11-14T00:00:00');
  const mk = (end, status = 'active', deleted = null) => ({ end_date: end, status, deleted_at: deleted });
  assert.equal(computeDisplayStatus(mk('2027-06-30'), now), '生效中');
  assert.equal(computeDisplayStatus(mk('2026-12-01'), now), '即将到期');
  assert.equal(computeDisplayStatus(mk('2026-11-10'), now), '已到期');
  assert.equal(computeDisplayStatus(mk('2027-01-01', 'terminated'), now), '已终止');
  assert.equal(computeDisplayStatus(mk('2027-01-01', 'renewed'), now), '已续签');
  assert.equal(computeDisplayStatus(mk('2027-01-01', 'active', '2026-11-01'), now), '已删除');
});

test('合同字段校验', () => {
  const ok = validateContractInput({
    name: '测试合同', type: CONTRACT_TYPES[0], customer_name: '德州某某机械有限公司', owner_user_id: 2,
    invoice_type: '全额专票', amount: '120000', amount_unit: '元/月/人', headcount: '30',
    sign_date: '2026-01-01', start_date: '2026-01-02', end_date: '2027-01-01',
  });
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.values.amount, 120000);
  assert.equal(ok.values.amount_unit, '元/月/人');
  assert.equal(ok.values.headcount, 30);
  assert.equal(ok.values.customer_name, '德州某某机械有限公司');

  const bad = validateContractInput({ name: '', type: '不存在', customer_name: '' });
  assert.ok(bad.errors.length >= 4);

  const noInvoice = validateContractInput({
    name: 'x', type: '其他', customer_name: '某单位', owner_user_id: 1,
    sign_date: '2026-01-01', start_date: '2026-01-02', end_date: '2027-01-01',
  });
  assert.ok(noInvoice.errors.some((e) => e.includes('发票类型')));

  const badAmount = validateContractInput({
    name: 'x', type: '其他', customer_name: '某单位', owner_user_id: 1, invoice_type: '差额普票',
    sign_date: '2026-01-01', start_date: '2026-01-02', end_date: '2027-01-01',
    amount: 'abc',
  });
  assert.ok(badAmount.errors.some((e) => e.includes('金额')));
});

test('业务负责人支持 owner_user_id 或 owner_name（新姓名自动建档）', () => {
  // 按 id 选择
  const byId = validateContractInput({
    name: 'x', type: '其他', customer_name: '某单位', owner_user_id: 1,
    sign_date: '2026-01-01', start_date: '2026-01-02', end_date: '2027-01-01', invoice_type: '全额专票',
  });
  assert.deepEqual(byId.errors, []);
  assert.equal(byId.values.owner_user_id, 1);
  assert.equal(byId.values.owner_name, null);

  // 新姓名：无 id，仅传 name
  const byName = validateContractInput({
    name: 'x', type: '其他', customer_name: '某单位', owner_name: '王新员',
    sign_date: '2026-01-01', start_date: '2026-01-02', end_date: '2027-01-01', invoice_type: '全额专票',
  });
  assert.deepEqual(byName.errors, []);
  assert.equal(byName.values.owner_user_id, null);
  assert.equal(byName.values.owner_name, '王新员');

  // 两者都没有 → 报错
  const missing = validateContractInput({
    name: 'x', type: '其他', customer_name: '某单位',
    sign_date: '2026-01-01', start_date: '2026-01-02', end_date: '2027-01-01', invoice_type: '全额专票',
  });
  assert.ok(missing.errors.some((e) => e.includes('业务负责人')));

  // id 与 name 同时存在时以 id 为准
  const both = validateContractInput({
    name: 'x', type: '其他', customer_name: '某单位', owner_user_id: 3, owner_name: '王新员',
    sign_date: '2026-01-01', start_date: '2026-01-02', end_date: '2027-01-01', invoice_type: '全额专票',
  });
  assert.deepEqual(both.errors, []);
  assert.equal(both.values.owner_user_id, 3);
});

test('内部管理类合同不校验发票类型与合同金额', () => {
  for (const type of ['合伙人合作协议', '内部人员劳动合同']) {
    // 前端隐藏「发票类型」「合同金额」，不传这两个字段也应通过校验
    const r = validateContractInput({
      name: '内部合同', type, customer_name: '某单位', owner_user_id: 1,
      sign_date: '2026-01-01', start_date: '2026-01-02', end_date: '2027-01-01',
    });
    assert.deepEqual(r.errors, []);
    assert.equal(r.values.invoice_type, DEFAULT_INTERNAL_INVOICE_TYPE);
    assert.equal(r.values.amount, null);
    assert.equal(r.values.amount_unit, null);

    // 绕过前端直接提交发票类型 / 金额，服务端强制归一
    const bypass = validateContractInput({
      name: '内部合同', type, customer_name: '某单位', owner_user_id: 1,
      invoice_type: '全额普票', amount: '99999', amount_unit: '元',
      sign_date: '2026-01-01', start_date: '2026-01-02', end_date: '2027-01-01',
    });
    assert.deepEqual(bypass.errors, []);
    assert.equal(bypass.values.invoice_type, DEFAULT_INTERNAL_INVOICE_TYPE);
    assert.equal(bypass.values.amount, null);
    assert.equal(bypass.values.amount_unit, null);
  }

  // 对外业务合同仍必须选发票类型
  const external = validateContractInput({
    name: 'x', type: '劳务派遣', customer_name: '某单位', owner_user_id: 1,
    sign_date: '2026-01-01', start_date: '2026-01-02', end_date: '2027-01-01',
  });
  assert.ok(external.errors.some((e) => e.includes('发票类型')));
});

test('客户字段校验', () => {
  const ok = validateCustomerInput({ name: '某用工单位', phone: '0534-1234567' });
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.values.status, 'active');
  const bad = validateCustomerInput({ name: '' });
  assert.ok(bad.errors.length > 0);
});

test('合同接口返回附件大小上限，恰好达到上限可上传', async (t) => {
  const filesDir = await mkdtemp(join(tmpdir(), 'contract-upload-'));
  const pool = fakePool();
  const query = pool.query.bind(pool);
  pool.query = async (sql, params) => {
    if (sql.startsWith('SELECT * FROM contracts WHERE id = ? AND deleted_at IS NULL')) return [[{ id: 1 }]];
    if (sql.startsWith('SELECT owner_user_id, deleted_at FROM contracts WHERE id = ?')) return [[{ id: 1 }]];
    if (sql.startsWith('INSERT INTO contract_files ')) return [{ insertId: 1 }];
    return query(sql, params);
  };
  const app = express();
  app.use('/api/contract', createContractRouter(pool, { filesDir }));
  const server = app.listen(0, '127.0.0.1');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(filesDir, { recursive: true });
  });
  await new Promise((resolve, reject) => server.once('listening', resolve).once('error', reject));
  const token = await createSession(pool, 1);
  const contractsUrl = `http://127.0.0.1:${server.address().port}/api/contract/contracts`;
  const filesUrl = `${contractsUrl}/1/files`;
  const headers = { Authorization: `Bearer ${token}` };
  for (const url of [contractsUrl, filesUrl]) {
    const response = await fetch(url, { headers });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).max_file_size, MAX_FILE_SIZE);
  }
  const filename = '签署附件.pdf';
  const pdf = Buffer.alloc(MAX_FILE_SIZE + 1, 0x20);
  pdf.write('%PDF-1.4\n');

  async function upload(bytes) {
    const body = new FormData();
    body.append('file', new Blob([pdf.subarray(0, bytes)], { type: 'application/pdf' }), filename);
    return fetch(filesUrl, { method: 'POST', headers, body });
  }

  const atLimit = await upload(MAX_FILE_SIZE);
  assert.equal(atLimit.status, 200);
  assert.deepEqual((await atLimit.json()).file, { id: 1, original_name: filename, size: MAX_FILE_SIZE });
  const overLimit = await upload(MAX_FILE_SIZE + 1);
  assert.equal(overLimit.status, 400);
  const rejection = await overLimit.json();
  assert.equal(rejection.max_file_size, MAX_FILE_SIZE);
  assert.match(rejection.error, /超过单文件上限/);
  const storedFiles = await readdir(filesDir);
  assert.equal(storedFiles.length, 1);
  assert.equal((await stat(join(filesDir, storedFiles[0]))).size, MAX_FILE_SIZE);
});
