import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const root = fileURLToPath(new URL('../', import.meta.url));
let vite, facade, service, CardPage, auth;
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
    define: {
      'import.meta.env.VITE_CARD_SERVER': '"on"',
      'import.meta.env.VITE_CARD_API_BASE': '""',
    },
  });
  facade = await vite.ssrLoadModule('/src/utils/cardStore.ts');
  service = await vite.ssrLoadModule('/src/utils/cardService.ts');
  auth = await vite.ssrLoadModule('/src/utils/cardAuth.ts');
  CardPage = (await vite.ssrLoadModule('/src/pages/CardPage.tsx')).default;
});
after(async () => {
  globalThis.fetch = nativeFetch;
  await vite.close();
});
beforeEach(() => {
  globalThis.localStorage = new Storage();
  globalThis.sessionStorage = new Storage();
  globalThis.window = {
    location: { origin: 'https://example.com', hash: '' },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    dispatchEvent() {},
    addEventListener() {},
    removeEventListener() {},
    scrollTo() {},
  };
  sessionStorage.setItem(
    'zhongju_card_auth',
    JSON.stringify({ token: 'test-token', role: 'staff', exp: Date.now() + 100000 })
  );
});
test('failed and unauthorized deletion retains the local index; successful deletion clears it', async () => {
  service.rememberCode('abcd2345');
  for (const status of [403, 500]) {
    globalThis.fetch = async () => response(status, { ok: false, error: 'failed' });
    assert.equal(await facade.removeCardAsync('abcd2345'), false);
    assert.deepEqual(service.myCodes(), ['abcd2345']);
  }
  globalThis.fetch = async () => response(200, { ok: true });
  assert.equal(await facade.removeCardAsync('abcd2345'), true);
  assert.deepEqual(service.myCodes(), []);
});
test('a new browser retrieves its owned records from the server, without a 20-card cutoff', async () => {
  const cards = Array.from({ length: 25 }, (_, i) => ({
    id: String(i),
    shortCode: 'abcd' + i.toString(16).padStart(4, '0'),
    name: '测试',
    title: '',
    department: '',
    phone: '13800000000',
    wechat: '',
    bio: '',
    avatar: '',
    status: 'active',
    createdAt: i,
    updatedAt: i,
    permissions: { edit: true, delete: true },
  }));
  globalThis.fetch = async (path) => {
    assert.match(path, /\/api\/cards\/mine\?/);
    return response(200, { ok: true, items: cards, total: 25 });
  };
  assert.equal((await facade.listMyCardsAsync()).length, 25);
  for (let i = 0; i < 25; i++) service.rememberCode(String(i));
  assert.equal(service.myCodes().length, 25);
});
test('expired authentication is cleared on 401 and a recovery code persists across logins', async () => {
  let dispatched = 0;
  window.dispatchEvent = () => dispatched++;
  globalThis.fetch = async () => response(401, { ok: false, error: 'expired' });
  await facade.listAllCardsAsync();
  assert.equal(auth.getToken(), null);
  assert.equal(dispatched, 1);
  const device = auth.getRecoveryCode();
  assert.match(device, /^[a-f0-9]{32}$/);
  globalThis.fetch = async (_path, init) => {
    assert.equal(JSON.parse(init.body).deviceId, device);
    return response(200, { ok: true, token: 'new-token', role: 'staff', exp: Date.now() + 100000 });
  };
  assert.equal((await auth.login('test-pass', device)).ok, true);
  assert.equal(auth.getRecoveryCode(), device);
});
test('a response-body stall remains covered by the request timeout', async () => {
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
  const result = await facade.listAllCardsAsync();
  assert.equal(result.ok, false);
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
test('server mode rejects unsigned legacy identities, including long avatar payloads', () => {
  const forged = {
    name: '伪造身份',
    phone: '13800000000',
    avatar: 'data:image/jpeg;base64,' + 'A'.repeat(6000),
  };
  const hash = '#d=' + Buffer.from(JSON.stringify(forged)).toString('base64url');
  window.location.hash = hash;
  const html = render('/card' + hash);
  assert.ok(html.includes('旧版名片链接已停用'));
  assert.ok(!html.includes(forged.name));
  assert.ok(!html.includes('<canvas'));
});
test('bare /card does not enter a permanent loading skeleton', () => {
  const html = render('/card');
  assert.ok(html.includes('未找到该名片'));
  assert.ok(!html.includes('animate-pulse'));
});
