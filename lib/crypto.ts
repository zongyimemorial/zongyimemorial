import crypto from "crypto";

// 内测：用 AUTH_SECRET 派生密钥做 AES-256 加密，演示"实名信息加密存储"。
// 公开阶段应使用 KMS / 云厂商密钥管理，并严格最小必要收集 + PIPL 告知授权。
function deriveKey(): Buffer {
  return crypto.createHash("sha256").update(process.env.AUTH_SECRET || "dev-secret").digest();
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", deriveKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return iv.toString("hex") + ":" + enc.toString("hex");
}

export function decrypt(token: string): string {
  const [ivHex, dataHex] = token.split(":");
  if (!ivHex || !dataHex) return "";
  const decipher = crypto.createDecipheriv("aes-256-cbc", deriveKey(), Buffer.from(ivHex, "hex"));
  const dec = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
  return dec.toString("utf8");
}
