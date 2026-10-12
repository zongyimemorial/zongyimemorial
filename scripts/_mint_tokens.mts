import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";

// 极简 .env 加载（避免 shell 引号 / URL 特殊字符问题）
for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  if (!(m[1] in process.env)) process.env[m[1]] = v;
}

const prisma = new PrismaClient();
const secret = process.env.AUTH_SECRET!;

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function mint(userId: string): string {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const sig = crypto.createHmac("sha256", secret).update(`quick-login|${userId}|${exp}`).digest();
  const sub = b64url(Buffer.from(userId));
  return `${sub}.${exp}.${b64url(sig)}`;
}

const u = await prisma.user.findUnique({
  where: { email: "user@test.com" },
  select: { id: true, idVerified: true, realName: true },
});
const a = await prisma.user.findUnique({
  where: { email: "admin@test.com" },
  select: { id: true, idVerified: true, realName: true },
});

// 确保测试 owner 已实名（建馆前置硬条件）
if (u && !u.idVerified) {
  await prisma.user.update({ where: { id: u.id }, data: { idVerified: true } });
}

console.log("OWNER_ID=" + (u?.id ?? "MISSING"));
console.log("OWNER_VERIFIED=" + (u ? (u.idVerified ? "true" : "was-false-now-set-true") : "MISSING"));
console.log("OWNER_TOKEN=" + (u ? mint(u.id) : "MISSING"));
console.log("ADMIN_ID=" + (a?.id ?? "MISSING"));
console.log("ADMIN_TOKEN=" + (a ? mint(a.id) : "MISSING"));
await prisma.$disconnect();
