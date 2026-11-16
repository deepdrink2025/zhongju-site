#!/usr/bin/env python3
"""Verify a running deployment; create and delete one temporary test card."""

import argparse
import json
import re
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--base-url', help='Site URL; defaults to the host port in deploy/.env')
args = parser.parse_args()
env_path = Path(__file__).resolve().parent / '.env'
if not env_path.is_file():
    raise SystemExit(f'Missing {env_path}; run this script on the configured server')
env = dict(line.split('=', 1) for line in env_path.read_text().splitlines() if '=' in line and not line.startswith('#'))
base = (args.base_url or f"http://127.0.0.1:{env.get('HTTP_PORT', '8080')}").rstrip('/')

def request(path, method='GET', body=None, token=None):
    headers = {}
    if body is not None:
        headers['Content-Type'] = 'application/json'
    if token:
        headers['Authorization'] = f'Bearer {token}'
    req = Request(base + path, data=json.dumps(body).encode() if body is not None else None, headers=headers, method=method)
    try:
        with urlopen(req, timeout=10) as res:
            raw = res.read()
            content_type = res.headers.get('Content-Type', '')
            return res.status, json.loads(raw) if 'application/json' in content_type else raw.decode(), res.headers
    except HTTPError as err:
        return err.code, json.load(err), err.headers

# 1. 静态站与 SPA 路由回退（官网、后台、公开名片页）
for path in ['/', '/admin', '/admin/login', '/admin/contracts', '/card/wang']:
    status, html, _ = request(path)
    assert status == 200 and '<div id="root"></div>' in html, path
print('PASS homepage and SPA route fallback (5 routes)')

for path in re.findall(r'(?:src|href)="(/assets/[^\"]+)"', html):
    status, _, headers = request(path)
    assert status == 200 and 'immutable' in headers.get('Cache-Control', ''), path
print('PASS built assets and cache headers')

# 2. 服务健康
assert request('/api/health')[1]['ok']
assert request('/api/contract/health')[1]['ok']

# 3. 未登录一律 401（统一账户体系下不再有口令入口）
for path in ['/api/cards', '/api/quota', '/api/auth/me', '/api/contract/contracts', '/api/contract/users']:
    assert request(path)[0] == 401, path
assert request('/api/auth/login', 'POST', {'username': 'deployment-test', 'password': 'wrong-password'})[0] == 401
assert request('/api/cards', token='forged-token')[0] == 401
print('PASS unauthenticated and invalid-token requests rejected')

# 4. 主管理员登录（凭 deploy/.env 的 INIT_ADMIN_*）
username = env.get('INIT_ADMIN_USER', 'admin')
password = env.get('INIT_ADMIN_PASSWORD')
assert password, 'Missing INIT_ADMIN_PASSWORD in deploy/.env'
status, result, _ = request('/api/auth/login', 'POST', {'username': username, 'password': password})
assert status == 200 and result['user']['role'] == 'admin', result
token = result['token']
assert request('/api/auth/me', token=token)[1]['user']['username'] == username
assert request('/api/contract/users', token=token)[0] == 200
print('PASS unified login, session check, and admin-only user management')

# 5. 名片生命周期
code = None
try:
    status, result, _ = request('/api/cards', 'POST', {'name': '部署验证', 'title': '临时测试', 'phone': '13800000000'}, token)
    assert status == 200 and result['ok'], result
    code = result['record']['shortCode']
    assert request(f'/api/cards/{code}')[1]['record']['name'] == '部署验证'
    status, result, _ = request('/api/cards', token=token)
    assert status == 200 and any(card['shortCode'] == code for card in result['items'])
    assert request(f'/api/cards/{code}/status', 'PATCH', {'status': 'disabled'}, token)[0] == 200
    assert request(f'/api/cards/{code}')[1]['status'] == 'disabled'
    assert request(f'/api/cards/{code}/status', 'PATCH', {'status': 'active'}, token)[0] == 200
    assert request(f'/api/cards/{code}')[1]['status'] == 'active'
    print('PASS real MySQL create/read/list/disable/enable card lifecycle')
finally:
    if code:
        assert request(f'/api/cards/{code}', 'DELETE', token=token)[0] == 200
        assert request(f'/api/cards/{code}')[0] == 404
        print('PASS test card deleted; no test card retained')
