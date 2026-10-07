"use server";

import { signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import { currentOrigin } from "@/lib/origin";

export async function signOutAction() {
  // 先清会话 cookie，再回到当前访问源的首页（避免 AUTH_URL 跨域名跳转）
  await signOut({ redirect: false });
  const origin = await currentOrigin();
  redirect(origin ? `${origin}/` : "/");
}
