#!/usr/bin/env bash
#
# deploy-prod.sh —— 宗忆堂「生产模式」一键部署
#
# 与 self-heal.sh（dev 守护）互斥：本脚本先停掉 self-heal，避免它把 next dev 拉回 3000。
# 流程：停守护 → 确保 PG → 释放 3000/3100 → （按需）干净构建 → 打 chunk 符号链接 → 起 next start
#
# ⚠️ 已知 Next 15.5 构建特性（非本项目 bug）：
#    服务端 webpack-runtime 用 `require("./<id>.js")` 扁平路径，但构建把服务端 chunk
#    实际放在 .next/server/chunks/ 下，导致页面渲染与 API 路由模块加载失败
#    （页面 500 / API 404）。修复方式：在 .next/server/ 下为 chunks/ 内每个文件建
#    扁平符号链接。每次重新 `npm run build`（会 rm .next）后必须重打，故本脚本内置该步骤。
#
# 用法：
#   bash scripts/deploy-prod.sh          # .next 已存在则跳过构建，仅重建符号链接并起服务
#   bash scripts/deploy-prod.sh build    # 强制先做一次干净生产构建
#
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_FILE="$APP_DIR/.prod.log"
PORT=3000
FORCE_BUILD="${1:-}"

cd "$APP_DIR" || exit 1

# 并发锁：已有部署在跑则直接退出（防止多次唤醒/多 shell 重复部署互相杀进程）
if [ -f /tmp/deploy-prod.lock ] && kill -0 "$(cat /tmp/deploy-prod.lock)" 2>/dev/null; then
  echo "[deploy] 已有部署进程在运行（pid $(cat /tmp/deploy-prod.lock)），退出"
  exit 0
fi
echo $$ > /tmp/deploy-prod.lock
trap 'rm -f /tmp/deploy-prod.lock' EXIT

echo "[deploy] 1/6 停止 self-heal 守护"
bash "$APP_DIR/scripts/self-heal.sh" stop >/dev/null 2>&1 || true
[ -f /tmp/self-heal.pid ] && kill "$(cat /tmp/self-heal.pid)" 2>/dev/null || true

echo "[deploy] 2/6 确保 PostgreSQL 容器并等待就绪"
docker start memorial-pg >/dev/null 2>&1 || true
# 等待 PG 真正接受连接，避免 next start 启动瞬间连接池建在 PG 半就绪状态
for i in $(seq 1 30); do
  if docker exec memorial-pg pg_isready -U postgres >/dev/null 2>&1; then
    echo "[deploy]   PG 已就绪"; break
  fi
  sleep 1
done

echo "[deploy] 3/6 释放 3000/3100 端口（杀残留 next）"
# 用 fuser 按端口杀，避免 pkill 误伤本脚本所在 shell
fuser -k "${PORT}/tcp" 3100/tcp 2>/dev/null || true
sleep 2

# 确保构建产物完整（以 BUILD_ID 为准——半损坏的 .next 可能目录在但产物失效）
if [[ "$FORCE_BUILD" == "build" || ! -f "$APP_DIR/.next/BUILD_ID" ]]; then
  echo "[deploy] 4/6 干净生产构建"
  fuser -k "${PORT}/tcp" 3100/tcp 2>/dev/null || true
  rm -rf "$APP_DIR/.next" "$APP_DIR/.next-3000" "$APP_DIR/.next-3100"
  unset NEXT_DIST_DIR
  npm run build
else
  echo "[deploy] 4/6 跳过构建（已有 .next，可传 build 参数强制重建）"
fi

echo "[deploy] 5/6 为服务端 chunk 打扁平符号链接（修复 webpack-runtime 扁平 require）"
unset NEXT_DIST_DIR
count=0
for f in "$APP_DIR"/.next/server/chunks/*.js; do
  name="$(basename "$f")"
  link="$APP_DIR/.next/server/$name"
  if [ ! -e "$link" ]; then ln -s "chunks/$name" "$link"; count=$((count+1)); fi
done
echo "[deploy]   新建符号链接 $count 个"

echo "[deploy] 6/6 启动 next start（生产构建，端口 $PORT）"
NEXT_DIST_DIR=.next nohup npx next start -p "$PORT" -H 0.0.0.0 >> "$LOG_FILE" 2>&1 &
PROD_PID=$!
echo "[deploy]   next start pid=$PROD_PID，日志 → $LOG_FILE"

# 等待就绪
for i in $(seq 1 60); do
  s="$(node -e 'fetch("http://localhost:'"$PORT"'/login",{redirect:"manual"}).then(r=>{console.log(r.status);process.exit(0)}).catch(()=>{console.log("X");process.exit(0)})' 2>/dev/null)"
  [ "$s" = "200" ] && { echo "[deploy]   就绪，/login = 200"; break; }
  [ "$s" = "500" ] && { echo "[deploy]   /login = 500，请查 $LOG_FILE"; break; }
  sleep 1
done

echo "[deploy] 完成。隧道指向 $PORT 即对外可用；可用 node .probe-routes.mjs 复检。"
