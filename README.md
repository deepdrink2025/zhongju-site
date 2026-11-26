# 中聚人力 · 展示平台（PC 官网 + 手机 H5 + 云名片 + 合同管理）

临邑中聚人力资源有限公司的响应式展示网站：PC/手机自适应官网 + 业务人员专属电子名片系统 + 公司内部合同管理系统。官网为静态页面；名片与合同共用**一套账号体系、一个后台入口**，可一键部署成 Docker（Nginx + Node.js + MySQL）实现全网可访问的短链名片。

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

按终端提示的地址打开（默认 http://localhost:5173）。后台需要接口，另开一个终端跑内存假库：

```bash
node server/test/dev-server.mjs 8787     # 测试账号见输出
```

### 重新构建（改完代码后正式预览）

```bash
npm run build && npm run preview
```

> 注意：在本机安全沙箱环境下，如 `npm run build` 报错，请使用 `npx vite build --emptyOutDir false`。

### 首次使用（新电脑 / 删过 node_modules）

```bash
npm install && npm --prefix server install
```

---

## 二、网站地址（路由）

| 页面 | 地址 | 说明 |
|---|---|---|
| 公司官网 | `/` | 单页滚动官网，PC/手机自适应 |
| 示例名片 | `/card/wang`（另含 li / zhang / liu） | 示例数据，占位号码 |
| 专属名片 | `/card/8位短码` | 业务人员生成的短链名片，二维码更易扫 |
| 登录页 | `/admin/login` | 内部工具入口，统一账号登录 |
| 工作台 | `/admin` | 登录后的首页：配额、名片数、合同数、快捷入口 |
| 名片管理 | `/admin/cards` | 主管理员与业务员可用；生成/编辑本人名片，主管理员另有「全部名片」 |
| 合同管理 | `/admin/contracts` | 合同台账、统计看板、附件、回收站 |
| 合同详情 | `/admin/contracts/:id` | 单个合同的信息、附件、日志 |
| 用户管理 | `/admin/users` | 主管理员与合同管理员可用（新建账号仅主管理员） |

后台不在官网任何导航中展示（`noindex`），直接输入网址或收藏进入。登录后 **12 小时内免登录**，会话保存在服务端，退出可撤销。

---

## 三、常用修改（改哪里）

| 想改什么 | 改哪个文件 |
|---|---|
| 公司介绍、业务板块、案例、荣誉、客户等官网内容 | `src/data/company.ts` |
| 业务人员示例名片（姓名/职位/电话/微信） | `src/data/members.ts`（当前为示例数据，请替换） |
| 后台账号、角色、密码 | 站点内「用户管理」页面（或服务器 `.env` 的 `INIT_ADMIN_*` 初始化主管理员） |
| 官网配图 | `public/images/`（当前图片截取自公司简介 PDF，可直接替换同名文件） |
| 品牌色 | `tailwind.config.ts` 中的 `brand` 色板 |

改完数据文件后：开发模式（`npm run dev`）下保存即生效；正式预览需重新 `npm run build`。

---

## 四、角色与权限

一套 `users` 账户表，三种角色，登录后按角色收敛菜单与数据范围：

| 角色 | 后台菜单 | 数据范围 |
|---|---|---|
| 主管理员 `admin` | 工作台、名片管理、合同管理、用户管理 | 全部名片与全部合同；可改派名片归属、新建账号 |
| 合同管理员 `contract_admin` | 工作台、合同管理、用户管理 | 全部合同（含金额、导出）；无名片功能 |
| 业务员 `staff` | 工作台、名片管理、合同管理 | 本人名下名片；本人负责的合同（**金额脱敏**，附件仅本人可见） |

> 账号管理：主管理员可新建账号、改角色、重置密码、停用账号；合同管理员可查看账号列表与登录日志。

---

## 五、业务人员如何使用云名片

1. 浏览器打开 `网址/admin/login`，用管理员分配的账号登录
2. 在「名片管理 → 名片生成」填写姓名、职位、手机号、微信号，可上传形象照（自动压缩）
3. 点击"生成专属名片"，获得**短链名片**（`网址/card/8位短码`）和二维码
4. 推荐分享方式：
   - **保存分享图（推荐）**：生成竖版名片海报，发到微信聊天里是一张"名片图"而非一串链接
   - **微信内转发**：在微信打开名片页 → 右上角「···」转发，卡片标题自动显示"姓名 · 职位"
   - **复制链接**：备用方式
5. 名片保存在「我的名片」列表，可打开、编辑或删除；短链可在任意设备打开
6. 历史名片（统一后台之前的存量数据）默认归到首个主管理员名下，主管理员可在「全部名片 → 改派归属」把它交给对应业务员

> 防滥用机制：名片字段有长度/格式校验；每日生成配额**按账号**统计（默认 5 张），IP 另作短时防滥用；`/admin` 与 `/card` 已禁止搜索引擎收录。

---

## 六、技术栈与目录结构

- **技术栈**：Vite 8 + React 18 + TypeScript + Tailwind CSS 3 + react-router-dom 7 + qrcode.react；服务端 Node.js 24 + Express + MySQL（Docker）
- **部署**：`cd deploy && ./deploy.sh` 一键起 web（Nginx 静态站 + 同域 `/api` 反代）+ api（名片 + 合同服务）

```
zhongju-site/
├── public/images/        # 官网配图（源自公司简介 PDF）
├── docs/                 # 方案与修复记录（unified-admin-plan.md、security-fixes.md）
├── deploy/               # 一键部署（web + api 整套）
│   ├── deploy.sh         # 一键脚本：建 .env / 建库 / 构建 / 启动 / 健康检查 / 初始化管理员
│   ├── docker-compose.yml# web + api 两个服务，复用外部 MySQL 网络
│   ├── Dockerfile.web    # 多阶段：node 构建 dist → nginx 运行
│   ├── nginx.conf        # 静态站 + /api 反代 + 缓存策略
│   ├── .env.example      # 通用部署参数模板
│   ├── bootstrap.py      # 首次建库与随机密码初始化
│   ├── verify-deployment.py # 真实数据库与页面验证，自动清理测试名片
│   └── server-notes.example.md # 运维记录模板，真实配置保存在忽略的本地文件中
├── server/               # 服务端（名片 API + 合同 API，同一进程同一库）
│   ├── src/app.js        # 统一认证 + 名片 API + 挂载合同模块（可注入假库，便于测试）
│   ├── src/auth.js       # 统一认证：登录、会话、角色守卫、登录限流与账号锁定
│   ├── src/contracts/    # 合同模块（router.js 接口 / schema.js 建表 / util.js 角色与校验）
│   ├── src/db.js         # MySQL 连接池 + 建表迁移（名片表 + 合同表）
│   ├── src/index.js      # 启动入口
│   ├── sql/init-admin.mjs# 首个主管理员初始化（幂等）+ 存量名片归属迁移
│   ├── sql/init.sql      # 手动建库脚本（一键脚本已自动完成，排错用）
│   ├── Dockerfile / docker-compose.yml   # 只单独跑后端时使用
│   └── test/             # 冒烟测试（内存假库）+ 安全回归 + 合同单测 + 本地联调服务器
├── src/
│   ├── config.ts         # API 基地址
│   ├── data/             # 官网内容与示例名片数据
│   ├── pages/
│   │   ├── Home.tsx      # 官网首页
│   │   └── CardPage.tsx  # 名片展示页（客户看的）
│   ├── admin/            # 统一后台
│   │   ├── api.ts        # 统一 token 与请求封装（名片 / 合同 / 文件下载）
│   │   ├── auth.tsx      # 登录态 Context（401 自动登出）
│   │   ├── types.ts      # 角色、合同类型、格式化工具
│   │   ├── components/   # Layout（顶栏 + 菜单）、Modal、Combobox、ContractForm
│   │   └── pages/        # Login / Dashboard / Cards / Contracts / ContractDetail / Users
│   ├── components/       # 官网区块组件 + TabBar
│   │   ├── CardCreatePanel.tsx  # 名片生成表单 + 我的名片
│   │   └── AdminCardList.tsx    # 全部名片（搜索/停用/删除/改派归属）
│   └── utils/
│       ├── cardCodec.ts  # 名片数据类型与二维码长度阈值
│       ├── cardStore.ts  # 名片服务端接口封装
│       └── poster.ts     # 分享海报（Canvas 绘制，矢量图标）
└── dist/                 # 构建产物（npm run preview 用的就是它）
```

---

## 七、一键部署（Docker，推荐）

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

初始化脚本利用 MySQL 容器内部的 root 配置，创建独立的 `zhongju_cards` 数据库和 `zhongju` 用户，并生成随机数据库密码与随机主管理员密码。配置只写入权限为 `0600` 的 `deploy/.env`；已有配置或同名库/用户时会停止。其他参数可通过 `python3 bootstrap.py --help` 查看。

**更新上线**：

```bash
cd zhongju-site/deploy
./deploy.sh
```

脚本会自动完成 8 件事，全程无需手工编辑文件：

1. 检查 docker / compose，缺了直接报错并给安装链接
2. 没有 `.env` 就从 `.env.example` 复制；`DB_PASSWORD`、`INIT_ADMIN_PASSWORD` 里"请改成…"的占位符**自动换成随机强密码**
3. 校验公共 bridge 网络是否存在（不存在则创建）、`mysql-common` 是否在该网络中
4. 读到 `MYSQL_ROOT_PASSWORD` 就自动在 `mysql-common` 里建库、建用户、授权（幂等，可重复执行），成功后清空该字段
5. 构建镜像并初始化合同附件卷权限，再启动 `web`（Nginx + 静态站）和 `api`（名片 + 合同服务）
6. 轮询 `/api/health` 等 API 起来，失败则返回非零状态并提示查看日志
7. 幂等创建首个主管理员（已存在则跳过），并把存量无归属名片迁到该账号
8. 打印访问地址与后台入口，不输出密码

### 常用命令

| 命令 | 作用 |
|---|---|
| `./deploy.sh` | 首次部署 / 更新上线 |
| `./deploy.sh ps` | 查看容器状态与健康 |
| `./deploy.sh logs api` | 跟踪 API 日志（`logs` 不带参数看全部） |
| `./deploy.sh restart` | 重启容器 |
| `./deploy.sh down` | 停止并移除容器（数据在 MySQL 与 volume 里，不会丢） |

### `deploy/.env` 关键项

| 变量 | 说明 |
|---|---|
| `HTTP_PORT` | 宿主回环端口，默认 `8080`；公网由 NPM 转发到容器 `80` 端口 |
| `DB_HOST` / `DB_PORT` | 公共 MySQL 容器名与端口，默认 `mysql-common:3306` |
| `DB_USER` / `DB_PASSWORD` / `DB_NAME` | 脚本自动建库建用户时使用，默认 `zhongju` / 随机 / `zhongju_cards` |
| `SHARED_NETWORK` | MySQL 与 NPM 所在网络，示例默认值为 `bridge-network`，按目标环境修改 |
| `MYSQL_ROOT_PASSWORD` | **仅首次建库用**，建完自动清空；不填就跳过建库 |
| `INIT_ADMIN_USER` / `INIT_ADMIN_PASSWORD` / `INIT_ADMIN_NAME` | 首个主管理员账号；**首次登录后建议在后台改密码，再从 `.env` 删掉密码** |
| `TOKEN_EXPIRE_HOURS` | 登录会话有效期（小时），默认 12 |
| `DAILY_LIMIT` / `LOGIN_LIMIT` | 每账号每日建卡上限（5）、每 IP 10 分钟错误登录上限（10） |
| `QUOTA_TIME_ZONE` | 业务配额时区，默认 `Asia/Shanghai` |
| `TRUST_PROXY` | 仅信任明确的代理链；Docker 默认 `loopback,uniquelocal`，直接运行 API 使用 `false` |

### 部署后的结构

```
公网 :80 / :443 ─→ [Nginx Proxy Manager] ─→ [web 容器: Nginx]
              ├─ /           静态站（dist，SPA 回退）
              ├─ /admin     统一后台（no-store，noindex）
              └─ /api/*  ──→ [api 容器:8787] ──→ mysql-common (共享网络)
```

前端与接口**同域**，不需要配 CORS；`api` 不映射宿主端口。`web` 的宿主端口仅绑定回环地址（默认 `127.0.0.1:8080`），并通过共享 Docker 网络供 NPM 访问。

`docker-compose.override.yml` 自动叠加网络、端口、健康检查和日志轮转配置。`deploy.sh` 的所有子命令均显式加载两个 Compose 文件；手动使用 `-f` 时也需要同时指定两个文件。

### 域名与 HTTPS

- 将你的站点域名（如 `example.com` 和 `www.example.com`）解析到目标服务器的公网地址
- 在 NPM 中将这些域名配置到同一条 Proxy Host：Scheme 为 `http`，Forward Hostname 为 `zhongju-site-web`，Forward Port 为 `80`
- Advanced 配置为 `client_max_body_size 12m;`，以支持名片头像与合同附件上传（附件单文件 ≤10MB）
- 证书、HTTPS 跳转和续期由用户在 NPM 面板中管理

### 部署验证

在已配置的服务器上执行：

```bash
cd zhongju-site/deploy
python3 verify-deployment.py
# 通过公网入口检查（证书配置完成后）：
python3 verify-deployment.py --base-url https://example.com
```

验证脚本检查页面、静态资源、数据库健康、未登录拦截、主管理员登录、用户管理权限与名片完整流程，并删除临时测试名片；每次执行消耗一次当日生成配额。

### 私有运维信息

将 `deploy/server-notes.example.md` 复制为 `deploy/server-notes.local.md` 后填写实际服务器资料。`*.local.*`、`.env`、密钥和备份文件已列入 Git 与 Docker 构建上下文的忽略规则，公开模板只保留示例参数。

> 只想跑后端、前端交给宿主 Nginx？把 `dist/` 上传到宿主站点根目录，反代 `/api/` 到 `127.0.0.1:8787`（配置可直接抄 `deploy/nginx.conf`），后端单独启动用 `cd server && docker compose up -d --build`。

---

## 八、接口一览

统一认证（`/api/auth/*`，与合同模块共用）：

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| POST | /api/auth/login | 公开 | 账号密码换 12h token（每 IP 限流 + 账号锁定） |
| GET | /api/auth/me | 登录 | 当前账号信息 |
| POST | /api/auth/password | 登录 | 修改本人密码（原密码校验） |
| POST | /api/auth/logout | 登录 | 撤销当前会话 |
| GET | /api/auth/login-logs | admin / contract_admin | 最近 100 条登录日志 |

名片（`/api/*`）：

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| POST | /api/cards | 登录 | 创建名片（默认每账号 5 次/业务日） |
| GET | /api/cards/:code | 公开 | 短码读取（停用只返回状态） |
| PUT | /api/cards/:code | 本人或 admin | 编辑资料，保留原短码 |
| PATCH | /api/cards/:code/status | 本人或 admin | 停用/启用 |
| DELETE | /api/cards/:code | 本人或 admin | 删除 |
| GET | /api/cards | admin | 分页列表，支持 q / status / limit / offset |
| GET | /api/cards/mine | 登录 | 当前账号名下的名片列表 |
| PUT | /api/cards/:code/owner | admin | 改派归属（传 `user_id`） |
| GET | /api/quota | 登录 | 本账号当日配额与重置时间 |
| GET | /api/health | 公开 | 健康检查 |

合同（`/api/contract/*`）：合同与客户 CRUD、`/contracts/stats` 统计、`/contracts/export` 导出、附件上传下载、`/users` 账号管理。业务员只能看到本人负责的合同，金额字段脱敏。

---

## 九、合同管理模块

公司内部业务合同台账，与本项目**共用同一个 Express 进程（`/api/contract/*`）、同一个 MySQL 库（zhongju_cards）、同一套前端构建与同一套账号体系**，入口在后台「合同管理」。

- **角色**：见「四、角色与权限」；业务员（`staff`）现在也可登录，只能看到本人负责的合同且金额脱敏
- **数据表**：`users`、`contract_sessions`、`contract_customers`、`contracts`、`contract_files`、`contract_logs`、`contract_login_logs`（服务端启动时自动建表）
- **附件**：Docker volume `contract-files`（api 容器 `/data/files`），单文件 ≤10MB，仅 PDF/JPG/PNG
- **功能**：合同台账（搜索/类型/状态/负责人筛选、导出 Excel）、统计看板（在履行/本月新签/30天内到期/已到期 + 三大类分类）、附件在线预览（PDF/图片）与下载、回收站（删除合同仅管理员可见、可恢复）、操作日志、登录日志与账号锁定

**首次初始化**：部署脚本已自动创建主管理员（`INIT_ADMIN_*`）。之后用该账号登录 `网址/admin`，在「用户管理」里创建合同管理员与业务员账号。

---

## 十、安全修复与升级

统一后台方案见 [`docs/unified-admin-plan.md`](docs/unified-admin-plan.md)，历史修复与数据迁移记录见 [`docs/security-fixes.md`](docs/security-fixes.md)。开发环境需 Node.js 22.12+；Docker 使用 Node.js 24。运行 `npm ci`、`npm --prefix server ci` 后执行 `npm test` 与 `npm run build`。
