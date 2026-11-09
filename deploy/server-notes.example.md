# 服务器运维记录模板

将此文件复制为 `server-notes.local.md`，再填写实际服务器资料。副本已被 Git 和 Docker 构建上下文忽略。

## 环境信息

- SSH 连接名称：填写到本地副本中
- 公网地址、管理面板地址和部署目录：填写到本地副本中
- 站点域名：`example.com`、`www.example.com`（替换为实际域名）
- 共享网络：`bridge-network`（替换为实际 Docker 网络）
- 宿主回环端口：`8080`（按环境调整）

## 首次部署

现有 MySQL 容器和反向代理需接入同一个共享 Docker 网络。以下命令在项目根目录执行：

```bash
cd deploy
python3 bootstrap.py --shared-network bridge-network --http-port 8080
./deploy.sh
```

初始化脚本使用 MySQL 容器中的 root 环境配置建立独立数据库和用户，并将随机口令写入权限为 `0600` 的 `.env`。已有配置、数据库或同名用户时会停止；可用 `python3 bootstrap.py --help` 查看其他参数。

## 运行结构

Nginx Proxy Manager → `zhongju-site-web:80` → `zhongju-card-api:8787` → MySQL。`web` 接入项目内部网络和配置的共享网络，API 不发布宿主端口。两个容器均配置健康检查、自动重启和日志轮转。

在 NPM 中将自己的域名转发到 `http://zhongju-site-web:80`，Advanced 配置为 `client_max_body_size 4m;`。证书、强制 HTTPS 和续期在面板中管理。实际 Proxy Host ID 和管理面板地址仅填写到本地副本。

## 口令与维护

业务员口令、管理员口令、数据库密码和 token 签名密钥存放在服务器的 `deploy/.env` 中。口令变更后运行 `docker compose up -d`；修改 `TOKEN_SECRET` 会使先前签发的登录 token 失效。

```bash
cd deploy
docker compose ps
docker compose logs --tail=100 api web
docker compose up -d --build --wait
python3 verify-deployment.py
# 在自己的域名上验证：
python3 verify-deployment.py --base-url https://example.com
```

验证脚本创建并删除一张临时名片，占用一次当日生成配额。数据库和 `.env` 的备份应保存在私有位置。

`docker-compose.override.yml` 保存网络、回环端口、日志和健康检查设置。直接运行 `docker compose` 会自动加载基础文件和覆盖文件；手动传 `-f` 时需将两者一起传入。
