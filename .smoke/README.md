# 建馆审核端到端浏览器烟测

用**真实浏览器**驱动验证「建馆审核改造」的完整业务闭环，不依赖 mock：

```
建馆(appeal 特殊申述通道) → 后台审核通过(仅创建者可见)
  → owner 补传正式材料并转公开 → 公页对公众可见并举报
  → 后台「建馆举报处理」队列出现工单
```

- 主脚本： [`../scripts/smoke-hall-review.mjs`](../scripts/smoke-hall-review.mjs)
- 配置： [`../playwright-cli.json`](../playwright-cli.json)
- 截图： 同目录 `01-new-form.png` … `11-report-queue.png`（共 11 张，覆盖每个关键步骤）
- 断言： 脚本内置 **10 个 `check()` 断言**，全过退出码 `0`，有失败 `1`，异常 `2`

---

## 前置条件

| 项 | 说明 |
|---|---|
| 浏览器 | `playwright-core`（脚本写死从 `@playwright/cli` 的 `node_modules` 取）+ Chromium 二进制 `/root/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome` |
| Dev server | 运行中（默认 `BASE=http://localhost:3001`，但 `next dev` 实际常跑在 **`3000`**，运行需显式传 `BASE=http://localhost:3000`） |
| `.env` | 必须含 `AUTH_SECRET`（见下方「坑位 2」去引号陷阱） |
| 种子账号 | `user@test.com` / `admin@test.com` 的 `passwordHash` 需与 **`admin123456`** 匹配，否则 quick-login 静默失败、无 session cookie |
| 登录令牌 | 用 [`../scripts/make-quick-login.mts`](../scripts/make-quick-login.mts) 分别为 owner / admin 签发，导出为 `OWNER_TOKEN`、`ADMIN_TOKEN` 环境变量 |

---

## 运行步骤

```bash
# 1) 起 dev server（若未运行）
npm run dev            # 默认 3000 端口

# 2) 为两个测试账号签发 quick-login 令牌
#    （make-quick-login.mts 会读取 .env 的 AUTH_SECRET，注意去引号）
node scripts/make-quick-login.mts user@test.com    # → OWNER_TOKEN
node scripts/make-quick-login.mts admin@test.com   # → ADMIN_TOKEN

# 3) 跑烟测（注意 BASE 指向 3000）
BASE=http://localhost:3000 \
OWNER_TOKEN="<上一步 owner token>" \
ADMIN_TOKEN="<上一步 admin token>" \
node scripts/smoke-hall-review.mjs
```

断言全过输出 `全部通过 ✅  hallId=...`；过程中在 `.smoke/` 落 11 张截图。

---

## 断言清单（对应截图）

| # | 截图 | 断言 |
|---|------|------|
| 1 | `01-new-form.png` | `/halls/new` 加载，三通道表单可见 |
| 2 | — | 切换到「特殊申述」(appeal) 通道，补充材料区出现 |
| 3 | — | 承诺书图片上传成功（`/uploads/proofs/` 链接出现） |
| 4 | — | 勾选「已阅读并签署真实性承诺书」 |
| 5 | `03-created.png` | 建馆提交成功，跳转 `/console/halls/[id]` |
| 6 | `04-review.png` / `05-after-approve.png` | 后台点击「通过（仅创建者可见）」审核 appeal 馆 |
| 7 | `07-supplemented.png` | owner 补传材料并提交，跳转 `?supplemented=1` |
| 8 | `08-public-visible.png` | 公页 `/halls/[id]` 对公众可见（含馆名，未触发私有/审核中 gate） |
| 9 | `10-reported.png` | 公页提交举报，显示「举报已提交」 |
| 10 | `11-report-queue.png` | 后台「建馆举报处理」队列出现该举报工单 |

---

## 已踩过的环境坑位（避免重蹈）

1. **root 跑 Chromium**：必须 `chromiumSandbox:false` + `--no-sandbox`，否则 Playwright 报 `Running as root without --no-sandbox is not supported`。脚本已固定。
2. **`.env` 的 `AUTH_SECRET="..."` 带双引号**：用 `cut -d= -f2-` 提取会保留引号，导致签发的 token 用「带引号 secret」而服务端去引号后不匹配，报「链接已失效」。签发前先 `sed -E 's/^"//; s/"$//'` 去引号。
3. **种子账号密码不匹配**：`lib/auth.ts` 用 `bcrypt.compare(password, passwordHash)`；若 DB 里 `passwordHash` 不与 `admin123456` 对应，登录后只种 `preview_auth`、无 session，后续页面跳 `/login`。需把测试账号的 `passwordHash` 更新为 `bcrypt.hashSync('admin123456', 10)`。
4. **公页可见性竞态**：`goto` 后**不能**立刻读 `body.innerText`，会命中 React 未渲染完成。先 `waitFor` 馆名文本可见再读。

---

## 测试数据清理

烟测会**真实写入**数据库（之前一次性烟测已验证）。测试后需手动清理，避免污染：

```sql
-- 该 hall 在 8 张子表有外键：CommunityMember / CommunityPost / HallReport /
--    HallReservation / MemorialTribute / Obituary / OfferingOnAltar / WhisperProfile
-- 先删子表（通常仅 HallReport 有 1 条），再删父表
BEGIN;
DELETE FROM "HallReport"      WHERE "hallId" = '<hallId>';
DELETE FROM "MemorialHall"    WHERE id = '<hallId>';
COMMIT;
```

`scripts/smoke-hall-review.mjs` 会把 `hallId` 写到 `/tmp/smoke-hall-id.txt`，便于清理。

---

## 截图走 Git LFS

`.smoke/*.png` 经 `.gitattributes` 纳入 **Git LFS**（仓库只存指针）。clone 后需：

```bash
git lfs install && git lfs pull
```

才能拿到真实截图；否则 `.smoke/*.png` 仅为 LFS 指针文本。
