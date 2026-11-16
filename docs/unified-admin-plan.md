# 统一后台管理方案（名片管理 + 合同管理）· v3（已实施）

> 状态：**已实施完成**（决策点 D1-D4 均按建议执行）
> 日期：2026-11-16（v2：项目未正式运营，去除全部旧系统兼容与过渡设计，全新体系；v3：补充实施结果）
> 前提：仅保留两类既有数据——① 名片数据（zhongju_cards 库 cards 表）；② 官网企业页面内容。其余（旧口令、恢复码、旧会话、旧链接）一律弃用。

## 实施结果速览

| 项 | 结果 |
|---|---|
| 后端 | `server/src/auth.js` 统一认证；`app.js` 重写为 `/api/auth/*` + 名片 API；`/api/contract/*` 保留 |
| 数据 | `cards.owner_user_id`、`card_daily_usage(user_id, day_key)`、`card_sessions` 已删除；迁移幂等 |
| 初始化 | `server/sql/init-admin.mjs`（幂等）+ 存量名片归属迁移 |
| 前端 | `src/admin/` 全套（api / auth / types / components / pages）；`src/contracts/` 已并入并删除 |
| 路由 | `/admin`、`/admin/login`、`/admin/cards`、`/admin/contracts`、`/admin/contracts/:id`、`/admin/users` |
| 部署 | `.env` 去双口令与 `TOKEN_SECRET`，改用 `INIT_ADMIN_*`；`deploy.sh` 自动创建主管理员 |
| 测试 | 服务端 35 + 10 + 5 全通过；前端 8 项全通过；部署回归 2 项通过；`npm run build` 通过 |

实际与方案的差异：
1. 合同页面直接迁入 `src/admin/{pages,components}`，`src/contracts/` 目录整体删除（未保留兼容层）。
2. `CardCreatePanel` / `AdminCardList` 保留在 `src/components/`（官网与后台共用），仅清理口令与恢复码逻辑。
3. `src/utils/cardCodec.ts` 精简为类型 + 二维码长度阈值，`encodeCard`/`decodeCard`/本地存储全部移除。
4. 改派归属弹窗改为**选择账号**（`GET /api/contract/users`）而非输入恢复码。


## 一、目标

将名片管理与合同管理合并为一个统一后台：

- **唯一账户源**：`users` 表（用户名 + 密码），删除口令制与恢复码机制。
- **一次登录**：登录后按角色使用名片 / 合同 / 用户管理功能。
- **全新路由**：不做旧链接重定向，直接启用新路由体系。

## 二、现状要点（研读结论）

- 服务端单进程（`server/src/app.js`）：名片 API + 合同路由共用连接池与库 `zhongju_cards`，合并无进程层面障碍。
- 合同模块认证（`server/src/contracts/auth.js`）已具备 users 登录、scrypt 密码、IP 限流、账号锁定、登录日志、`requireRole` —— 直接作为统一认证基座。
- 名片模块的口令登录（ADMIN/STAFF_TOKEN + HMAC token + `card_sessions`）与恢复码归属（`owner_key` = 设备恢复码 hash）整体废弃重写。
- 前端两套登录（sessionStorage `zhongju_card_auth` / localStorage `ct_token`）合并为一套。

## 三、统一体系设计

### 3.1 角色模型（沿用 users 表现有三角色，无需改表结构）

| 角色 | 名片 | 合同 | 用户管理 |
|---|---|---|---|
| `admin` 主管理员 | 全部名片（创建/编辑/停用/删除/分配） | 全部合同 + 金额 | ✔ |
| `contract_admin` 合同管理员 | 不开放 | 全部合同 + 金额 | 查看 |
| `staff` 业务员（可登录） | 创建/管理本人名片（每日 5 张配额） | 名下合同列表可见，金额脱敏（见 D1） | ✘ |

### 3.2 数据层改造

| 表 | 处理 |
|---|---|
| `users` | 保留为唯一账户表（admin / contract_admin / staff），staff 改为可登录（有密码） |
| `cards` | 新增 `owner_user_id`（外键 users.id）；迁移脚本将**全部存量名片归属首个 admin 账户**，需要时 admin 在后台改派（见 D3） |
| `card_sessions`、`card_daily_usage`（按设备） | 删除；配额表重建为按 `user_id` 统计（`card_daily_usage(user_id, day_key, used)`） |
| `contract_sessions` | 保留为唯一会话表 |
| 恢复码机制 | 整体删除（前端恢复码入口、`owner_key` 逻辑、`/api/cards/:code/owner` 按设备分配接口改为按用户分配） |

### 3.3 后端 API 设计（全新，不留旧端点）

```
POST /api/auth/login          统一登录（限流 + 账号锁定 + 登录日志）
POST /api/auth/logout
GET  /api/auth/me

GET  /api/quota               本人今日建卡配额
GET  /api/cards               admin：全量名片列表
GET  /api/cards/mine          staff/admin：本人名片
POST /api/cards               创建名片（配额按用户）
GET  /api/cards/:code         公开（活跃状态信息）
GET  /api/cards/:code/manage  本人或 admin
PUT  /api/cards/:code         编辑
PATCH /api/cards/:code/status 停用/启用（admin）
PUT  /api/cards/:code/owner   admin 改派归属（body: user_id）
DELETE /api/cards/:code       删除（本人或 admin）

/api/contract/*               合同模块路由原样保留
```

- 认证中间件统一为 `authRequired` + `requireRole`（来自 contracts/auth.js），名片路由全部切换。
- 删除：`/api/admin/login|me|logout`、HMAC 签名逻辑、`verify()`、恢复码 deviceId 校验。
- 环境变量精简：移除 `ADMIN_TOKEN`、`STAFF_TOKEN`、`TOKEN_SECRET`；保留 `TOKEN_EXPIRE_HOURS`、限流参数等。
- 首个 admin 账户由一次性初始化脚本创建（`server/sql/init-admin.mjs`：读环境变量 `INIT_ADMIN_USER/INIT_ADMIN_PASSWORD`，幂等）。

### 3.4 前端路由体系（全新）

```
/                       官网首页（不动）
/card/:code             公开名片页（不动）
/admin/login            统一登录页
/admin                  工作台（名片/合同概览卡片）
/admin/cards            名片管理（创建 + 列表，沿用现组件）
/admin/contracts        合同列表
/admin/contracts/:id    合同详情
/admin/users            用户管理（admin / contract_admin 可查看，仅 admin 可增改）
*                       → 官网首页
```

- 删除 `/contracts/*` 与 `/create` 路由，不做重定向。
- Token 统一存 localStorage（单一键名），401 统一跳 `/admin/login`。
- 代码结构：`src/admin/`（Layout、登录页、AuthContext、api.ts）；名片组件（CardCreatePanel / AdminCardList）与合同页面（Contracts / ContractDetail / Users）迁入并在 Layout 内按角色渲染菜单。
- 删除：`src/utils/cardAuth.ts`、`src/utils/cardStore.ts` 的口令/恢复码/本地存储逻辑（cardStore 仅前端阶段遗留，服务端模式下清理）；`src/contracts/api.ts` 合并进 `src/admin/api.ts`。

### 3.5 部署注意（数据保留）

- MySQL 容器与 `zhongju_cards` 库不动，迁移脚本幂等执行列新增与数据改写。
- 官网页面内容（`src/pages`、`src/data`、`src/components` 官网部分）不动。
- `deploy/` 更新：docker-compose 环境变量去掉双口令与 TOKEN_SECRET；nginx 不变；部署脚本健康检查不变。

## 四、待确认决策点

| # | 决策点 | 建议 |
|---|---|---|
| D1 | staff 是否可登录查看本人名下合同（金额脱敏）？ | 可以，便于业务员跟进 |
| D2 | contract_admin 是否开放名片功能？ | 不开放，职责清晰 |
| D3 | 存量名片归属：统一归首个 admin，还是保留待分配？ | 统一归 admin（项目未运营，数据量小，后续手动改派即可） |
| D4 | 初始 admin 账户用户名与密码来源？ | 环境变量注入初始化脚本，首登后可在用户管理改密 |

## 五、实施计划（三阶段）

### 阶段 1：后端统一
1. 抽出统一认证模块 `server/src/auth.js`（基于 contracts/auth.js，含登录日志与限流）。
2. 名片 API 重写（见 3.3），`owner_user_id` 列 + 配额表重建 + 迁移逻辑并入 `ensureSchema`（幂等）。
3. 删除口令/HMAC/恢复码相关代码（`app.js` 签名段、`/api/admin/*`、owner 按设备分配）；`validateProductionSecrets` 相应精简。
4. 新增 `init-admin.mjs`；更新测试（`server/test/`：fake 仓储、smoke、security）。

### 阶段 2：前端统一
1. 新建 `src/admin/`（Layout / 登录页 / AuthContext / api.ts）。
2. 名片管理、合同管理页面迁入 `/admin/*` 路由；删除旧 `/contracts`、`/create`、双 token 逻辑。
3. 工作台概览页（简单统计卡：名片总数/本月合同/即将到期）。
4. 更新 `test/frontend.test.mjs`。

### 阶段 3：部署切换与收尾
1. `deploy/` 环境变量与 bootstrap 脚本更新；创建 admin 账户。
2. 线上验证：公开名片页短链可访问（既有数据保留）、统一后台各角色功能正常。
3. 全量回归 `npm test`；更新 `docs/security-fixes.md` / README。

## 六、验收标准

1. 一个账户一次登录即进入 `/admin`，按角色渲染菜单与权限（越权接口 403）。
2. staff 可创建/管理本人名片（每日 5 张配额），不能操作他人名片。
3. 既有名片数据短链 `/card/:code` 全部可访问，官网页面不受影响。
4. 旧口令登录、恢复码、`/contracts` 旧路由全部不存在（404 或回到官网）。
5. 全部测试通过，部署脚本健康检查通过。
