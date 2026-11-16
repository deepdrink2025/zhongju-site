# 中聚人力 · 业务合同管理系统

公司内部合同台账系统：独立账号登录、客户（用工单位）管理、合同录入与生命周期、扫描件附件、到期提醒、角色权限（管理员/财务/业务员/只读）、操作留痕。与官网/名片系统部署在同一台服务器、同一域名下，路径 `/contracts`。

> 方案文档见 `../docs/合同管理系统方案.md`（V1 定稿）。

## 一、技术栈与结构

- 前端：Vite + React 18 + TypeScript + Tailwind（base = `/contracts/`）
- 服务端：Node.js 24 + Express + MySQL（独立容器 `contract-api`，端口 8790，不直接暴露公网）
- 数据库：公共 MySQL 容器中独立库 `zhongju_contracts`（与名片库分离）
- 附件：Docker volume `contract-files`，单文件 ≤10MB，仅 PDF/JPG/PNG

```
zhongju-contracts/
├── server/    # contract-api（账号/客户/合同/附件/日志接口）
├── web/       # /contracts 前端
├── deploy/    # 一键部署（compose + nginx + deploy.sh）
└── docs/
```

## 二、本地开发

```bash
# 服务端（需本地 MySQL 或 Docker，配好环境变量）
cd server
cp .env.example .env   # 自行配置 DB_*
npm install
npm run dev            # 监听 :8790
npm test               # 工具函数单测

# 前端（dev 模式自动代理 /api/contract → 127.0.0.1:8790）
cd web
npm install
npm run dev            # http://localhost:5173/contracts/
npm run build          # 类型检查 + 构建
```

## 三、服务器部署

前置条件与名片系统相同：Docker + Compose、公共 MySQL 容器（默认名 `mysql-common`）、Nginx Proxy Manager（默认网络 `bridge-network`）。

**首次部署**：

```bash
cd zhongju-contracts/deploy
# （可选）先编辑 .env.example 里的 SHARED_NETWORK / HTTP_PORT
./deploy.sh
```

脚本自动完成：生成随机 DB_PASSWORD → 建库建用户（首次填 `MYSQL_ROOT_PASSWORD`，成功后自动清空）→ 构建启动 `contract-api` + `contract-web` → 健康检查。

**更新上线**：改完代码再跑一次 `./deploy.sh`。

**NPM（Nginx Proxy Manager）配置**——在官网域名的 Proxy Host 里：

1. 添加自定义位置（Custom Location）：
   - `/contracts` → Scheme `http`，Forward Hostname `contract-web`，Forward Port `80`
2. 在该 Proxy Host 的 Advanced 中确认/加入（附件上传需要）：

```nginx
client_max_body_size 12m;
```

配置完成后访问 `https://你的域名/contracts/` 即进入登录页。

## 四、首次初始化账号

系统内没有预置账号，首次需手动创建管理员（在服务器执行一次）：

```bash
docker compose -f deploy/docker-compose.yml exec contract-api node -e "
const { createPool } = await import('/app/dist-noop.js').catch(()=>({}));
" 2>/dev/null || true
```

更简单的方式——直接用容器内一次性脚本：

```bash
docker compose -f deploy/docker-compose.yml exec contract-api node --input-type=module -e "
import { createPool } from './src/db.js';
import { hashPassword } from './src/util.js';
const pool = await createPool();
const { salt, hash } = hashPassword('你的管理员密码8位以上');
await pool.query(\"INSERT INTO users (name, username, role, salt, password_hash) VALUES ('管理员','admin','admin',?,?) ON DUPLICATE KEY UPDATE salt=VALUES(salt), password_hash=VALUES(password_hash), status='active'\", [salt, hash]);
console.log('管理员账号创建完成：admin');
process.exit(0);
"
```

然后用 `admin` / 你设置的密码登录 `/contracts/`，在「用户管理」里为其他同事建号（财务/业务员/只读）。

## 五、角色与权限速查

| 角色 | 权限 |
|---|---|
| 管理员 | 全部合同增删改、状态操作（续签/终止/恢复）、客户管理、用户管理 |
| 财务 | 查看全部合同与金额、导出（M2）；不可修改业务数据 |
| 业务员 | 新增客户、录入/编辑**本人负责**的合同、上传附件；**看不到金额** |
| 只读 | 浏览台账与详情（不含金额） |

金额为选填字段，接口层按角色过滤——业务员/只读角色从 API 就拿不到金额数据。

## 六、备份与恢复

**备份**（数据库 + 附件卷，默认保留 14 天）：

```bash
cd zhongju-contracts/deploy
chmod +x backup.sh
./backup.sh                              # 手动执行，备份到 /opt/backups/zhongju-contracts

# 每天凌晨 2:30 自动备份（crontab -e 加入）：
30 2 * * * cd /opt/zhongju-contracts/deploy && ./backup.sh >> /var/log/zhongju-backup.log 2>&1
```

备份文件命名：`db-zhongju_contracts-时间戳.sql.gz`、`files-时间戳.tar.gz`。保留天数可用 `KEEP_DAYS=30 ./backup.sh` 覆盖。

**恢复数据库**：

```bash
gunzip < /opt/backups/zhongju-contracts/db-zhongju_contracts-XXXX.sql.gz | \
  docker exec -i mysql-common mysql -u zhongju_contract -p'密码' zhongju_contracts
```

**恢复附件**（解包覆盖回 volume）：

```bash
docker run --rm -i -v zhongju-contracts_contract-files:/data alpine \
  sh -c 'cd /data && tar xzf -' < /opt/backups/zhongju-contracts/files-XXXX.tar.gz
```

## 七、上线后验证

```bash
python3 deploy/verify-deployment.py https://你的域名/contracts 用户名 密码
```

依次检查：前端页面 → API 健康检查（数据库连通）→ 错误密码被拒 → 正常登录 → 合同列表 → 统计看板 → 未登录请求被拒。全部通过输出 `N/N 项通过` 并以退出码 0 结束。

## 八、常用运维

```bash
cd zhongju-contracts/deploy
docker compose ps                        # 容器状态
docker compose logs -f contract-api      # API 日志
docker compose down                      # 停止（数据在 MySQL 与 volume 中，不会丢）
docker run --rm --network bridge-network -v zhongju-contracts_contract-files:/data alpine \
  ls -lh /data                           # 查看附件文件
```

## 九、使用说明补充

- **统计看板**：台账页顶部有总览卡（在履行 / 本月新签 / 30 天内到期 / 已到期）与按客户、我方签约主体、业务负责人的维度汇总表。金额合计仅管理员与财务可见，且只统计单位为「元」的固定总额；元/时/人 等单价类金额需乘以人数与周期才有意义，仅以「N 份单价类」提示不直接相加。
- **回收站**：管理员删除合同后进入回收站（列表状态筛选选「已删除（回收站）」），仅管理员可见，可在详情页点「恢复合同」找回；其他角色访问已删除合同一律返回不存在。
- **附件预览**：详情页附件支持「预览」（图片直接显示、PDF 内嵌浏览）与「下载」两种方式。

## 十、与名片系统的关系

- 完全独立：独立代码目录、独立容器、独立数据库，互不影响
- 同一域名：官网（`/`）+ 名片（`/admin`、`/card/*`）+ 合同（`/contracts`）共用证书与 NPM 入口
