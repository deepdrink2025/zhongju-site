#!/usr/bin/env bash
# 中聚人力官网 + 名片系统 · 一键部署脚本
#
# 用法（在服务器上）：
#   cd zhongju-site/deploy
#   ./deploy.sh              # 首次部署 / 更新上线（自动建 .env、建库、构建、启动）
#   ./deploy.sh ps           # 查看容器状态
#   ./deploy.sh logs         # 跟踪日志（Ctrl+C 退出）
#   ./deploy.sh restart      # 重启
#   ./deploy.sh down         # 停止并移除容器（数据在 MySQL 里，不会丢）
#
# 脚本做的事：
#   1. 检查 docker / compose
#   2. 没有 .env 就自动从 .env.example 复制；占位符（"请改成…"）自动换成随机强密码
#   3. 校验公共 bridge 网络、DB 容器是否就绪
#   4. 填了 MYSQL_ROOT_PASSWORD 就自动在 mysql-common 里建库、建用户并授权
#   5. docker compose up -d --build（web + api 一起）
#   6. 轮询 /api/health，等接口起来（失败则给出看日志的命令）
#   7. 幂等创建首个主管理员账号（已完成则跳过），并迁移存量名片归属
#   8. 打印访问地址与后台入口

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ENV_FILE="$SCRIPT_DIR/.env"
ENV_EXAMPLE="$SCRIPT_DIR/.env.example"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
COMPOSE_OVERRIDE="$SCRIPT_DIR/docker-compose.override.yml"

# ---------- 输出 ----------
if [ -t 1 ]; then
  C_INFO=$'\033[36m'; C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_B=$'\033[1m'; C_0=$'\033[0m'
else
  C_INFO=''; C_OK=''; C_WARN=''; C_ERR=''; C_B=''; C_0=''
fi
info() { printf '%s==>%s %s\n' "$C_INFO" "$C_0" "$*"; }
ok()   { printf '%s  ✓%s %s\n' "$C_OK" "$C_0" "$*"; }
warn() { printf '%s  ! %s%s\n' "$C_WARN" "$*" "$C_0"; }
die()  { printf '%s  ✗ %s%s\n' "$C_ERR" "$*" "$C_0" >&2; exit 1; }

# ---------- 读取 / 写入 .env ----------
get_env() { # get_env KEY
  local key="$1" line
  line="$(grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | tail -n1 || true)"
  printf '%s' "${line#*=}"
}

set_env() { # set_env KEY VALUE（值为随机串，无特殊字符）
  local key="$1" val="$2" tmp
  tmp="$(mktemp)"
  awk -v k="$key" -v v="$val" '
    BEGIN { done = 0 }
    $0 ~ ("^" k "=") { print k "=" v; done = 1; next }
    { print }
    END { if (!done) print k "=" v }
  ' "$ENV_FILE" > "$tmp"
  mv "$tmp" "$ENV_FILE"
}

is_placeholder() { case "$1" in *"请改成"*|"") return 0 ;; *) return 1 ;; esac; }

rand_secret() { # rand_secret [长度]
  local n="${1:-24}"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$((n / 2 + 1))" | cut -c1-"$n"
  else
    LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c "$n"
  fi
}

# ---------- 子命令 ----------
detect_compose() {
  if docker compose version >/dev/null 2>&1; then
    DC=(docker compose)
  elif command -v docker-compose >/dev/null 2>&1; then
    DC=(docker-compose)
  else
    die "未找到 docker compose。请安装 Docker + Compose v2：https://docs.docker.com/engine/install/"
  fi
}

load_env() {
  HTTP_PORT="$(get_env HTTP_PORT)";      HTTP_PORT="${HTTP_PORT:-8080}"
  DB_HOST="$(get_env DB_HOST)";          DB_HOST="${DB_HOST:-mysql-common}"
  DB_PORT="$(get_env DB_PORT)";          DB_PORT="${DB_PORT:-3306}"
  DB_USER="$(get_env DB_USER)";          DB_USER="${DB_USER:-zhongju}"
  DB_PASSWORD="$(get_env DB_PASSWORD)"
  DB_NAME="$(get_env DB_NAME)";          DB_NAME="${DB_NAME:-zhongju_cards}"
  SHARED_NETWORK="$(get_env SHARED_NETWORK)"; SHARED_NETWORK="${SHARED_NETWORK:-bridge-network}"
  MYSQL_ROOT_PASSWORD="$(get_env MYSQL_ROOT_PASSWORD)"
  INIT_ADMIN_USER="$(get_env INIT_ADMIN_USER)";         INIT_ADMIN_USER="${INIT_ADMIN_USER:-admin}"
  INIT_ADMIN_PASSWORD="$(get_env INIT_ADMIN_PASSWORD)"
  INIT_ADMIN_NAME="$(get_env INIT_ADMIN_NAME)";         INIT_ADMIN_NAME="${INIT_ADMIN_NAME:-主管理员}"
}

wait_http() { # wait_http URL 秒数
  local url="$1" tries="${2:-40}" i
  for ((i = 0; i < tries; i++)); do
    if command -v curl >/dev/null 2>&1; then
      curl -fsS --max-time 3 "$url" >/dev/null 2>&1 && return 0
    else
      wget -q -T 3 -O /dev/null "$url" 2>/dev/null && return 0
    fi
    sleep 2
  done
  return 1
}

do_deploy() {
  info "检查运行环境"
  command -v docker >/dev/null 2>&1 || die "未找到 docker，请先安装：https://docs.docker.com/engine/install/"
  docker info >/dev/null 2>&1 || die "docker 未运行或当前用户无权限（可试 sudo，或把用户加入 docker 组）"
  detect_compose
  ok "docker + ${DC[*]} 可用"

  # ---- 1. .env ----
  if [ ! -f "$ENV_FILE" ]; then
    [ -f "$ENV_EXAMPLE" ] || die "缺少 $ENV_EXAMPLE"
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    info "已生成 ${ENV_FILE}（首次部署）"
  fi
  load_env

  # ---- 2. 自动填充占位符 ----
  local changed=0
  if is_placeholder "$DB_PASSWORD"; then
    DB_PASSWORD="$(rand_secret 20)"; set_env DB_PASSWORD "$DB_PASSWORD"; changed=1
  fi
  if is_placeholder "$INIT_ADMIN_PASSWORD"; then
    INIT_ADMIN_PASSWORD="$(rand_secret 20)"; set_env INIT_ADMIN_PASSWORD "$INIT_ADMIN_PASSWORD"; changed=1
  fi
  [ "$changed" = 1 ] && ok "已把密码占位符替换为随机强密码（见 deploy/.env）"
  [[ "$INIT_ADMIN_USER" =~ ^[a-zA-Z0-9_-]{3,30}$ ]] || die "INIT_ADMIN_USER 需为 3-30 位字母、数字、中划线或下划线"
  [ "${#INIT_ADMIN_PASSWORD}" -ge 8 ] || die "INIT_ADMIN_PASSWORD 至少 8 位"

  # ---- 3. 网络 ----
  if docker network inspect "$SHARED_NETWORK" >/dev/null 2>&1; then
    ok "公共网络 $SHARED_NETWORK 存在"
  else
    warn "公共网络 $SHARED_NETWORK 不存在，正在创建…"
    docker network create --driver bridge "$SHARED_NETWORK" >/dev/null || die "创建网络失败"
    warn "若 MySQL 容器不在该网络内，请执行：docker network connect $SHARED_NETWORK $DB_HOST"
  fi

  # ---- 4. 数据库 ----
  if docker inspect "$DB_HOST" >/dev/null 2>&1; then
    local nets
    nets="$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$DB_HOST" 2>/dev/null || true)"
    case " $nets " in
      *" $SHARED_NETWORK "*) ok "MySQL 容器 $DB_HOST 已在 $SHARED_NETWORK 网络内" ;;
      *) warn "MySQL 容器 $DB_HOST 不在 $SHARED_NETWORK 网络内，请执行：docker network connect $SHARED_NETWORK $DB_HOST" ;;
    esac

    if [ -n "$MYSQL_ROOT_PASSWORD" ]; then
      info "在 $DB_HOST 中初始化库 $DB_NAME 与用户 $DB_USER"
      local esc_pw esc_name esc_user
      esc_pw="$(printf '%s' "$DB_PASSWORD" | sed "s/'/''/g")"
      esc_user="$(printf '%s' "$DB_USER" | sed "s/'/''/g")"
      esc_name="$(printf '%s' "$DB_NAME" | sed "s/'/''/g")"
      if {
        printf '%s\n' "$MYSQL_ROOT_PASSWORD"
        cat <<SQL
SET NAMES utf8mb4;
CREATE DATABASE IF NOT EXISTS \`$esc_name\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$esc_user'@'%' IDENTIFIED BY '$esc_pw';
ALTER USER '$esc_user'@'%' IDENTIFIED BY '$esc_pw';
GRANT ALL PRIVILEGES ON \`$esc_name\`.* TO '$esc_user'@'%';
FLUSH PRIVILEGES;
SQL
      } | docker exec -i "$DB_HOST" sh -c 'IFS= read -r MYSQL_PWD; export MYSQL_PWD; exec mysql -uroot' >/dev/null 2>&1; then
        ok "数据库就绪（表结构由 API 启动时自动创建）"
        set_env MYSQL_ROOT_PASSWORD ""   # 建库成功后清空，避免 root 密码留在文件里
        ok "已清空 .env 里的 MYSQL_ROOT_PASSWORD（root 密码不必留在文件中）"
      else
        warn "自动建库失败（root 密码不正确、或 $DB_HOST 容器里没有 mysql 客户端）。"
        warn "请手动执行：docker exec -i $DB_HOST mysql -uroot -p < ../server/sql/init.sql"
      fi
    else
      info "未填 MYSQL_ROOT_PASSWORD，跳过自动建库（库已建好时属正常）。首次部署请手动执行："
      printf '        docker exec -i %s mysql -uroot -p < ../server/sql/init.sql\n' "$DB_HOST"
      warn "并确保 init.sql 里的用户/密码与 deploy/.env 的 DB_USER / DB_PASSWORD 一致"
    fi
  else
    warn "未找到名为 $DB_HOST 的容器。如果 MySQL 在别的机器/容器上，请改 deploy/.env 的 DB_HOST / DB_PORT。"
  fi

  # ---- 5. 构建 + 启动 ----
  info "构建镜像并启动（首次构建约 1-3 分钟）"
  "${DC[@]}" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" -f "$COMPOSE_OVERRIDE" up -d --build
  ok "容器已启动"

  # ---- 6. 健康检查 ----
  info "等待服务就绪"
  local base="http://127.0.0.1:${HTTP_PORT}"
  if wait_http "$base/api/health" 45; then
    ok "API 健康检查通过"
  else
    warn "API 还没起来，看日志排查："
    printf '        %s --env-file %s -f %s -f %s logs --tail=80 api\n' "${DC[*]}" "$ENV_FILE" "$COMPOSE_FILE" "$COMPOSE_OVERRIDE"
    die "健康检查失败，部署未就绪"
  fi

  # ---- 7. 首个主管理员（幂等） ----
  info "初始化主管理员账号（已存在则跳过）"
  if "${DC[@]}" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" -f "$COMPOSE_OVERRIDE" \
      exec -T \
      -e INIT_ADMIN_USER="$INIT_ADMIN_USER" \
      -e INIT_ADMIN_PASSWORD="$INIT_ADMIN_PASSWORD" \
      -e INIT_ADMIN_NAME="$INIT_ADMIN_NAME" \
      api node sql/init-admin.mjs; then
    ok "主管理员就绪：$INIT_ADMIN_USER"
  else
    warn "主管理员初始化失败，请手动执行："
    printf '        %s exec -T api node sql/init-admin.mjs\n' "${DC[*]}"
  fi

  # ---- 8. 汇总 ----
  echo
  printf '%s================ 部署完成 ================%s\n' "$C_B" "$C_0"
  printf '  官网首页      %s/\n' "$base"
  printf '  管理后台      %s/admin（登录名 %s）\n' "$base" "$INIT_ADMIN_USER"
  printf '  健康检查      %s/api/health\n' "$base"
  printf '  公网入口      Nginx Proxy Manager → http://zhongju-site-web:80\n'
  printf '  域名与证书    在 Nginx Proxy Manager 面板中配置\n'
  echo
  printf '  管理员密码保存在 %s 的 INIT_ADMIN_PASSWORD（权限应为 0600）\n' "$ENV_FILE"
  printf '  首次登录后建议在后台「修改密码」里改掉，再从 .env 删除该变量\n'
  echo
  printf '  常用命令：./deploy.sh ps | logs | restart | down\n'
  printf '%s==========================================%s\n' "$C_B" "$C_0"
}

require_env() {
  [ -f "$ENV_FILE" ] || die "还没有 ${ENV_FILE}，请先运行 ./deploy.sh 完成首次部署"
}

case "${1:-deploy}" in
  deploy|up)
    do_deploy
    ;;
  ps|status)
    detect_compose; require_env
    "${DC[@]}" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" -f "$COMPOSE_OVERRIDE" ps
    ;;
  logs)
    detect_compose; require_env
    if [ -n "${2:-}" ]; then
      "${DC[@]}" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" -f "$COMPOSE_OVERRIDE" logs -f --tail=100 "$2"
    else
      "${DC[@]}" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" -f "$COMPOSE_OVERRIDE" logs -f --tail=100
    fi
    ;;
  restart)
    detect_compose; require_env
    "${DC[@]}" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" -f "$COMPOSE_OVERRIDE" restart
    ;;
  down)
    detect_compose; require_env
    "${DC[@]}" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" -f "$COMPOSE_OVERRIDE" down
    ;;
  *)
    sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
