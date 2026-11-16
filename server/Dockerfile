# 中聚人力电子名片服务端
FROM node:24-alpine

WORKDIR /app

# 先装依赖（利用分层缓存）
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
# 初始化脚本（首个主管理员、归属迁移）；deploy.sh 通过 exec 调用
COPY sql ./sql

ENV NODE_ENV=production \
    PORT=8787

USER node
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8787/api/health || exit 1

CMD ["node", "src/index.js"]
