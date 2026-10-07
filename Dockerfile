# 多阶段构建：Next.js 全栈（standalone 友好，生产用 next start）
FROM node:22-slim AS build
WORKDIR /app

# 依赖（利用镜像层缓存）
COPY package.json package-lock.json* .npmrc ./
RUN npm ci --no-audit --no-fund

# 源码与构建
COPY . .
RUN npx prisma generate
RUN npm run build

# 运行镜像
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=512"

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/.env.example ./.env.example

EXPOSE 3000
CMD ["npm", "start"]
