#!/usr/bin/env bash
#
# self-heal.sh —— 宗忆堂平台自守护脚本
#
# 职责：
#   1) 拉起并守护「三件套」：PostgreSQL 容器、两个 Next.js dev 服务(3000/3100)、Cloudflare 隧道
#   2) 任一组件挂掉，自动重新拉起（进程守护）
#   3) 支持开机自启（systemd 环境装 service；容器/无 systemd 环境写 shell 登录兜底）
#
# 用法：
#   bash scripts/self-heal.sh start     # 一次性拉起三件套（阻塞到全部就绪后退出）
#   bash scripts/self-heal.sh watch      # 前台守护循环（永不退出，适合 systemd service）
#   bash scripts/self-heal.sh daemon     # 后台单例守护（nohup 用，自动进 watch）
#   bash scripts/self-heal.sh stop       # 停止守护循环（不动三件套进程）
#   bash scripts/self-heal.sh status     # 查看三件套存活状态
#   bash scripts/self-heal.sh install    # 安装开机自启
#
set -u

# ============ 路径推导 ============
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ============ 配置 ============
PG_CONTAINER="memorial-pg"
DEV_PORTS=(3000 3100)
NEXT_BIN="$APP_DIR/node_modules/.bin/next"
TUNNEL_BIN="/usr/bin/cloudflared"
TOKEN_FILES=(
  "$APP_DIR/.tunnel-token"
  "/root/.tunnel-token"
)
PID_FILE="/tmp/self-heal.pid"
LOG_FILE="$APP_DIR/.self-heal.log"
PROBE_WAIT=120     # dev 启动后最多等待秒数（首次编译较慢）
WATCH_INTERVAL=30  # 守护轮询间隔（秒）
PG_READY_WAIT=30   # pg_isready 最多等待秒数

# ============ 工具函数 ============
log() { echo "[$(date '+%F %T')] $*" | tee -a "$LOG_FILE"; }

tunnel_token() {
  for f in "${TOKEN_FILES[@]}"; do
    if [[ -s "$f" ]]; then
      cat "$f"; return 0
    fi
  done
  echo "${CLOUDFLARE_TUNNEL_TOKEN:-}"
}

port_up() {
  local port="$1"
  curl -s -o /dev/null --max-time 3 "http://localhost:${port}/" 2>/dev/null
}

# ============ 三件套：单组件确保 ============
ensure_pg() {
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$PG_CONTAINER"; then
    return 0
  fi
  log "[pg] 容器未运行，尝试 docker start $PG_CONTAINER"
  if ! docker start "$PG_CONTAINER" >/dev/null 2>&1; then
    log "[pg] 启动失败（docker 不可用或容器不存在），跳过"
    return 1
  fi
  for i in $(seq 1 "$PG_READY_WAIT"); do
    if docker exec "$PG_CONTAINER" pg_isready -U memorial >/dev/null 2>&1; then
      log "[pg] 已就绪"; return 0
    fi
    sleep 1
  done
  log "[pg] 已启动，但 pg_isready 在 ${PG_READY_WAIT}s 内未确认（继续，不阻塞）"
  return 0
}

ensure_dev() {
  local port="$1"
  local dist=".next-${port}"
  if port_up "$port"; then
    return 0
  fi
  log "[dev${port}] 端口无响应，启动 next dev"
  cd "$APP_DIR" || return 1
  # 加载环境变量（含 DATABASE_URL），确保 Prisma Client 与 DB 连接一致
  # shellcheck disable=SC1091
  [[ -f "$APP_DIR/.env" ]] && source "$APP_DIR/.env" >/dev/null 2>&1
  # 重新生成 Prisma Client，规避「dev 缓存旧 client」导致列不存在的坑
  npx prisma generate >/dev/null 2>&1
  # 清掉本端口旧构建产物（kill -9 中断写入会留下半成品 → ENOENT page.js），
  # 再用独立 distDir 启动，避免与另一端口实例互相踩踏 .next
  rm -rf "$APP_DIR/$dist"
  NEXT_DIST_DIR="$dist" nohup "$NEXT_BIN" dev -p "$port" >> "$LOG_FILE" 2>&1 &
  local pid=$!
  log "[dev${port}] 已启动 pid=${pid}（dist=${dist}），等待就绪（≤${PROBE_WAIT}s）"
  for i in $(seq 1 "$PROBE_WAIT"); do
    if port_up "$port"; then
      log "[dev${port}] 就绪"; return 0
    fi
    sleep 1
  done
  log "[dev${port}] 启动超时，请查 $LOG_FILE"
  return 1
}

ensure_tunnel() {
  if pgrep -x cloudflared >/dev/null 2>&1; then
    return 0
  fi
  local tok; tok="$(tunnel_token)"
  if [[ -z "$tok" ]]; then
    log "[tunnel] 未配置 token（检查 .tunnel-token 或 CLOUDFLARE_TUNNEL_TOKEN），跳过"
    return 0
  fi
  log "[tunnel] 未运行，启动 cloudflared"
  nohup "$TUNNEL_BIN" --no-autoupdate --loglevel info tunnel run --token "$tok" >> "$LOG_FILE" 2>&1 &
  log "[tunnel] 已启动 pid=$!"
  return 0
}

# ============ 组合动作 ============
start_all() {
  log "=== 拉起三件套 ==="
  ensure_pg
  for p in "${DEV_PORTS[@]}"; do ensure_dev "$p"; done
  ensure_tunnel
  log "=== 完成 ==="
}

watch() {
  while true; do
    ensure_pg
    for p in "${DEV_PORTS[@]}"; do ensure_dev "$p"; done
    ensure_tunnel
    sleep "$WATCH_INTERVAL"
  done
}

daemon() {
  if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "守护已在运行，pid=$(cat "$PID_FILE")"
    exit 0
  fi
  echo $$ > "$PID_FILE"
  log "=== 自愈守护启动 pid=$$ ==="
  # 首次进入先拉起一次，再进入轮询
  start_all
  watch
}

stop() {
  if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    kill "$(cat "$PID_FILE")" 2>/dev/null
    rm -f "$PID_FILE"
    log "已停止守护循环"
  else
    echo "守护未运行"
  fi
}

status() {
  local pg
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$PG_CONTAINER"; then pg="UP"; else pg="DOWN"; fi
  echo "PG 容器($PG_CONTAINER):   $pg"
  for p in "${DEV_PORTS[@]}"; do
    printf "dev 端口 %s:        %s\n" "$p" "$(port_up "$p" && echo UP || echo DOWN)"
  done
  echo "cloudflared 隧道:     $(pgrep -x cloudflared >/dev/null 2>&1 && echo UP || echo DOWN)"
  echo "自愈守护(pidfile):    $([[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null && echo RUNNING || echo STOPPED)"
}

install() {
  if [[ "$(ps -p 1 -o comm=)" == "systemd" ]] && systemctl is-system-running >/dev/null 2>&1; then
    cat > /etc/systemd/system/self-heal.service <<EOF
[Unit]
Description=ZongyiMemorial self-heal (PG + dev + tunnel)
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/env bash $APP_DIR/scripts/self-heal.sh watch
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload
    systemctl enable --now self-heal.service
    log "已安装并启用 systemd 服务 self-heal.service"
  else
    # 容器 / 无 systemd 环境：写入交互 shell 登录兜底
    local line="bash $APP_DIR/scripts/self-heal.sh daemon >/dev/null 2>&1 &"
    local added=0
    for f in /root/.zshrc /root/.bashrc; do
      if [[ -f "$f" ]] && ! grep -qF "$APP_DIR/scripts/self-heal.sh" "$f"; then
        printf '\n# 宗忆堂平台自愈守护（开机登录自动拉起）\n%s\n' "$line" >> "$f"
        log "已写入 $f 登录自拉起"
        added=1
      fi
    done
    if [[ "$added" -eq 0 ]]; then
      log "未找到交互 shell 配置文件，跳过登录兜底"
    fi
    log "当前非 systemd 环境：容器/主机级开机请在其启动命令中加入：bash $APP_DIR/scripts/self-heal.sh start"
  fi
}

# ============ 入口 ============
case "${1:-start}" in
  start)   start_all ;;
  watch)   watch ;;
  daemon)  daemon ;;
  stop)    stop ;;
  status)  status ;;
  install) install ;;
  *)
    echo "用法: $0 {start|watch|daemon|stop|status|install}"
    exit 1
    ;;
esac
