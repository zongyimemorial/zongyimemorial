#!/usr/bin/env bash
#
# start-prod.sh —— 宗忆堂「生产模式」启动器
#
# 与 self-heal.sh（dev 模式守护）互斥：本脚本先把 self-heal 停掉，
# 避免它把 next dev(3000/3100) 重新拉起来，然后在 3000 口跑 next start。
#
# 前提：已执行过 `npm run build`（产物在 .next）。
# 隧道(cloudflared)与 PG 容器独立运行，本脚本不碰它们；
# 若 PG 未起会尝试 docker start。
#
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_FILE="$APP_DIR/.prod.log"
PORT=3000

cd "$APP_DIR" || exit 1

echo "[prod] 1/5 停止 self-heal 守护（避免它拉起 next dev）"
bash "$APP_DIR/scripts/self-heal.sh" stop >/dev/null 2>&1 || true
# 直接确保守护进程也退出
if [[ -f /tmp/self-heal.pid ]] && kill -0 "$(cat /tmp/self-heal.pid)" 2>/dev/null; then
  kill "$(cat /tmp/self-heal.pid)" 2>/dev/null || true
fi

echo "[prod] 2/5 确保 PostgreSQL 容器运行"
docker start memorial-pg >/dev/null 2>&1 || true

echo "[prod] 3/5 杀掉 next dev 实例（3000/3100）"
pkill -f "next dev" >/dev/null 2>&1 || true
sleep 2
# 端口兜底：杀掉仍占用 3000/3100 的进程
for p in 3000 3100; do
  pid="$(ss -ltnp 2>/dev/null | grep -E ":$p " | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2)"
  if [[ -n "$pid" ]]; then
    echo "[prod]   端口 $p 仍被 pid=$pid 占用，强制释放"
    kill -9 "$pid" 2>/dev/null || true
  fi
done
sleep 1

echo "[prod] 4/5 启动 next start（生产构建，端口 $PORT）"
unset NEXT_DIST_DIR
NEXT_DIST_DIR=.next nohup npx next start -p "$PORT" -H 0.0.0.0 >> "$LOG_FILE" 2>&1 &
PROD_PID=$!
echo "[prod]   next start pid=$PROD_PID，日志 → $LOG_FILE"

echo "[prod] 5/5 等待就绪（最多 60s）"
for i in $(seq 1 60); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://localhost:${PORT}/" 2>/dev/null)"
  if [[ "$code" != "000" && "$code" != "" ]]; then
    echo "[prod]   就绪，HTTP $code"
    break
  fi
  sleep 1
done

echo "[prod] 完成。可用 curl -I http://localhost:$PORT/ 验证；隧道指向此端口即对外可用。"
