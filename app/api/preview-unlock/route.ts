import { NextResponse } from "next/server";
import { cookies } from "next/headers";

// 内测解锁接口：校验口令后写 httpOnly cookie
// 同时支持两种调用，确保“隧道抖动导致客户端 JS 未加载”时仍能过门：
//  - JSON 请求（前端 fetch 软交互）：返回 { ok:true }
//  - 表单请求（原生 <form> 兜底，无 JS 也能用）：302 跳转到首页
export async function POST(req: Request) {
  const expected = process.env.PREVIEW_PASS || "neibu1234";
  const ct = req.headers.get("content-type") || "";

  let pass = "";
  try {
    if (ct.includes("application/json")) {
      const body = await req.json();
      pass = (body?.pass ?? "").toString().trim();
    } else {
      const fd = await req.formData();
      pass = (fd.get("pass") ?? "").toString().trim();
    }
  } catch {
    pass = "";
  }

  const store = await cookies();

  if (pass !== expected) {
    // 表单提交失败：跳回门页并带 ?err=1
    if (!ct.includes("application/json")) {
      // 用相对 Location（浏览器按公开域名解析），避免隧道下被重定向到内网 localhost
      return new NextResponse(null, {
        status: 303,
        headers: { Location: "/preview-gate?err=1", "Cache-Control": "no-store" },
      });
    }
    return NextResponse.json({ ok: false, error: "口令不正确" }, { status: 401 });
  }

  store.set("preview_auth", "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 天
  });

  // 表单提交成功：整页跳转首页（原生表单兜底路径）。
  // 务必用相对 Location，否则隧道下会跳到内网 localhost:3000。
  if (!ct.includes("application/json")) {
    return new NextResponse(null, {
      status: 303,
      headers: { Location: "/", "Cache-Control": "no-store" },
    });
  }
  return NextResponse.json({ ok: true });
}
