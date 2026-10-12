#!/usr/bin/env bash
#
# prod-watchdog.sh —— 宗忆堂生产服务轻量看门狗
#
# 目标：杜绝「PG 重启 / 连接池陈旧 → 登录查询 Connection closed → 前端永久卡登录中」
#       这类问题反复发生。机制：
#   1) 应用存活：每轮 curl /login，非 200 即视为异常；
#   2) PG 重启感知：比对 docker 容器 StartedAt，一旦变化说明连接池已失效；
#   3) 日志感知：检测 .prod.log 自上一轮新增内容里是否出现 "Connection closed"；
#   4) 任一异常 → 调用 deploy-prod.sh 重启 next（复用现有构建，不会重新编译），
#      并设最小重启间隔，避免抖动成死循环。
#
# 设计为低内存、无构建：仅用 curl / docker inspect / stat，可长期常驻。
#
set -u

APP_DIR=/workspace
LOG="$APP_DIR/.prod.log"
PG=memorial-pg
LOCK=/tmp/watchdog.pid
STATE_SIZE="$APP_DIR/.watchdog.size"
STATE_LAST="$APP_DIR/.watchdog.last"
INTERVAL=20
MIN_RESTART_GAP=120   # 两次重启最小间隔（秒），防抖动

# 单实例守卫
if [ -f "$LOCK" ] && kill -0 "$(cat "$LOCK")" 2>/dev/null; then
  exit 0
fi
echo $$ > "$LOCK"
trap 'rm -f "$LOCK"' EXIT

pg_started="$(docker inspect -f '{{.State.StartedAt}}' "$PG" 2>/dev/null || echo unknown)"
last_restart="$(cat "$STATE_LAST" 2>/dev/null || echo 0)"

log() { echo "[watchdog $(date '+%H:%M:%S')] $*"; }

while true; do
  now="$(date +%s)"
  reason=""

  # 1) 应用存活
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:3000/login 2>/dev/null || echo 000)"
  if [ "$code" != "200" ]; then
    reason="app_down(http=$code)"
  fi

  # 2) PG 重启感知
  pg_now="$(docker inspect -f '{{.State.StartedAt}}' "$PG" 2>/dev/null || echo unknown)"
  if [ "$pg_now" != "$pg_started" ]; then
    reason="pg_restarted"
    pg_started="$pg_now"
  fi

  # 3) 日志新增内容里出现 Connection closed
  if [ -f "$LOG" ]; then
    size="$(stat -c %s "$LOG" 2>/dev/null || echo 0)"
    prev="$(cat "$STATE_SIZE" 2>/dev/null || echo 0)"
    if [ "$size" -gt "$prev" ]; then
      newpart="$(tail -c +$((prev + 1)) "$LOG" 2>/dev/null)"
      if echo "$newpart" | grep -q "Connection closed"; then
        reason="${reason:+$reason,}conn_closed"
      fi
    fi
    echo "$size" > "$STATE_SIZE"
  fi

  if [ -n "$reason" ]; then
    if [ $((now - last_restart)) -ge "$MIN_RESTART_GAP" ]; then
      log "异常: $reason → 重启 next（拉新连接池）"
      bash "$APP_DIR/scripts/deploy-prod.sh" >> "$LOG" 2>&1
      last_restart="$now"
    else
      log "异常: $reason，但距上次重启不足 ${MIN_RESTART_GAP}s，跳过本轮"
    fi
  fi

  sleep "$INTERVAL"
done
