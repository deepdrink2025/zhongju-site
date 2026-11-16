import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const root = fileURLToPath(new URL('../', import.meta.url));
let vite, store, adminApi, codec, CardPage;

class Storage {
  data = new Map();
  getItem(key) {
    return this.data.get(key) ?? null;
  }
  setItem(key, value) {
    this.data.set(key, String(value));
  }
  removeItem(key) {
    this.data.delete(key);
  }
  clear() {
    this.data.clear();
  }
}
const response = (status, data) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const nativeFetch = globalThis.fetch;

before(async () => {
  vite = await createServer({
    root,
    configFile: false,
    plugins: [react()],
    server: { middlewareMode: true, hmr: false, watch: null },
    define: { 'import.meta.env.VITE_CARD_API_BASE': '""' },
  });
  store = await vite.ssrLoadModule('/src/utils/cardStore.ts');
  adminApi = await vite.ssrLoadModule('/src/admin/api.ts');
  codec = await vite.ssrLoadModule('/src/utils/cardCodec.ts');
  CardPage = (await vite.ssrLoadModule('/src/pages/CardPage.tsx')).default;
});
after(async () => {
  globalThis.fetch = nativeFetch;
  await vite.close();
});
beforeEach(() => {
  globalThis.localStorage = new Storage();
  globalThis.window = {
    location: { origin: 'https://example.com', hash: '', search: '' },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    dispatchEvent() {},
    addEventListener() {},
    removeEventListener() {},
    scrollTo() {},
  };
  adminApi.setToken('test-token');
});

test('名片分页列表不受 20 张上限限制', async () => {
  const cards = Array.from({ length: 25 }, (_, i) => ({
    id: String(i),
    shortCode: 'abcd' + i.toString(16).padStart(4, '0'),
    name: '测试',
    title: '',
    department: '',
    phone: '13800000000',
    wechat: '',
    bio: '',
    status: 'active',
    createdAt: i,
    updatedAt: i,
    permissions: { edit: true, delete: true },
  }));
  globalThis.fetch = async (path) => {
    assert.match(path, /\/api\/cards\/mine\?/);
    return response(200, { ok: true, items: cards, total: 25 });
  };
  assert.equal((await store.listMyCardsAsync()).length, 25);
});

test('登录态失效：401 清空统一 token 并广播事件', async () => {
  let dispatched = 0;
  window.dispatchEvent = () => dispatched++;
  globalThis.fetch = async () => response(401, { ok: false, error: 'expired' });
  const result = await store.listAllCardsAsync();
  assert.equal(result.ok, false);
  assert.equal(adminApi.getToken(), null);
  assert.equal(dispatched, 1);
});

test('删除名片：服务端失败保留数据，404 视为已删除', async () => {
  for (const status of [403, 500]) {
    globalThis.fetch = async () => response(status, { ok: false, error: 'failed' });
    assert.equal(await store.removeCardAsync('abcd2345'), false);
  }
  globalThis.fetch = async () => response(404, { ok: false, error: 'not found' });
  assert.equal(await store.removeCardAsync('abcd2345'), true);
  globalThis.fetch = async () => response(200, { ok: true });
  assert.equal(await store.removeCardAsync('abcd2345'), true);
});

test('改派归属按账号 id 提交', async () => {
  let body = null;
  globalThis.fetch = async (_path, init) => {
    body = JSON.parse(init.body);
    return response(200, { ok: true });
  };
  assert.equal(await store.assignCardOwnerAsync('abcd2345', 7), true);
  assert.deepEqual(body, { user_id: 7 });
});

test('响应体卡住时仍由请求超时兜底', async () => {
  let fire;
  window.setTimeout = (fn) => {
    fire = fn;
    return 1;
  };
  window.clearTimeout = () => {};
  globalThis.fetch = async (_path, init) => ({
    status: 200,
    ok: true,
    json: () =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('aborted')));
        queueMicrotask(fire);
      }),
  });
  const result = await store.listAllCardsAsync();
  assert.equal(result.ok, false);
});

test('二维码安全阈值按 UTF-8 字节计算', () => {
  assert.equal(codec.isQrSafe('https://example.com/card/abcd2345'), true);
  assert.equal(codec.isQrSafe('https://example.com/card/' + '名'.repeat(500)), false);
});

function render(path) {
  const original = console.error;
  console.error = (...args) => {
    if (!String(args[0]).includes('useLayoutEffect does nothing on the server')) original(...args);
  };
  try {
    return renderToString(
      React.createElement(
        MemoryRouter,
        { initialEntries: [path] },
        React.createElement(
          Routes,
          null,
          React.createElement(Route, { path: '/card/:id?', element: React.createElement(CardPage) })
        )
      )
    );
  } finally {
    console.error = original;
  }
}

test('旧的 hash 名片链接不再渲染身份信息', () => {
  const forged = {
    name: '伪造身份',
    phone: '13800000000',
    avatar: 'data:image/jpeg;base64,' + 'A'.repeat(6000),
  };
  const hash = '#d=' + Buffer.from(JSON.stringify(forged)).toString('base64url');
  window.location.hash = hash;
  const html = render('/card' + hash);
  assert.ok(html.includes('未找到该名片'));
  assert.ok(!html.includes(forged.name));
  assert.ok(!html.includes('<canvas'));
});

test('裸 /card 不进入永久骨架屏', () => {
  const html = render('/card');
  assert.ok(html.includes('未找到该名片'));
  assert.ok(!html.includes('animate-pulse'));
});

test('后台各页面模块可加载（统一后台路由齐全）', async () => {
  for (const path of [
    '/src/admin/pages/Login.tsx',
    '/src/admin/pages/Dashboard.tsx',
    '/src/admin/pages/Cards.tsx',
    '/src/admin/pages/Contracts.tsx',
    '/src/admin/pages/ContractDetail.tsx',
    '/src/admin/pages/Users.tsx',
    '/src/admin/components/Layout.tsx',
    '/src/admin/components/ContractForm.tsx',
  ]) {
    const mod = await vite.ssrLoadModule(path);
    assert.equal(typeof mod.default, 'function', path);
  }
  const app = await vite.ssrLoadModule('/src/App.tsx');
  assert.equal(typeof app.default, 'function');
});
