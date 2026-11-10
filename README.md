# 中聚人力 · 展示平台（PC 官网 + 手机 H5 + 云名片）

临邑中聚人力资源有限公司的响应式展示网站：PC/手机自适应官网 + 业务人员专属电子名片系统（对标"君润云展厅"，非小程序）。官网为纯静态页面；名片系统可跑在本地模式（无后端），也可一键部署成 Docker（Nginx + Node.js + MySQL）实现全网可访问的短链名片。

---

## 一、快速启动

### 日常预览（最常用）

```bash
cd zhongju-site
npm run preview
```

然后浏览器打开 **http://127.0.0.1:4173**

> `npm run preview` 使用的是 `dist/` 目录里**已构建好**的产物。如果之前改过代码，先执行下面的"开发模式"或"重新构建"。

### 开发模式（改代码时用，改完即时生效）

```bash
cd zhongju-site
npm run dev
```

按终端提示的地址打开（默认 http://localhost:5173）。

### 重新构建（改完代码后正式预览）

```bash
npm run build && npm run preview
```

> 注意：在本机安全沙箱环境下，如 `npm run build` 报错，请使用 `npx vite build --emptyOutDir false`。

### 首次使用（新电脑 / 删过 node_modules）

```bash
npm install
```

---

## 二、网站地址（路由）

| 页面 | 地址 | 说明 |
|---|---|---|
| 公司官网 | `/` | 单页滚动官网，PC/手机自适应 |
| 示例名片 | `/card/wang`（另含 li / zhang / liu） | 示例数据，占位号码 |
| 专属名片（新版） | `/card/8位短码` | 业务人员生成的短链名片，二维码更易扫 |
| 专属名片（旧版兼容） | `/card#d=xxxx` | 服务端模式拒绝无签名旧链接；请由管理员迁移为正式短链 |
| 名片控制台 | `/admin` | **内部工具**，需口令；业务员登录后生成名片，管理员额外可管理全部名片（停用/启用/删除/搜索） |
| 旧入口兼容 | `/create` | 已合并进控制台，访问时自动跳转到 `/admin` |

**本地模式**下 `/admin` 无需口令（仅本机数据）；**服务端模式**下口令在服务端 `.env` 中配置（`STAFF_TOKEN` 业务员 / `ADMIN_TOKEN` 管理员），登录后 12 小时内免输。

---

## 三、常用修改（改哪里）

| 想改什么 | 改哪个文件 |
|---|---|
| 公司介绍、业务板块、案例、荣誉、客户等官网内容 | `src/data/company.ts` |
| 业务人员名片（姓名/职位/电话/微信） | `src/data/members.ts`（当前为示例数据，请替换） |
| 云名片访问口令 | 服务器 `deploy/.env` 中的 `STAFF_TOKEN` / `ADMIN_TOKEN` |
| 官网配图 | `public/images/`（当前图片截取自公司简介 PDF，可直接替换同名文件） |
| 品牌色 | `tailwind.config.ts` 中的 `brand` 色板 |

改完数据文件后：开发模式（`npm run dev`）下保存即生效；正式预览需重新 `npm run build`。

---

## 四、业务人员如何使用云名片

1. 浏览器打开 `网址/admin`，输入口令进入（业务员口令或管理员口令均可）
2. 在「名片生成」填写姓名、职位、手机号、微信号，可上传形象照（自动压缩）
3. 点击"生成专属名片"，获得**短链名片**（`网址/card/8位短码`）和二维码
4. 推荐分享方式：
   - **保存分享图（推荐）**：生成竖版名片海报，发到微信聊天里是一张"名片图"而非一串链接
   - **微信内转发**：在微信打开名片页 → 右上角「···」转发，卡片标题自动显示"姓名 · 职位"
   - **复制链接**：备用方式
5. 名片保存在"我的名片"列表，可打开、编辑或删除。服务端模式支持复制短链，短链可在其他设备打开；本地模式仅供本机预览
6. 服务端控制台可复制私密恢复码；在新设备或其他域名登录时，同时填写访问口令和恢复码即可找回本人名片。历史名片由管理员确认后分配归属

> 防滥用机制：名片字段有长度/格式校验；每日生成配额按恢复身份持久化统计（默认 5 张），IP 另作短时防滥用；/create 与 /card 已禁止搜索引擎收录。
> 名片有本地与服务端两种模式，详见下文「七、服务端名片系统」。

---

## 五、技术栈与目录结构

- **技术栈**：Vite 8 + React 18 + TypeScript + Tailwind CSS 3 + react-router-dom 7 + qrcode.react；服务端 Node.js 24 + Express + MySQL（Docker）
- **部署**：`cd deploy && ./deploy.sh` 一键起 web（Nginx 静态站 + 同域 `/api` 反代）+ api（名片服务），详见「六、一键部署」

```
zhongju-site/
├── public/images/        # 官网配图（源自公司简介 PDF）
├── deploy/               # 一键部署（web + api 整套）
│   ├── deploy.sh         # 一键脚本：建 .env / 建库 / 构建 / 启动 / 健康检查
│   ├── docker-compose.yml# web + api 两个服务，复用外部 MySQL 网络
│   ├── docker-compose.override.yml # NPM 网络、回环端口、健康检查与日志轮转
│   ├── Dockerfile.web    # 多阶段：node 构建 dist → nginx 运行
│   ├── nginx.conf        # 静态站 + /api 反代 + 缓存策略
│   ├── .env.example      # 通用部署参数模板
│   ├── bootstrap.py      # 首次建库与随机口令初始化
│   ├── verify-deployment.py # 真实数据库与页面验证，自动清理测试名片
│   └── server-notes.example.md # 运维记录模板，真实配置保存在忽略的本地文件中
├── server/               # 名片服务端（Node.js + MySQL）
│   ├── src/app.js        # API 路由（可注入假库，便于测试）
│   ├── src/db.js         # MySQL 连接池 + 建表（连接 mysql-common 容器）
│   ├── src/index.js      # 启动入口
│   ├── sql/init.sql      # 手动建库脚本（一键脚本已自动完成，排错用）
│   ├── Dockerfile / docker-compose.yml   # 只单独跑后端时使用
│   └── test/             # 冒烟测试（内存假库）+ 本地联调服务器
├── src/
│   ├── config.ts         # 服务端模式开关、API 地址
│   ├── data/
│   │   ├── company.ts    # 官网全部内容数据（改内容主要改这里）
│   │   └── members.ts    # 示例业务人员名片
│   ├── pages/
│   │   ├── Home.tsx      # 官网首页
│   │   ├── CardPage.tsx  # 名片展示页（客户看的）
│   │   └── CardConsole.tsx# 名片控制台 /admin（业务员 + 管理员共用入口）
│   ├── components/       # 官网区块组件 + TabBar + 名片面板
│   │   ├── CardCreatePanel.tsx  # 名片生成表单 + 我的名片
│   │   └── AdminCardList.tsx    # 管理员列表（搜索/停用/删除）
│   ├── utils/
│   │   ├── cardCodec.ts  # 名片数据 ↔ 链接 编解码（旧版兼容）
│   │   ├── cardService.ts# 本地名片存储
│   │   ├── cardAuth.ts   # 口令登录 + token 存储
│   │   ├── cardStore.ts  # 名片门面层：自动切换本地/服务端模式
│   │   └── poster.ts     # 分享海报（Canvas 绘制，矢量图标）
│   └── vite-env.d.ts     # 环境变量类型
└── dist/                 # 构建产物（npm run preview 用的就是它）
```

---

## 六、一键部署（Docker，推荐）

部署说明见 [`deploy/server-notes.example.md`](deploy/server-notes.example.md)。模板使用通用参数，部署时按目标环境配置。**前置条件**：

- 已安装 Docker + Docker Compose，需支持覆盖配置中的 `!override` 标签
- 公共 MySQL 容器 `mysql-common` 已接入共享网络（示例名为 `bridge-network`）
- Nginx Proxy Manager 已接入同一网络，所选宿主回环端口空闲（默认 `8080`）

**首次部署**：

```bash
cd zhongju-site/deploy
python3 bootstrap.py --shared-network bridge-network --http-port 8080
./deploy.sh
```

初始化脚本利用 MySQL 容器内部的 root 配置，创建独立的 `zhongju_cards` 数据库和 `zhongju` 用户，并生成随机业务员口令、管理员口令和签名密钥。配置只写入权限为 `0600` 的 `deploy/.env`；已有配置或同名库/用户时会停止。其他参数可通过 `python3 bootstrap.py --help` 查看。

**更新上线**：

```bash
cd zhongju-site/deploy
./deploy.sh
```

脚本会自动完成 7 件事，全程无需手工编辑文件：

1. 检查 docker / compose，缺了直接报错并给安装链接
2. 没有 `.env` 就从 `.env.example` 复制；`DB_PASSWORD`、`STAFF_TOKEN`、`ADMIN_TOKEN`、`TOKEN_SECRET` 里"请改成…"的占位符**自动换成随机强密码**
3. 校验公共 bridge 网络是否存在（不存在则创建）、`mysql-common` 是否在该网络中
4. 读到 `MYSQL_ROOT_PASSWORD` 就自动在 `mysql-common` 里建库、建用户、授权（幂等，可重复执行），成功后清空该字段
5. `docker compose up -d --build` 构建并启动 `web`（Nginx + 静态站）+ `api`（名片服务）
6. 轮询 `/api/health` 等 API 起来，失败则返回非零状态并提示查看日志
7. 打印访问地址和凭据文件位置，不输出完整口令

**更新上线**：改完代码再跑一次 `./deploy.sh` 即可（重新构建镜像，数据库数据保留）。

### 常用命令

| 命令 | 作用 |
|---|---|
| `./deploy.sh` | 首次部署 / 更新上线 |
| `./deploy.sh ps` | 查看容器状态与健康 |
| `./deploy.sh logs api` | 跟踪 API 日志（`logs` 不带参数看全部） |
| `./deploy.sh restart` | 重启容器 |
| `./deploy.sh down` | 停止并移除容器（名片数据在 MySQL 里，不会丢） |

### `deploy/.env` 关键项

| 变量 | 说明 |
|---|---|
| `HTTP_PORT` | 宿主回环端口，默认 `8080`；公网由 NPM 转发到容器 `80` 端口 |
| `DB_HOST` / `DB_PORT` | 公共 MySQL 容器名与端口，默认 `mysql-common:3306` |
| `DB_USER` / `DB_PASSWORD` / `DB_NAME` | 脚本自动建库建用户时使用，默认 `zhongju` / 随机 / `zhongju_cards` |
| `SHARED_NETWORK` | MySQL 与 NPM 所在网络，示例默认值为 `bridge-network`，按目标环境修改 |
| `MYSQL_ROOT_PASSWORD` | **仅首次建库用**，建完自动清空；不填就跳过建库 |
| `STAFF_TOKEN` / `ADMIN_TOKEN` | 业务员口令 / 管理员口令，建议手改成好记的强口令 |
| `DAILY_LIMIT` / `LOGIN_LIMIT` | 每恢复身份每日建卡上限（5）、每 IP 10 分钟错误登录上限（10） |
| `QUOTA_TIME_ZONE` | 业务配额时区，默认 `Asia/Shanghai`；前端使用服务端返回的配额与重置时间 |
| `TRUST_PROXY` | 仅信任明确的代理链；Docker 默认 `loopback,uniquelocal`，直接运行 API 使用 `false` |

### 部署后的结构

```
公网 :80 / :443 ─→ [Nginx Proxy Manager] ─→ [web 容器: Nginx]
              ├─ /           静态站（dist，SPA 回退）
              ├─ /admin     名片控制台（no-store，noindex）
              └─ /api/*  ──→ [api 容器:8787] ──→ mysql-common (共享网络)
```

前端与接口**同域**，不需要配 CORS；`api` 不映射宿主端口。`web` 的宿主端口仅绑定回环地址（默认 `127.0.0.1:8080`），并通过共享 Docker 网络供 NPM 访问。

`docker-compose.override.yml` 自动叠加网络、端口、健康检查和日志轮转配置。`deploy.sh` 的所有子命令均显式加载两个 Compose 文件；手动使用 `-f` 时也需要同时指定两个文件。

### 域名与 HTTPS

- 将你的站点域名（如 `example.com` 和 `www.example.com`）解析到目标服务器的公网地址
- 在 NPM 中将这些域名配置到同一条 Proxy Host：Scheme 为 `http`，Forward Hostname 为 `zhongju-site-web`，Forward Port 为 `80`
- Advanced 配置为 `client_max_body_size 4m;`，以支持名片头像请求
- 证书、HTTPS 跳转和续期由用户在 NPM 面板中管理

### 部署验证

在已配置的服务器上执行：

```bash
cd zhongju-site/deploy
python3 verify-deployment.py
# 通过公网入口检查（证书配置完成后）：
python3 verify-deployment.py --base-url https://example.com
```

验证脚本检查页面、静态资源、数据库、两类角色及名片完整流程，并删除临时测试名片；每次执行消耗一次当日生成配额。

### 私有运维信息

将 `deploy/server-notes.example.md` 复制为 `deploy/server-notes.local.md` 后填写实际服务器资料。`*.local.*`、`.env`、密钥和备份文件已列入 Git 与 Docker 构建上下文的忽略规则，公开模板只保留示例参数。

> 只想跑后端、前端交给宿主 Nginx？把 `dist/` 上传到宿主站点根目录，反代 `/api/` 到 `127.0.0.1:8787`（配置可直接抄 `deploy/nginx.conf`），后端单独启动用 `cd server && docker compose up -d --build`。

## 七、服务端名片系统（推荐正式部署时启用）

启用后：名片存在 MySQL，有效短链/二维码在其他设备上可打开；本人可用恢复码找回名片，管理员可停用已离职人员的名片。

**双口令分层**：业务员口令（`STAFF_TOKEN`，在 `/admin` 登录，可创建、编辑和删除本人名片）与管理员口令（`ADMIN_TOKEN`，在 `/admin` 登录，可管理全部名片）分开。口令在页面输入后由服务端校验并返回 **12 小时短期 token**，口令本身不进前端构建产物；会话保存在服务端，退出可撤销，修改某角色口令会使该角色旧 token 失效。

**名片控制台 `/admin`**：不在官网任何导航中展示（noindex），网址/书签直接进入。业务员与管理员共用一个入口，登录后按口令权限显示 Tab：业务员可创建及编辑、删除本人恢复身份所属的名片；管理员额外有「名片管理」——搜索（姓名/手机/短码/部门）、状态筛选、停用/启用（立即生效）、删除、复制短链、打开名片。支持 `/admin?tab=list` 直达管理页。

### 手动部署（一键脚本已覆盖，排错或"只跑后端"时参考）

**1）数据库准备**（在 mysql-common 容器执行一次，记得先把 init.sql 里的密码改成与 `.env` 一致）

```bash
docker exec -i mysql-common mysql -uroot -p'你的root密码' < server/sql/init.sql
```

**2）启动服务端容器**

```bash
cd server
cp .env.example .env      # 修改：DB_PASSWORD、STAFF_TOKEN、ADMIN_TOKEN、TOKEN_SECRET、SHARED_NETWORK（docker network ls 查看）
docker compose up -d --build
```

容器会自动建表，并只绑定 `127.0.0.1:8787`（由 Nginx 反代，不直接暴露公网）。

**3）Nginx 反代**（与官网同域名；完整版见 `deploy/nginx.conf`）

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8787;
    proxy_set_header X-Real-IP $remote_addr;
    client_max_body_size 4m;
}
```

**4）前端启用服务端模式构建**

```bash
cp .env.example .env.production.local   # VITE_CARD_SERVER=on
npm run build
```

**5）本地验证（无需 MySQL）**

```bash
cd server && npm test                   # 主流程与安全回归测试
node test/dev-server.mjs 8787           # 内存假库 API，配合前端联调
```

### 接口一览

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| POST | /api/admin/login | 公开 | 口令换 12h token（默认每 IP 10 分钟最多 10 次错误口令，另有短时请求保护） |
| GET | /api/admin/me | 登录 | 查询当前身份与过期时间 |
| POST | /api/cards | staff/admin | 创建名片（默认每恢复身份 5 次/业务日） |
| GET | /api/cards/:code | 公开 | 短码读取（停用只返回状态） |
| PATCH | /api/cards/:code/status | admin | 停用/启用 |
| DELETE | /api/cards/:code | 本人或 admin | 删除 |
| GET | /api/cards | admin | 分页列表，支持 q / status / limit / offset |
| GET | /api/cards/mine | staff/admin | 当前恢复身份的服务器名片列表 |
| PUT | /api/cards/:code | 本人或 admin | 编辑资料，保留原短码 |
| PUT | /api/cards/:code/owner | admin | 使用本人提供的恢复码分配归属 |
| POST | /api/admin/logout | staff/admin | 撤销当前服务器会话 |
| GET | /api/quota | staff/admin | 查询权威配额与重置时间 |
| GET | /api/health | 公开 | 健康检查 |


## 安全修复与升级

本轮修复、旧数据迁移、恢复码使用与剩余产品边界见 [`docs/security-fixes.md`](docs/security-fixes.md)。开发环境需 Node.js 22.12+；Docker 使用 Node.js 24。运行 `npm ci`、`npm --prefix server ci` 后执行 `npm test` 与 `npm run build`。
