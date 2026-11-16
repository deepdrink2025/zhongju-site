#!/usr/bin/env python3
"""中聚合同管理系统 —— 上线后部署验证脚本。

用法（在能访问该域名的机器上执行，例如服务器本机）：
    python3 verify-deployment.py                       # 验证 https://域名/contracts
    python3 verify-deployment.py http://127.0.0.1:8090 # 验证本机端口
    python3 verify-deployment.py <base-url> <user> <password>

检查项：
  1. 前端静态页可访问（/contracts/ 返回 200 且含 HTML）
  2. /api/contract/health 健康检查（数据库连通）
  3. 登录接口可用（正确密码返回 token，错误密码返回 401）
  4. 用 token 拉取合同列表、统计接口
  5. 未带 token 的 API 请求被拒绝（401）
"""
import json
import sys
import urllib.request
import urllib.error

DEFAULT_BASE = "https://请改成你的域名/contracts"
DEFAULT_API_BASE = None  # 默认由 base 推导：https://域名/api/contract


def req(url, method="GET", data=None, token=None, timeout=15):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode() if data is not None else None
    r = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def main():
    base = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_BASE
    user = sys.argv[2] if len(sys.argv) > 2 else None
    password = sys.argv[3] if len(sys.argv) > 3 else None

    # API 根路径：若 base 已含 /api/contract 则直接用，否则推导
    if "/api/contract" in base:
        api = base.rstrip("/")
        web = base.split("/api/contract")[0].rstrip("/") + "/contracts"
    else:
        web = base.rstrip("/") + "/"
        origin = base.split("/contracts")[0].rstrip("/") if "/contracts" in base else base.rstrip("/")
        api = origin + "/api/contract"
    if not web.endswith("/"):
        web += "/"
    # web 路径形如 https://域名/contracts
    web = web[:-1] if web.endswith("//") else web

    results = []

    def check(name, ok, detail=""):
        results.append((name, ok, detail))
        mark = "✅" if ok else "❌"
        print(f"  {mark} {name}" + (f" —— {detail}" if detail else ""))

    # 1. 前端页面
    status, body = req(web)
    check("前端页面可访问", status == 200 and b"<html" in body.lower(), f"HTTP {status}")

    # 2. 健康检查
    status, body = req(api + "/health")
    ok = status == 200 and b'"ok":true' in body.replace(b" ", b"")
    check("API 健康检查（数据库连通）", ok, f"HTTP {status} {body[:80]!r}")

    # 3~4. 登录与鉴权接口（可选，提供账号密码时才测）
    token = None
    if user and password:
        status, body = req(api + "/auth/login", "POST", {"username": user, "password": "错误密码测试"})
        check("错误密码被拒绝（401）", status == 401, f"HTTP {status}")

        status, body = req(api + "/auth/login", "POST", {"username": user, "password": password})
        ok = status == 200
        token = json.loads(body).get("token", "") if ok else ""
        check("正确密码可登录", ok, f"HTTP {status}")

        status, body = req(api + "/contracts?page=1&page_size=5", token=token)
        check("合同列表接口", status == 200, f"HTTP {status}")
        if status == 200:
            d = json.loads(body)
            print(f"    └─ 共 {d.get('total')} 份合同")

        status, body = req(api + "/contracts/stats", token=token)
        check("统计看板接口", status == 200, f"HTTP {status}")

        status, body = req(api + "/contracts?page=1")
        check("未登录访问被拒绝（401）", status == 401, f"HTTP {status}")
    else:
        print("  ⏭ 跳过登录验证（未提供用户名/密码参数）")

    failed = [r for r in results if not r[1]]
    print()
    print(f"验证完成：{len(results) - len(failed)}/{len(results)} 项通过")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
