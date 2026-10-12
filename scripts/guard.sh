#!/bin/bash
# 宗忆堂全站守护进程（由 supervisord 托管，autorestart=true）
# 职责：自愈 + 保活 —— DB / Next / localhost.run 隧道，任何一环挂掉都自动拉起；
#       并周期性请求公网地址，防止 localhost.run 因空闲超时断线。
export PATH="/root/.nvm/versions/node/v22.13.1/bin:/usr/local/bin:/usr/bin:/bin"
LOG=/tmp/guard.log
DOMAIN="zongyitang.lhr.rocks"
KEY="/root/.ssh/lhr_key"
log() { echo "$(date '+%m-%d %H:%M:%S') $1" >> "$LOG"; }

# 单实例保护：flock 内核级锁，锁进程退出时自动释放，不会留死锁
LOCKFD=200
exec 200>/var/run/zongyitang-guard.lock
if ! flock -n $LOCKFD; then
  exit 0
fi

# 隧道建立后的宽限期：避免隧道握手期间健康检查失败导致误杀重建
TUNNEL_LAST_START=0

ensure_pg() {
  local st
  st=$(docker inspect -f '{{.State.Status}}' memorial-pg 2>/dev/null)
  if [ "$st" != "running" ]; then
    log "数据库状态=[$st]，启动中…"
    docker start memorial-pg >/dev/null 2>&1
    # 有界等待 pg_isready（≤10s），就绪即返回；不再固定 sleep 4 白等
    local i
    for i in $(seq 1 10); do
      if docker exec memorial-pg pg_isready -U memorial >/dev/null 2>&1; then
        log "数据库就绪（${i}s）"
        return 0
      fi
      sleep 1
    done
    log "数据库 10s 内未就绪（不阻塞主循环，下一轮重试）"
  fi
}

ensure_next() {
  if ! pgrep -f "next-server \(v" >/dev/null; then
    log "Next 服务未运行，启动中…"
    # 200>&-：子进程必须关闭 flock 的 fd，否则锁被子进程继承，
    # guard 重启后新实例永远拿不到锁（实测踩过：杀旧 guard 后 supervisor
    # 反复拉起全部瞬间退出，FATAL）
    ( cd /workspace && setsid npm run start >/tmp/next.log 2>&1 200>&- & )
    # 有界健康探测（≤60s）：/login 返回 200/302/307 即视为就绪，替代固定 sleep 8
    local i code
    for i in $(seq 1 60); do
      code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 "http://127.0.0.1:3000/login" 2>/dev/null)
      if [ "$code" = "200" ] || [ "$code" = "302" ] || [ "$code" = "307" ]; then
        log "Next 就绪（${i}s）"
        return 0
      fi
      sleep 1
    done
    log "Next 60s 未就绪（下一轮循环继续重试）"
  fi
}

tunnel_pids() { pgrep -f "/usr/bin/cloudflared"; }

# 隧道 token 读取（带兜底链）：
#   /tmp/cf_token（历史位置）→ /workspace/.tunnel-token（持久，首选）
#   → /root/.tunnel-token → 环境变量
# ⚠️ /tmp 位于 overlay 通常可跨休眠持久，但冷启动若被清空，
#    没有兜底链隧道就永远起不来（Cloudflare 报 1033）。
tunnel_token() {
  local f
  for f in /tmp/cf_token /workspace/.tunnel-token /root/.tunnel-token; do
    if [ -s "$f" ]; then
      cat "$f"
      return 0
    fi
  done
  echo "${CLOUDFLARE_TUNNEL_TOKEN:-}"
}

restart_tunnel() {
  log "重建 cloudflared 隧道"
  pkill -f "/usr/bin/cloudflared" 2>/dev/null
  sleep 2
  setsid /usr/bin/cloudflared --no-autoupdate --loglevel info tunnel run --token "$(tunnel_token)" >>/tmp/cf_tunnel.log 2>&1 200>&- &
  TUNNEL_LAST_START=$(date +%s)
  LAST_TUNNEL_PID=$!
}

ensure_tunnel() {
  local pids
  pids=$(tunnel_pids)
  if [ -z "$pids" ]; then
    restart_tunnel
    return
  fi
  # 隧道刚建立的 25 秒内不做健康检查（握手未完成）
  if [ $(( $(date +%s) - TUNNEL_LAST_START )) -lt 25 ]; then
    return
  fi

  # ---------------------------------------------------------------------
  # 判活依据：**本地 3000 是否健康**，而不是"沙箱能不能访问自己的公网域名"。
  #
  # 曾经的写法是 curl "https://$DOMAIN/" 看是不是 000 —— 但沙箱所在网络
  # 根本解析/回环不到自己的公网域名，于是 code 恒为 000，guard 每轮都误判
  # "隧道挂了"→ 每 60 秒杀一次隧道重建，用户正好撞在重建窗口里就会看到
  # 「页面加载遇到问题」。这是纯粹的误杀，不是隧道故障。
  #
  # 隧道本身是否存活，由上面的 tunnel_pids 判断（隧道断了 ssh 进程会退出，
  # 主循环里还有 PID 存活性检查兜底）。这里只需要确认后端仍然能服务。
  # ---------------------------------------------------------------------
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 "http://127.0.0.1:3000/login")
  # 307/200 都算正常：/ 会因预览口令中间件 307 跳转，/login 是无 cookie 下的公开页
  if [ "$code" != "200" ] && [ "$code" != "307" ] && [ "$code" != "302" ]; then
    sleep 5
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 "http://127.0.0.1:3000/login")
    if [ "$code" != "200" ] && [ "$code" != "307" ] && [ "$code" != "302" ]; then
      # 后端真的不健康 —— 先尝试拉起 Next，隧道不动
      log "本地后端不健康(code=$code)，尝试拉起 Next"
      ensure_next
    fi
  fi
}

log "守护进程启动"

while true; do
  # 记录隧道进程意外退出（用于诊断掉线频率与原因）
  if [ -n "$LAST_TUNNEL_PID" ] && ! kill -0 "$LAST_TUNNEL_PID" 2>/dev/null; then
    log "隧道进程 PID=$LAST_TUNNEL_PID 已退出，立即重建"
    restart_tunnel
  fi
  # 隧道最先确保 —— 只要隧道在，Cloudflare 就不再报 1033；
  # DB / Next 随后（首轮唤醒空窗 ≈ Next 就绪时间，约 5~15s）
  ensure_tunnel
  ensure_pg
  ensure_next
  # 保活：周期性请求**本地**服务。
  # 不要请求公网域名 —— 沙箱访问不到，请求只会白白超时 12 秒，
  # 而且没有任何保活效果（真正防空闲超时的是 SSH 的 ServerAliveInterval）。
  curl -s -o /dev/null --max-time 5 "http://127.0.0.1:3000/login" >/dev/null 2>&1
  sleep 15
done
