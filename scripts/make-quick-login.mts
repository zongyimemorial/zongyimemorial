/**
 * 签发一键登录链接（内测演示用）
 *
 * 用法：
 *   npx tsx scripts/make-quick-login.mts admin          # 管理员账号
 *   npx tsx scripts/make-quick-login.mts user           # 普通用户
 *   npx tsx scripts/make-quick-login.mts admin 1800     # 自定义有效期(秒)
 *   BASE_URL=https://zongyimemorial.com npx tsx scripts/make-quick-login.mts admin
 *
 * 输出：一条可点即登录的完整 URL（默认有效期 10 分钟）。
 *
 * ⚠️ 安全：令牌等价于临时密码，10 分钟内有效。请勿长期留存于聊天记录。
 */
import { execFileSync } from "node:child_process";
import { createQuickLoginToken } from "@/lib/quick-login";

const BASE = process.env.BASE_URL || "https://zongyimemorial.com";

const ALIASES: Record<string, string> = {
  admin: "admin@test.com",
  user: "user@test.com",
};

function psql(q: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", "memorial-pg", "psql", "-U", "memorial", "-d", "memorial", "-t", "-A"],
    { input: q, encoding: "utf8" },
  ).trim();
}

async function main() {
  const arg = process.argv[2] || "admin";
  const ttl = Number(process.argv[3] || 600);
  const email = ALIASES[arg] || arg;

  const row = psql(
    `SELECT id || '|' || COALESCE(email, phone, '') FROM "User" WHERE email = '${email.replace(/'/g, "''")}' AND status = 'active' LIMIT 1;`,
  );
  if (!row) {
    console.error(`❌ 未找到 active 账号：${email}`);
    process.exit(1);
  }
  const [userId, realEmail] = row.split("|");

  const token = await createQuickLoginToken(userId, ttl);
  if (!token) {
    console.error("❌ 签发失败：AUTH_SECRET 未设置或过短（需 ≥16 字符）");
    process.exit(1);
  }

  const url = `${BASE}/quick-login?t=${encodeURIComponent(token)}`;
  const mins = Math.round(ttl / 60);
  console.log(`\n账号：${realEmail}（${arg}）`);
  console.log(`有效期：${mins} 分钟`);
  console.log(`\n手机点开即可登录的链接：\n${url}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
