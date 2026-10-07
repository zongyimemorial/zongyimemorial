# 部署与 ICP 备案 SOP（M1 交付物）

> 适用：一人 AI 公司 · 殡葬祭祀平台 Web 端（仅 ICP 备案，无殡葬类目前置审批）

## 一、ICP 备案（上线前第一步，阻塞正式流量）

1. 准备资质：一人有限责任公司营业执照、法人身份证、实名手机号、域名。
2. 购买**国内**服务器（腾讯云/阿里云轻量应用服务器，地域选大陆节点）与**国内注册商**域名（.cn/.com）。
3. 在云厂商备案系统提交 ICP 备案（个人/企业备案），填写网站用途为"文化传播/数字纪念"，**不要**写"殡葬服务"。
4. 备案周期 1–3 周；期间可用"网站建设中"提示页或内测，不要放开公网正式内容。
5. 备案通过后，在公安部全国互联网安全管理服务平台做**公安备案**（注：部分地区要求）。
6. 若后续经营在线交易且 GMV 起量，补充 **EDI 经营许可证**（在线数据处理与交易处理）。

## 二、域名与 HTTPS

- 域名解析 A 记录指向服务器公网 IP。
- 使用 Let's Encrypt（certbot）或云厂商免费 DV 证书，参考 `nginx.conf` 做 443 反代。
- 开启 HSTS、防盗链与基础安全响应头。

## 三、服务器与容器部署

```bash
# 1) 上传代码到服务器后，配置 .env（至少 AUTH_SECRET / AUTH_URL）
cp .env.example .env
# 2) 启动数据库 + 应用
docker compose up -d --build
# 3) 初始化数据库表结构（首次）
docker compose exec app npx prisma migrate deploy
# 4)（可选）写入演示数据
docker compose exec app npx prisma db seed
```

- 应用监听 3000；由 Nginx 反代并终止 SSL。
- 数据库同机 PostgreSQL（Docker 卷持久化）；起量后迁云 RDS for PostgreSQL。

## 四、CI/CD

- 代码推送 `main` 分支，GitHub Actions（`deploy.yml`）SSH 登录服务器执行 `docker compose up -d --build` 并跑 `prisma migrate deploy`。
- 所需 Secrets：`DEPLOY_HOST` / `DEPLOY_USER` / `DEPLOY_SSH_KEY` / `DEPLOY_PATH`。

## 五、合规提醒（贯穿全程）

- 公开内容先过机审（云内容安全 + DeepSeek 语义复核）再人工终审，规避"封建迷信"等红线。
- 虚拟商品表述统一为"数字纪念服务/云祭扫/在线追思"，避免"改运/超度/风水改命"。
- 纪念馆/虚拟祭品需实名，证件信息加密存储；明确数字服务不退不换条款。
- 虚拟商品**避免抽卡/盲盒/随机**机制，防止触及游戏或盲盒监管。

## 六、内测边界与资质豁免（本回合新增）

> 结论：**先开发 + 不公开内测完全合规**。本机/局域网运行、不绑公网域名、不对外暴露，即不触发 ICP 备案 / 支付类目 / 小程序类目等任何资质要求。

### 6.1 内测合规判定（满足则零资质）
| 条件 | 内测做法 | 是否触发资质 |
|------|----------|--------------|
| 网络暴露 | 仅 `localhost` / 内网 IP，不绑公网域名、不映射到公网 | 否（无"向公众提供"） |
| 支付 | `PAY_CHANNEL=SIMULATE`，模拟回调跑通交易闭环 | 否（无真实资金清算 → 无支付类目） |
| 内容 | AI 预过滤 + 人工队列（本机），测试内容 | 否（未公开即未"发布"） |
| 实名/个人数据 | 仅测试数据，AES-256 加密存储 | 否（非真实敏感信息收集） |
| 直播 | 本地/文件模拟流，不接云直播 | 否（无网络文化经营许可要求） |

### 6.2 触发"必须公开"的红线（任一成立即停内测、补资质）
- 绑定公网域名并对外 DNS 解析（开始"向公众提供"）→ 必须 ICP 备案 + 公安备案。
- 开通真实微信/支付宝收款（真实资金清算）→ 需支付类目资质或保留 SIMULATE。
- 接云直播 SDK 推流公网 → 需网络文化经营许可证 + 逝者授权。
- 启用真实短信（非 mock）→ 需短信服务商资质 + 实名发送。
- 接入真实 Coze/Dify 客服并收集用户隐私 → 需 PIPL 告知授权。

### 6.3 内测运行方式
```bash
# 本机启动（不暴露公网）
docker compose up -d          # 起 PostgreSQL
cp .env.example .env          # AUTH_SECRET 必填
npx prisma migrate deploy     # 建表
node prisma/seed.mjs          # 演示账号：admin@test.com/admin123456、user@test.com/user123456
npm run dev                   # 或 npm run build && npm run start，访问 http://localhost:3000
```
- 内测期不建站点门禁/维护页（公开前再补 `middleware.ts` + `coming-soon`）。
- 客服为本地规则引擎（`lib/customerService.ts`），零外部依赖；Coze/Dify 真实 bot 列为公开前待补。

## 七、公开前待补清单（结构化，不阻塞内测）
- [ ] 站点门禁 `middleware.ts` + 邀请码/密码（公开前再放开）
- [ ] `coming-soon` 维护页与开关（备案期间使用）
- [ ] 迁大陆服务器、国内域名、ICP 备案（用途写"文化传播/数字纪念"）
- [ ] 公安备案
- [ ] 真实支付类目（微信 Native / 支付宝）或保留 SIMULATE
- [ ] 云直播资质 + 网络文化经营许可证（直播公网）
- [ ] 云内容安全机审（天御/绿网）+ DeepSeek 语义复核（替代本地敏感词库）
- [ ] EDI 经营许可证（交易起量后）
- [ ] Coze/Dify 真实客服接入 + PIPL 告知授权
- [ ] 实名信息云密钥管理（KMS）+ 最小必要收集告知
