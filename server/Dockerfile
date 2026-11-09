# 中聚人力电子名片服务端
FROM node:20-alpine

WORKDIR /app

# 先装依赖（利用分层缓存）
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

ENV NODE_ENV=production \
    PORT=8787

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8787/api/health || exit 1

CMD ["node", "src/index.js"]
