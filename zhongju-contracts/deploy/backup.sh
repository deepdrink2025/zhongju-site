#!/usr/bin/env bash
# 中聚合同管理系统 —— 数据库 + 附件 备份脚本
# 用法：
#   1. 建议放到服务器 /opt/zhongju-contracts/deploy/ 下
#   2. chmod +x backup.sh
#   3. 手动执行： ./backup.sh
#   4. 定时执行（每天凌晨 2:30）：crontab -e 加入
#      30 2 * * * cd /opt/zhongju-contracts/deploy && ./backup.sh >> /var/log/zhongju-backup.log 2>&1
# 依赖：docker（mysql-common 容器）、deploy/.env 中的 DB_* 配置

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${ENV_FILE:-$SCRIPT_DIR/.env}"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
else
  echo "[backup] 未找到 $ENV_FILE，仅使用环境变量" >&2
fi

DB_HOST="${DB_HOST:-mysql-common}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-zhongju_contract}"
DB_NAME="${DB_NAME:-zhongju_contracts}"
DB_PASSWORD="${DB_PASSWORD:-}"
MYSQL_CONTAINER="${MYSQL_CONTAINER:-mysql-common}"
COMPOSE_DIR="${COMPOSE_DIR:-$SCRIPT_DIR}"
BACKUP_DIR="${BACKUP_DIR:-/opt/backups/zhongju-contracts}"
KEEP_DAYS="${KEEP_DAYS:-14}"

if [ -z "$DB_PASSWORD" ]; then
  echo "[backup] 错误：DB_PASSWORD 为空（请确认 .env 存在且包含密码）" >&2
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

# ---------- 1. 数据库备份（mysqldump + gzip） ----------
SQL_FILE="$BACKUP_DIR/db-$DB_NAME-$STAMP.sql.gz"
echo "[backup] 导出数据库 $DB_NAME ..."
docker exec "$MYSQL_CONTAINER" sh -c \
  "mysqldump -h $DB_HOST -P $DB_PORT -u '$DB_USER' -p'$DB_PASSWORD' --single-transaction --routines --triggers '$DB_NAME'" \
  | gzip > "$SQL_FILE"

# 校验 dump 文件非空且以正常内容结尾
if [ ! -s "$SQL_FILE" ] || ! gunzip -t "$SQL_FILE" 2>/dev/null; then
  echo "[backup] 错误：数据库备份文件异常，已删除" >&2
  rm -f "$SQL_FILE"
  exit 1
fi
echo "[backup] 数据库备份完成：$SQL_FILE ($(du -h "$SQL_FILE" | cut -f1))"

# ---------- 2. 附件卷备份（tar，在 alpine 容器内打包到 stdout） ----------
# 卷名由 docker compose 目录名决定，自动探测
VOLUME_NAME="${VOLUME_NAME:-$(docker volume ls --format '{{.Name}}' | grep -E '(^|[-_])contract-files$' | head -n 1)}"
FILES_FILE="$BACKUP_DIR/files-$STAMP.tar.gz"
if [ -n "$VOLUME_NAME" ]; then
  echo "[backup] 打包附件卷 $VOLUME_NAME ..."
  docker run --rm -v "$VOLUME_NAME":/data:ro alpine tar czf - -C /data . > "$FILES_FILE"
  echo "[backup] 附件备份完成：$FILES_FILE ($(du -h "$FILES_FILE" | cut -f1))"
else
  echo "[backup] 警告：未找到 contract-files 卷，跳过附件备份" >&2
fi

# ---------- 3. 清理超过保留期的旧备份 ----------
echo "[backup] 清理 ${KEEP_DAYS} 天前的旧备份 ..."
find "$BACKUP_DIR" -type f \( -name 'db-*.sql.gz' -o -name 'files-*.tar.gz' \) -mtime "+$KEEP_DAYS" -print -delete

echo "[backup] 全部完成"
