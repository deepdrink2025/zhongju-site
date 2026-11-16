#!/usr/bin/env bash
# 中聚人力合同管理系统 一键部署
# 用法：cd zhongju-contracts/deploy && ./deploy.sh
set -euo pipefail

cd "$(dirname "$0")"

COMPOSE_FILES=(-f docker-compose.yml)

step() { echo "==> $*"; }

# 1. docker / compose 检查
if ! command -v docker >/dev/null 2>&1; then
  echo "错误：未安装 docker，请先安装 https://docs.docker.com/get-docker/" >&2
  exit 1
fi
docker compose version >/dev/null 2>&1 || docker compose ls >/dev/null 2>&1 || {
  echo "错误：缺少 Docker Compose 插件" >&2
  exit 1
}

# 2. .env 准备
if [ ! -f .env ]; then
  cp .env.example .env
  chmod 600 .env
fi

if grep -q '^DB_PASSWORD=请改成随机强密码' .env || ! grep -q '^DB_PASSWORD=' .env; then
  RAND=$(node -e 'console.log(require("crypto").randomBytes(18).toString("base64url"))' 2>/dev/null \
    || openssl rand -base64 18 | tr '+/' '-_' | tr -d '= \n')
  sed -i.bak "s/^DB_PASSWORD=.*/DB_PASSWORD=${RAND}/" .env && rm -f .env.bak
  step "已生成随机 DB_PASSWORD"
fi

set -a
source .env
set +a

# 3. 共享网络
NETWORK="${SHARED_NETWORK:-bridge-network}"
if ! docker network inspect "$NETWORK" >/dev/null 2>&1; then
  step "创建共享网络 $NETWORK"
  docker network create "$NETWORK"
fi
if [ -n "${MYSQL_HOST:-}" ]; then MYSQL_CONTAINER="$MYSQL_HOST"; else MYSQL_CONTAINER="${DB_HOST:-mysql-common}"; fi
if docker network inspect "$NETWORK" --format '{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null | grep -qw "$MYSQL_CONTAINER"; then
  step "MySQL 容器 $MYSQL_CONTAINER 已在网络 $NETWORK 中"
else
  docker network connect "$NETWORK" "$MYSQL_CONTAINER" 2>/dev/null && step "已将 $MYSQL_CONTAINER 接入 $NETWORK" || true
fi

# 4. 首次建库建用户（利用 MYSQL_ROOT_PASSWORD，成功后自动清空该字段）
if [ -n "${MYSQL_ROOT_PASSWORD:-}" ]; then
  step "在 $MYSQL_CONTAINER 中创建数据库与用户"
  docker exec "$MYSQL_CONTAINER" mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "
    CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` DEFAULT CHARSET utf8mb4;
    CREATE USER IF NOT EXISTS '$DB_USER'@'%' IDENTIFIED BY '$DB_PASSWORD';
    ALTER USER '$DB_USER'@'%' IDENTIFIED BY '$DB_PASSWORD';
    GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'%';
    FLUSH PRIVILEGES;" && {
    sed -i.bak 's/^MYSQL_ROOT_PASSWORD=.*/MYSQL_ROOT_PASSWORD=/' .env && rm -f .env.bak
    step "建库完成，已清空 .env 中的 MYSQL_ROOT_PASSWORD"
  }
fi

# 5. 构建并启动
step "构建并启动 contract-api + contract-web"
docker compose "${COMPOSE_FILES[@]}" up -d --build

# 6. 健康检查
step "等待 API 就绪"
HEALTH_OK=0
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${HTTP_PORT:-8090}/api/contract/health" >/dev/null 2>&1; then
    HEALTH_OK=1
    break
  fi
  sleep 2
done
if [ "$HEALTH_OK" != "1" ]; then
  echo "错误：API 健康检查未通过，请查看日志：docker compose -f docker-compose.yml logs contract-api" >&2
  exit 1
fi
step "API 就绪 ✓"

echo
echo "部署完成。"
echo "  容器入口： http://127.0.0.1:${HTTP_PORT:-8090}/contracts/"
echo "  下一步（Nginx Proxy Manager 面板）："
echo "    在官网域名的 Proxy Host 中添加自定义位置："
echo "      /contracts  →  http://contract-web:80"
echo "    并在 Advanced 里把 client_max_body_size 调大（附件 10MB 上限）："
echo "      client_max_body_size 12m;"
echo "  初始账号：首次部署后需手动创建管理员（见 README「首次初始化」）。"
