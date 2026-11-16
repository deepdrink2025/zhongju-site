import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword,
  verifyPassword,
  sanitizeContract,
  computeDisplayStatus,
  validateContractInput,
  validateCustomerInput,
  CONTRACT_TYPES,
} from '../src/util.js';

test('密码哈希与校验', () => {
  const { salt, hash } = hashPassword('s3cretPass!');
  assert.equal(salt.length, 32);
  assert.equal(hash.length, 64);
  assert.equal(verifyPassword('s3cretPass!', salt, hash), true);
  assert.equal(verifyPassword('wrong', salt, hash), false);
});

test('金额按角色过滤', () => {
  const row = { id: 1, amount: 12345.5, end_date: '2099-01-01', status: 'active', deleted_at: null };
  assert.equal('amount' in sanitizeContract(row, 'admin'), true);
  assert.equal('amount' in sanitizeContract(row, 'finance'), true);
  assert.equal('amount' in sanitizeContract(row, 'staff'), false);
  assert.equal('amount' in sanitizeContract(row, 'viewer'), false);
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

test('客户字段校验', () => {
  const ok = validateCustomerInput({ name: '某用工单位', phone: '0534-1234567' });
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.values.status, 'active');
  const bad = validateCustomerInput({ name: '' });
  assert.ok(bad.errors.length > 0);
});
