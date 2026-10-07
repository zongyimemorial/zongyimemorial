import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { createShareToken } from "@/lib/share";

/**
 * 电子讣告「凭密码访问」解锁接口。
 *
 * 校验密码 → 签发**绑死到该讣告路径**的 HMAC 令牌 → Set-Cookie。
 * 令牌由 `lib/share.ts` 的 `createShareToken(`/obituary/${id}`, "obituary")` 生成，
 * scope + pathname 把令牌绑到具体 id —— 拿 A 的 cookie 打不开 B（改 id 即签名失配）。
 *
 * ⚠️ 令牌只允许"看一眼公开页"，不携带身份、不授权任何写操作。
 * ⚠️ 密码哈希（bcrypt）永不出现在响应里，只比对。
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let password = "";
  try {
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const body = await req.json();
      password = String(body?.password ?? "");
    } else {
      const fd = await req.formData();
      password = String(fd.get("password") ?? "");
    }
  } catch {
    password = "";
  }

  const ob = await prisma.obituary.findUnique({
    where: { id },
    select: { status: true, passwordHash: true },
  });

  // 讣告不存在 / 已下架 / 未设密码 → 一律拒绝（不给任何信息）
  if (!ob || ob.status !== "published" || !ob.passwordHash) {
    return NextResponse.json({ ok: false, error: "无法访问" }, { status: 404 });
  }

  const ok = password ? await bcrypt.compare(password, ob.passwordHash) : false;
  if (!ok) {
    return NextResponse.json({ ok: false, error: "密码不正确" }, { status: 401 });
  }

  const token = await createShareToken(`/obituary/${id}`, "obituary");
  if (!token) {
    // 密钥缺失（环境异常）：倒向安全，拒绝
    return NextResponse.json({ ok: false, error: "服务暂不可用" }, { status: 500 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: "obituary_access",
    value: token,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 天
  });
  return res;
}
