# 宗忆堂 · 迁移到阿里云 ECS + Caddy 反代方案

> 目标：甩掉 localhost.run 免费隧道（实测 30–50% 撞边缘 503、TLS 成功率仅 35–40%），
> 换成「阿里云 ECS（Ubuntu 22.04）+ Caddy（自动 HTTPS）反代本机 Next」的稳定架构。
> 当前架构回顾：Next 跑 `127.0.0.1:3000` + Postgres 跑在 Docker 容器 `memorial-pg`（端口 `5432`），
> 由 supervisord 托管 `scripts/guard.sh` 做自愈保活，预览口令中间件只认 `preview_auth` cookie、与域名无关。

---

## 一、ECS 上架清单（购买时照勾）

| 项 | 推荐值 | 说明 |
|---|---|---|
| 实例规格 | **2 vCPU / 4 GiB 起步**（预算宽上 8 GiB） | 通用型 **g7 / g8i**，别选突发型 t5/t6（CPU 积分会耗尽被限频） |
| 镜像 | **Ubuntu 22.04 64 位** | 与沙箱同版本，避免环境漂移 |
| 系统盘 | **ESSD PL1，40 GB** | 开「自动快照」做兜底（建议每天 1 份、保留 7 天） |
| 公网带宽 | **按使用流量**（~¥0.8/GB）或固定 2–3 Mbps | 内测低流量按流量计费最省 |
| 地域 | 华东 1（杭州）/ 华东 2（上海）/ 华北 2（北京） | 面向国内用户就近；**国内服务器必须 ICP 备案**，否则 80/443 会被拦 |
| 付费 | **包年包月**（比按量省 30–40%，新用户有首单折扣） | — |
| 安全组 | 仅放 **22 / 80 / 443** | 3000 不对外暴露（只给本机 Caddy 反代） |

> 费用参考：2C4G 包年约 ¥120–180/月；2C8G 约 ¥180–280/月（随活动浮动）。

---

## 二、上机初始化（一条条执行）

```bash
# 1) 系统更新
sudo apt update && sudo apt -y upgrade

# 2) Node 22（与沙箱一致）
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt -y install nodejs
node -v            # 期望 v22.x

# 3) Docker + Compose（Postgres 沿用 Docker 跑，与现状一致）
sudo apt -y install docker.io docker-compose-plugin
sudo systemctl enable --now docker

# 4) Caddy（自动申请 + 续期 Let's Encrypt 证书，零成本 HTTPS）
sudo apt -y install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudflare.com/pkg/cloudflared/gpg' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable.gpg
curl -1sLf 'https://dl.cloudflare.com/pkg/cloudflared/caddy' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt -y install caddy

# 5) 拉代码（SSH 公钥配好；或 git clone 你的私有仓库）
cd /opt && sudo git clone <你的仓库> zongyitang && sudo chown -R $USER:$USER /opt/zongyitang
# 或把沙箱 /workspace 整个 rsync 过去（含 node_modules 可省，到新机 npm i）

# 6) 依赖与构建
cd /opt/zongyitang
sudo -u $USER npm i
sudo -u $USER npm run build      # 内含 prisma generate
```

> 数据库沿用 Docker（`memorial-pg`）是最省事的路径，与现状零差异；
> 若要原生 Postgres，见文末「备选：原生 Postgres」。本方案按 Docker 写。

---

## 三、Caddy 反代配置（Caddyfile）

Caddy 会自动监听 80/443、申请证书、把 HTTP 重定向到 HTTPS。

`/etc/caddy/Caddyfile`：

```caddy
# 新域名已填入：zongyimemorial.com（Caddy 自动向 Let's Encrypt 申请该域证书）
zongyimemorial.com {
    # 反代到本机 Next（3000 不对外暴露，只由 Caddy 访问）
    reverse_proxy localhost:3000

    # 关键：middleware.ts 依赖转发头来构造预览口令跳转地址。
    # Caddy 默认会带 X-Forwarded-For / Proto，这里显式补全，确保
    # req.headers 里拿到的是公网域名 + https，而非 localhost。
    header_up Host {host}
    header_up X-Real-IP {remote_host}
    header_up X-Forwarded-For {remote_host}
    header_up X-Forwarded-Proto {scheme}
    header_up X-Forwarded-Host {host}

    # 大文件上传（遗像 / 视频）放宽超时
    reverse_proxy localhost:3000 {
        transport http {
            read_timeout 300s
            write_timeout 300s
        }
    }

    encode gzip
    log {
        output file /var/log/caddy/zongyitang.log
    }
}
```

> ⚠️ **两段 `reverse_proxy` 写法二选一**：上面第一段是简写（最常用），
> 第二段带超时。实际文件里**只保留一个 `reverse_proxy` 块**，把超时并进第一段：
> ```caddy
> zongyimemorial.com {
>     reverse_proxy localhost:3000 {
>         header_up Host {host}
>         header_up X-Forwarded-Proto {scheme}
>         header_up X-Forwarded-Host {host}
>         transport http {
>             read_timeout 300s
>             write_timeout 300s
>         }
>     }
>     encode gzip
> }
> ```

应用配置：

```bash
sudo systemctl enable --now caddy
sudo caddy reload --config /etc/caddy/Caddyfile   # 改完重加载
sudo caddy validate --config /etc/caddy/Caddyfile  # 上线前先校验语法
```

**为什么 `AUTH_TRUST_HOST` 必须保持 `true`**：中间件读 `x-forwarded-host`/`x-forwarded-proto` 拼跳转地址，
且 next-auth 需要信任转发头。`.env` 里 `AUTH_TRUST_HOST="true"`（docker-compose 已设，迁移到 ECS 的 .env 也要保留）。

---

## 四、`.env` 必须改的键

Caddyfile 里域名写成 `zongyimemorial.com`；`.env` 同步改以下键（其余沿用现状）：

```dotenv
# 数据库：沿用 Docker 时，容器名是 db 还是 memorial-pg 取决于你怎么起 PG。
# 若直接 docker run 命名 memorial-pg（与现状一致），URL 仍是 localhost:5432（端口已映射出来）
DATABASE_URL="postgresql://memorial:memorial@localhost:5432/memorial?schema=public"

# ↓↓↓ 这两个必须改成 https 新域名，否则登录回调 / 站内链接会跳 localhost ↓↓↓
AUTH_URL="https://zongyimemorial.com"
NEXT_PUBLIC_SITE_URL="https://zongyimemorial.com"

AUTH_TRUST_HOST="true"          # 必须保留
AUTH_SECRET="<用 `openssl rand -base64 32` 生成的新值>"   # 换机必须重生成
NEXT_PUBLIC_SITE_NAME="宗忆堂"

PAY_CHANNEL="SIMULATE"          # 或你现在的真实渠道
DEEPSEEK_API_KEY=""
ANTHROPIC_API_KEY=""
```

> 生成 `AUTH_SECRET`：`openssl rand -base64 32`。
> 若 PG 改用 docker-compose 的 `db` service 名，`DATABASE_URL` 主机改为 `db`。

---

## 五、guard.sh 改造（删隧道、保留自愈）

现状 `guard.sh` 三段职责：保活 PG（Docker）、保活 Next、保活 localhost.run 隧道。
迁移后**删掉隧道整段**，其余不变。改造后完整版：

`scripts/guard.sh`（ECS 版）：

```bash
#!/bin/bash
# 宗忆堂守护进程：自愈 + 保活 —— DB / Next，任何一环挂掉自动拉起。
# （已移除 localhost.run 隧道：ECS 上由 Caddy + 域名直接对外，隧道不再需要）
export PATH="/usr/local/bin:/usr/bin:/bin:/root/.nvm/versions/node/v22.13.1/bin"
LOG=/tmp/guard.log
log() { echo "$(date '+%m-%d %H:%M:%S') $1" >> "$LOG"; }

# 单实例保护
LOCKFD=200
exec 200>/var/run/zongyitang-guard.lock
if ! flock -n $LOCKFD; then exit 0; fi

ensure_pg() {
  local st
  st=$(docker inspect -f '{{.State.Status}}' memorial-pg 2>/dev/null)
  if [ "$st" != "running" ]; then
    log "数据库状态=[$st]，启动中…"
    docker start memorial-pg >/dev/null 2>&1
    sleep 4
  fi
}

ensure_next() {
  if ! pgrep -f "next-server \(v" >/dev/null; then
    log "Next 服务未运行，启动中…"
    ( cd /opt/zongyitang && setsid npm run start >/tmp/next.log 2>&1 & )
    sleep 8
  fi
}

ensure_next_health() {
  # 判活依据：本地 3000 是否健康（与域名无关，Caddy 在外层做 HTTPS）
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 "http://127.0.0.1:3000/login")
  if [ "$code" != "200" ] && [ "$code" != "307" ] && [ "$code" != "302" ]; then
    sleep 5
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 "http://127.0.0.1:3000/login")
    if [ "$code" != "200" ] && [ "$code" != "307" ] && [ "$code" != "302" ]; then
      log "本地后端不健康(code=$code)，尝试拉起 Next"
      ensure_next
    fi
  fi
}

log "守护进程启动"
while true; do
  ensure_pg
  ensure_next
  ensure_next_health
  # 保活：周期请求本地服务（防 Next 空闲异常；Caddy 侧由自己 keepalive）
  curl -s -o /dev/null --max-time 5 "http://127.0.0.1:3000/login" >/dev/null 2>&1
  sleep 15
done
```

**托管方式（二选一）**：
- **沿用 supervisord**：把 `docker-init` 里的 `/usr/local/share/supervisor/zongyitang.conf` 原样搬到 ECS，
  改 `command=/bin/bash /opt/zongyitang/scripts/guard.sh` 与 `environment` 的 PATH 即可。
- **ECS 标准 systemd**（推荐，更直观）：写 `/etc/systemd/system/zongyitang-guard.service`：

  ```ini
  [Unit]
  Description=Zongyitang guard
  After=docker.service
  Requires=docker.service

  [Service]
  ExecStart=/bin/bash /opt/zongyitang/scripts/guard.sh
  Restart=always
  RestartSec=5
  Environment=PATH=/usr/local/bin:/usr/bin:/bin:/root/.nvm/versions/node/v22.13.1/bin

  [Install]
  WantedBy=multi-user.target
  ```
  ```bash
  sudo systemctl enable --now zongyitang-guard
  ```

---

## 六、数据迁移（Postgres dump / restore）

1. **在旧环境（沙箱）导出**：

   ```bash
   docker exec memorial-pg pg_dump -U memorial -d memorial -Fc -f /tmp/memorial.dump
   docker cp memorial-pg:/tmp/memorial.dump ./memorial.dump
   rsync -avz ./memorial.dump user@<ECS公网IP>:/opt/zongyitang/memorial.dump
   ```

2. **在新环境（ECS）导入**（先起 PG 容器、建同名库）：

   ```bash
   # 起 PG（与现状同参数）
   docker run -d --name memorial-pg -e POSTGRES_USER=memorial -e POSTGRES_PASSWORD=memorial \
     -e POSTGRES_DB=memorial -p 5432:5432 -v pgdata:/var/lib/postgresql/data postgres:16-alpine

   # 导入
   docker cp /opt/zongyitang/memorial.dump memorial-pg:/tmp/memorial.dump
   docker exec memorial-pg pg_restore -U memorial -d memorial --clean --if-exists /tmp/memorial.dump
   ```

   > `DATABASE_URL` 与旧环境一致（`localhost:5432/memorial`），无需改连接串。
   > 若用 `docker-compose`（service 名 `db`），导入时库名/用户一致即可，URL 改 `db:5432`。

---

## 七、DNS 与备案

1. **ICP 备案**：在阿里云备案系统提交（国内服务器 80/443 放行的前置条件，约 1–2 周）。
2. **DNS**：新域名添加 **A 记录** → ECS **公网 IP**（Caddy 自动 HTTPS，无需手动配证书）。
3. **临时验证**（备案未完成前）：可先用 ECS 公网 IP + 自签/临时证书，或走 Cloudflare 代理（见备选）。

---

## 八、连锁清理（换域名收尾）

```bash
# 1) 删掉整套 localhost.run 隧道逻辑（不再需要）
rm -f scripts/tunnel.sh

# 2) 全仓搜旧域名，逐个改：
grep -rln "zongyitang.lhr.rocks" --include=*.sh --include=*.ts --include=*.tsx \
  --include=*.mjs --include=*.mts --include=*.json . | grep -v node_modules | grep -v "/.next/"

# 命中文件处理：
#   - scripts/guard.sh        → 已删除隧道段，DOMAIN 不再需要（见第五节）
#   - scripts/verify-public-login.mjs → 把硬编码域名常量改成新域名（本地验证用）
#   - prisma/seed-clan.mjs    → 若 seed 数据里写死旧域名链接，改成新域名后重跑 seed
#   - AGENTS.md / docs/*.md   → 文档，更新平台地址文案即可，不影响运行
```

> 运行时真正依赖域名的只有 **Caddyfile + .env 的 AUTH_URL / NEXT_PUBLIC_SITE_URL**，
> 其余硬编码点均为验证/文档脚本，不影响线上。

---

## 九、上线验证

```bash
# 1) 本机健康检查（应 200/307）
curl -s -o /dev/null -w '%{http_code}\n' --max-time 8 http://127.0.0.1:3000/login

# 2) 公网 HTTPS 健康检查（期望 200 或 307，确认无 503/000）
for i in $(seq 1 10); do
  curl -s -o /dev/null -w '%{http_code} ' --max-time 10 https://zongyimemorial.com/preview-gate
done; echo

# 3) 证书状态
echo | openssl s_client -servername zongyimemorial.com -connect zongyimemorial.com:443 2>/dev/null | openssl x509 -noout -dates

# 4) 跑回归（Next 在跑 + preview_auth cookie 可用）
node scripts/verify-section-order.mjs
bash scripts/run-all-verify.sh
```

---

## 十、回滚预案

- 若新域名/CDN 出问题，旧隧道仍可临时恢复：把 `guard.sh` 隧道段加回、`restart_tunnel` 恢复，
  旧 `zongyitang.lhr.rocks` 在隧道有效期内仍可用（localhost.run 不绑域名所有权）。
- 数据已 `pg_dump` 备份在本地，最坏情况新机 `pg_restore` 即可回退到迁移前快照。

---

## 备选 A：Cloudflare Tunnel（不想买服务器时）

若服务仍留沙箱、只想换稳定域名：装 `cloudflared`，`cloudflared tunnel --url http://localhost:3000`
+ DNS 加 CNAME 到 cf，免费、稳定、原生自定义域名，无 503。改 `guard.sh` 把 ssh 隧道段换成
`cloudflared tunnel` 保活即可。

## 备选 B：原生 Postgres（不用 Docker）

ECS 上 `sudo apt -y install postgresql-16`，建用户/库与 `DATABASE_URL` 一致，`pg_restore` 导入；
`guard.sh` 的 `ensure_pg` 改为 `systemctl is-active --quiet postgresql || systemctl start postgresql`。
优点：省一层 Docker、备份直接 `pg_dump`；缺点：需自己管 PG 版本与升级。

## 备选 C：全 Docker Compose

直接用仓库 `docker-compose.yml`（`app` + `db` 同机），`AUTH_URL` 改 `https://zongyimemorial.com`，
Caddy 反代到容器 `3000`（用 `docker network` 互通或 `-p 3000:3000`）。
优点是「一条 `docker compose up` 拉起全栈」；缺点是 Next 进了容器，构建/日志排查多一层。
