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

for path in ['/', '/admin', '/card/wang', '/create']:
    status, html, _ = request(path)
    assert status == 200 and '<div id="root"></div>' in html, path
print('PASS homepage and SPA route fallback (4 routes)')
for path in re.findall(r'(?:src|href)="(/assets/[^\"]+)"', html):
    status, _, headers = request(path)
    assert status == 200 and 'immutable' in headers.get('Cache-Control', ''), path
print('PASS built assets and cache headers')
assert request('/api/health')[1]['ok']
assert request('/api/cards')[0] == 401
assert request('/api/admin/login', 'POST', {'passcode': 'invalid-deployment-test'})[0] == 401

tokens = {}
for role, key in [('staff', 'STAFF_TOKEN'), ('admin', 'ADMIN_TOKEN')]:
    status, result, _ = request('/api/admin/login', 'POST', {'passcode': env[key]})
    assert status == 200 and result['role'] == role
    tokens[role] = result['token']
    assert request('/api/admin/me', token=tokens[role])[1]['role'] == role
assert request('/api/cards', token=tokens['staff'])[0] == 403
print('PASS database health, both login roles, and authorization')

code = None
try:
    status, result, _ = request('/api/cards', 'POST', {'name': '部署验证', 'title': '临时测试', 'phone': '13800000000'}, tokens['staff'])
    assert status == 200 and result['ok']
    code = result['record']['shortCode']
    assert request(f'/api/cards/{code}')[1]['record']['name'] == '部署验证'
    status, result, _ = request('/api/cards', token=tokens['admin'])
    assert status == 200 and any(card['shortCode'] == code for card in result['items'])
    assert request(f'/api/cards/{code}/status', 'PATCH', {'status': 'disabled'}, tokens['staff'])[0] == 403
    assert request(f'/api/cards/{code}/status', 'PATCH', {'status': 'disabled'}, tokens['admin'])[0] == 200
    assert request(f'/api/cards/{code}')[1]['status'] == 'disabled'
    assert request(f'/api/cards/{code}/status', 'PATCH', {'status': 'active'}, tokens['admin'])[0] == 200
    assert request(f'/api/cards/{code}')[1]['status'] == 'active'
    print('PASS real MySQL create/read/list/disable/enable card lifecycle')
finally:
    if code:
        assert request(f'/api/cards/{code}', 'DELETE', token=tokens['admin'])[0] == 200
        assert request(f'/api/cards/{code}')[0] == 404
        print('PASS test card deleted; no test card retained')
