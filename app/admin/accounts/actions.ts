"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getCurrentUser, type SessionUser } from "@/lib/auth";
import { isSuperAdmin, MAX_STAFF_ACCOUNTS, STAFF_ROLES, sanitizePermKeys } from "@/lib/permissions";
import type { UserRole } from "@prisma/client";

const ACCOUNTS_PATH = "/admin/accounts";

/** 仅超级管理员可执行；否则踢回前台 */
async function assertSuper(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user || !isSuperAdmin(user.role)) redirect("/console");
  return user as SessionUser;
}

/** 约束失败：带错误信息回到账号管理页（可附带 q 保持查询上下文） */
function fail(msg: string, q?: string): never {
  const base = q ? `${ACCOUNTS_PATH}?q=${encodeURIComponent(q)}` : ACCOUNTS_PATH;
  const sep = base.includes("?") ? "&" : "?";
  redirect(`${base}${sep}error=${encodeURIComponent(msg)}`);
}

/** 成功后回到账号管理页（可附带 q 保持查询上下文） */
function done(q?: string): never {
  redirect(q ? `${ACCOUNTS_PATH}?q=${encodeURIComponent(q)}` : ACCOUNTS_PATH);
}

/** 写入操作审计（账号管理动作统一落 AuditLog） */
async function audit(actorId: string, action: string, entityId: string) {
  await prisma.auditLog.create({
    data: { userId: actorId, action, entity: "User", entityId },
  });
}

/** 当前在职管理员账号数（含超管/管理员/编辑） */
async function countStaff(): Promise<number> {
  return prisma.user.count({ where: { role: { in: STAFF_ROLES } } });
}

/** 除指定账号外，仍有多少名超级管理员 */
async function otherSuperCount(exceptId: string): Promise<number> {
  return prisma.user.count({
    where: { role: "super_admin", id: { not: exceptId } },
  });
}

/** 创建新管理员账号（受 3 个上限约束） */
export async function createStaffAccount(formData: FormData) {
  const actor = await assertSuper();

  const email = String(formData.get("email") || "").trim().toLowerCase();
  const name = String(formData.get("name") || "").trim();
  const role = String(formData.get("role") || "") as UserRole;
  const password = String(formData.get("password") || "");

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail("邮箱格式不正确");
  if (!STAFF_ROLES.includes(role)) fail("角色不合法");
  if (password.length < 6) fail("初始密码至少 6 位");

  if ((await countStaff()) >= MAX_STAFF_ACCOUNTS) {
    fail(`管理员账号已达上限（${MAX_STAFF_ACCOUNTS} 个），无法再创建`);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) fail("该邮箱已存在，请直接修改其角色/状态");

  const passwordHash = await bcrypt.hash(password, 10);
  const created = await prisma.user.create({
    data: { email, realName: name || email, passwordHash, role, status: "active" },
  });
  await audit(actor.id, `account_create:${role}`, created.id);
  revalidatePath(ACCOUNTS_PATH);
  redirect(ACCOUNTS_PATH);
}

/** 修改管理员角色（防降最后一名超级管理员） */
export async function updateStaffRole(formData: FormData) {
  const actor = await assertSuper();

  const id = String(formData.get("id") || "");
  const role = String(formData.get("role") || "") as UserRole;
  if (!id) fail("缺少目标账号");
  if (!STAFF_ROLES.includes(role)) fail("角色不合法");

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target || !STAFF_ROLES.includes(target.role)) fail("目标账号不是管理员");

  // 若要把现任超管降级，必须保证仍有其他超管在位
  if (target.role === "super_admin" && role !== "super_admin") {
    if ((await otherSuperCount(id)) < 1) {
      fail("至少需保留 1 名超级管理员，无法降级最后一名");
    }
  }

  await prisma.user.update({ where: { id }, data: { role } });
  await audit(actor.id, `account_role:${target.role}->${role}`, id);
  revalidatePath(ACCOUNTS_PATH);
  redirect(ACCOUNTS_PATH);
}

/** 启用 / 禁用管理员账号（禁用最后一名超管被禁止） */
export async function updateStaffStatus(formData: FormData) {
  const actor = await assertSuper();

  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "");
  if (!id) fail("缺少目标账号");
  if (status !== "active" && status !== "disabled") fail("状态不合法");

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target || !STAFF_ROLES.includes(target.role)) fail("目标账号不是管理员");

  // 禁用一名超管时，必须还有别的超管可接管
  if (status === "disabled" && target.role === "super_admin") {
    if ((await otherSuperCount(id)) < 1) {
      fail("不能禁用最后一名超级管理员");
    }
  }

  await prisma.user.update({ where: { id }, data: { status: status as "active" | "disabled" } });
  await audit(actor.id, `account_status:${status}`, id);
  revalidatePath(ACCOUNTS_PATH);
  redirect(ACCOUNTS_PATH);
}

/** 重置管理员密码 */
export async function resetStaffPassword(formData: FormData) {
  const actor = await assertSuper();

  const id = String(formData.get("id") || "");
  const password = String(formData.get("password") || "");
  if (!id) fail("缺少目标账号");
  if (password.length < 6) fail("新密码至少 6 位");

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target || !STAFF_ROLES.includes(target.role)) fail("目标账号不是管理员");

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.update({ where: { id }, data: { passwordHash } });
  await audit(actor.id, "account_reset_password", id);
  revalidatePath(ACCOUNTS_PATH);
  redirect(ACCOUNTS_PATH);
}

/** 删除管理员账号（禁止删除自己 / 最后一名超管） */
export async function deleteStaffAccount(formData: FormData) {
  const actor = await assertSuper();

  const id = String(formData.get("id") || "");
  if (!id) fail("缺少目标账号");
  if (id === actor.id) fail("不能删除当前登录的账号（请先由其他超管操作）");

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target || !STAFF_ROLES.includes(target.role)) fail("目标账号不是管理员");

  if (target.role === "super_admin" && (await otherSuperCount(id)) < 1) {
    fail("至少需保留 1 名超级管理员，无法删除最后一名");
  }

  await prisma.user.delete({ where: { id } });
  await audit(actor.id, "account_delete", id);
  revalidatePath(ACCOUNTS_PATH);
  redirect(ACCOUNTS_PATH);
}

/**
 * 配置普通管理员的「模块权限」（细粒度 RBAC）。
 * - 仅超级管理员可调用；
 * - 目标必须是普通管理员 / 编辑，超级管理员权限固定全开、不可配置；
 * - 仅接受 ASSIGNABLE_KEYS 内的合法 key（sanitizePermKeys 已拦截 accounts/audit 等系统级模块），
 *   防止越权授予账号管理 / 操作审计。
 */
export async function updateStaffPermissions(formData: FormData) {
  const actor = await assertSuper();

  const id = String(formData.get("id") || "");
  if (!id) fail("缺少目标账号");

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target || !STAFF_ROLES.includes(target.role)) fail("目标账号不是管理员");
  if (target.role === "super_admin") fail("超级管理员权限固定为全部，无需配置");

  // 仅收集被勾选的模块 key；未勾选即不提交（复选框默认行为）
  const checked = formData.getAll("perm").map((v) => String(v));
  const perms = sanitizePermKeys(checked); // 过滤越权 key + 去重

  await prisma.user.update({ where: { id }, data: { permissions: perms } });
  await audit(actor.id, `account_perms:${perms.join(",") || "default"}`, id);
  revalidatePath(ACCOUNTS_PATH);
  redirect(ACCOUNTS_PATH);
}

/**
 * 重置「普通用户」密码（按邮箱或手机号定位）。
 *
 * 用途：前台用户忘记密码，或短信验证码注册的账号希望改用密码登录时，
 * 由超级管理员兜底重置。操作同样写入审计日志。
 *
 * 明确拒绝管理员账号：管理员请走「现有管理员账号」列表里的重置密码
 * （resetStaffPassword），那里附带 STAFF_ROLES 相关的额外约束，
 * 不走这里以免绕过。
 */
export async function resetUserPassword(formData: FormData) {
  const actor = await assertSuper();

  const identifier = String(formData.get("identifier") || "").trim();
  const password = String(formData.get("password") || "");
  if (!identifier) fail("请输入用户的邮箱或手机号");
  if (password.length < 6) fail("新密码至少 6 位");

  const target = await prisma.user.findFirst({
    where: { OR: [{ email: identifier }, { phone: identifier }] },
    select: { id: true, role: true },
  });
  if (!target) fail(`未找到账号：${identifier}`);
  if (STAFF_ROLES.includes(target.role)) {
    fail("该账号属于管理员，请使用上方「现有管理员账号」列表内的重置密码");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.update({ where: { id: target.id }, data: { passwordHash } });
  await audit(actor.id, "user_reset_password", target.id);
  revalidatePath(ACCOUNTS_PATH);
  redirect(ACCOUNTS_PATH);
}

/**
 * 按邮箱 / 手机号查询任意用户（含普通用户），用于后台管理其联系方式。
 * 仅超级管理员可调用，查询结果通过 ?q= 回到账号管理页渲染。
 */
export async function adminSearchUser(formData: FormData) {
  const actor = await assertSuper();
  const q = String(formData.get("q") || "").trim();
  if (!q) fail("请输入要查询的邮箱或手机号");
  // 只负责把查询条件回传页面，不做权限外的越权展示
  void actor;
  redirect(`${ACCOUNTS_PATH}?q=${encodeURIComponent(q)}`);
}

/** 读取目标用户并校验其存在 */
async function loadTarget(id: string) {
  if (!id) fail("缺少目标账号");
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, phone: true, email: true, role: true },
  });
  if (!target) fail("目标账号不存在");
  return target;
}

/** 超级管理员为任意用户「绑定 / 更换手机号」（不要求验证码，操作受审计） */
export async function adminBindPhone(formData: FormData) {
  const actor = await assertSuper();
  const id = String(formData.get("id") || "");
  const phone = String(formData.get("phone") || "").trim();
  const q = String(formData.get("q") || "").trim();
  if (!/^1\d{10}$/.test(phone)) fail("手机号格式不正确", q);

  const target = await loadTarget(id);
  const existing = await prisma.user.findFirst({ where: { phone } });
  if (existing && existing.id !== id) fail("该手机号已绑定其他账号", q);

  await prisma.user.update({ where: { id }, data: { phone } });
  await audit(actor.id, "admin_bind_phone", id);
  revalidatePath(ACCOUNTS_PATH);
  done(q);
}

/** 超级管理员为任意用户「解绑手机号」（解绑后必须仍保留邮箱作为联系方式） */
export async function adminUnbindPhone(formData: FormData) {
  const actor = await assertSuper();
  const id = String(formData.get("id") || "");
  const q = String(formData.get("q") || "").trim();

  const target = await loadTarget(id);
  if (!target.phone) fail("该账号未绑定手机号", q);
  if (!target.email) fail("解绑手机会导致该账号无任何联系方式，请先为其绑定邮箱", q);

  await prisma.user.update({ where: { id }, data: { phone: null } });
  await audit(actor.id, "admin_unbind_phone", id);
  revalidatePath(ACCOUNTS_PATH);
  done(q);
}

/** 超级管理员为任意用户「绑定 / 更换邮箱」（不要求验证码，操作受审计） */
export async function adminBindEmail(formData: FormData) {
  const actor = await assertSuper();
  const id = String(formData.get("id") || "");
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const q = String(formData.get("q") || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("邮箱格式不正确", q);

  const target = await loadTarget(id);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.id !== id) fail("该邮箱已绑定其他账号", q);

  await prisma.user.update({ where: { id }, data: { email } });
  await audit(actor.id, "admin_bind_email", id);
  revalidatePath(ACCOUNTS_PATH);
  done(q);
}

/** 超级管理员为任意用户「解绑邮箱」（解绑后必须仍保留手机号作为联系方式） */
export async function adminUnbindEmail(formData: FormData) {
  const actor = await assertSuper();
  const id = String(formData.get("id") || "");
  const q = String(formData.get("q") || "").trim();

  const target = await loadTarget(id);
  if (!target.email) fail("该账号未绑定邮箱", q);
  if (!target.phone) fail("解绑邮箱会导致该账号无任何联系方式，请先为其绑定手机号", q);

  await prisma.user.update({ where: { id }, data: { email: null } });
  await audit(actor.id, "admin_unbind_email", id);
  revalidatePath(ACCOUNTS_PATH);
  done(q);
}
