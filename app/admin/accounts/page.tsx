import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isSuperAdmin, ROLE_LABELS, MAX_STAFF_ACCOUNTS, STAFF_ROLES } from "@/lib/permissions";
import {
  createStaffAccount,
  updateStaffRole,
  updateStaffStatus,
  resetStaffPassword,
  resetUserPassword,
  adminSearchUser,
  adminBindPhone,
  adminUnbindPhone,
  adminBindEmail,
  adminUnbindEmail,
} from "./actions";
import { DeleteStaffButton } from "./DeleteStaffButton";
import StaffPermMatrix from "./StaffPermMatrix";

export const metadata = { title: "账号管理" };

const roleOptions = STAFF_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }));

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; q?: string }>;
}) {
  const { error, q } = await searchParams;

  const me = await getCurrentUser();
  if (!me || !isSuperAdmin(me.role)) {
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-amber-300 bg-amber-50 p-8 text-center shadow">
        <div className="mb-2 text-lg font-semibold text-amber-800">权限不足</div>
        <p className="text-sm text-amber-700">
          「账号管理」为<b>系统级功能</b>，仅<b>超级管理员</b>可访问。
        </p>
        <p className="mt-3 text-xs text-amber-600">
          请使用超级管理员账号 <code className="rounded bg-amber-100 px-1">superadmin@test.com</code> 登录后再操作。
        </p>
        <p className="mt-4 text-xs text-amber-500">
          当前账号：{me?.email ?? "未登录"}（{me?.role ? ROLE_LABELS[me.role] : "—"}）
        </p>
        <div className="mt-5">
          <a
            href="/admin"
            className="inline-block rounded-md bg-brand-700 px-4 py-2 text-sm text-white hover:bg-brand-800"
          >
            返回运营监控
          </a>
        </div>
      </div>
    );
  }

  const accounts = await prisma.user.findMany({
    where: { role: { in: STAFF_ROLES } },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      email: true,
      realName: true,
      role: true,
      status: true,
      createdAt: true,
      permissions: true,
    },
  });

  const atLimit = accounts.length >= MAX_STAFF_ACCOUNTS;

  // 用户联系方式管理：按 q（邮箱/手机号）查询任意用户（含普通用户）
  const foundUser = q
    ? await prisma.user.findFirst({
        where: { OR: [{ email: q }, { phone: q }] },
        select: { id: true, phone: true, email: true, role: true, realName: true },
      })
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">账号管理</h1>
          <p className="mt-1 text-sm text-gray-500">
            仅超级管理员可访问。管理后台最多设置 <b>{MAX_STAFF_ACCOUNTS}</b> 个管理员账号
            （1 名超级管理员 + 2 名普通管理员）。当前已用 <b>{accounts.length}</b> 个。
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          ⚠️ {error}
        </div>
      )}

      {/* 新建管理员账号 */}
      <section className="rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-semibold text-gray-800">新建管理员账号</h2>
        {atLimit ? (
          <p className="text-sm text-amber-600">
            已达管理员账号上限（{MAX_STAFF_ACCOUNTS} 个），如需新增请先删除或调整现有账号。
          </p>
        ) : (
          <form action={createStaffAccount} className="grid grid-cols-1 gap-4 md:grid-cols-5">
            <input
              name="email"
              type="email"
              required
              placeholder="邮箱（登录名）"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              name="name"
              type="text"
              placeholder="姓名/昵称"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <select name="role" defaultValue="admin" className="rounded-md border border-gray-300 px-3 py-2 text-sm">
              {roleOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              name="password"
              type="text"
              required
              minLength={6}
              placeholder="初始密码（≥6 位）"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800"
            >
              创建账号
            </button>
          </form>
        )}
      </section>

      {/* 现有管理员账号列表 */}
      <section className="rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-semibold text-gray-800">现有管理员账号</h2>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 text-gray-500">
            <tr>
              <th className="py-2 pr-2">邮箱</th>
              <th className="py-2 pr-2">姓名</th>
              <th className="py-2 pr-2">角色</th>
              <th className="py-2 pr-2">状态</th>
              <th className="py-2 pr-2">创建时间</th>
              <th className="py-2">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {accounts.map((a) => (
              <tr key={a.id} className="align-top">
                <td className="py-3 pr-2">{a.email}</td>
                <td className="py-3 pr-2">{a.realName || "—"}</td>
                <td className="py-3 pr-2">
                  <form action={updateStaffRole} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={a.id} />
                    <select
                      name="role"
                      defaultValue={a.role}
                      className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                    >
                      {roleOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-700 hover:bg-gray-200"
                    >
                      改角色
                    </button>
                  </form>
                </td>
                <td className="py-3 pr-2">
                  <span
                    className={
                      a.status === "active"
                        ? "inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700"
                        : "inline-block rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600"
                    }
                  >
                    {a.status === "active" ? "启用" : "禁用"}
                  </span>
                  <form action={updateStaffStatus} className="mt-1">
                    <input type="hidden" name="id" value={a.id} />
                    <input
                      type="hidden"
                      name="status"
                      value={a.status === "active" ? "disabled" : "active"}
                    />
                    <button
                      type="submit"
                      className="text-xs text-brand-700 underline hover:text-brand-900"
                    >
                      {a.status === "active" ? "禁用" : "启用"}
                    </button>
                  </form>
                </td>
                <td className="py-3 pr-2 text-gray-500">
                  {a.createdAt.toLocaleDateString("zh-CN")}
                </td>
                <td className="py-3">
                  <div className="flex flex-col gap-2">
                    <form action={resetStaffPassword} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={a.id} />
                      <input
                        name="password"
                        type="text"
                        minLength={6}
                        placeholder="新密码"
                        className="w-28 rounded-md border border-gray-300 px-2 py-1 text-xs"
                      />
                      <button
                        type="submit"
                        className="rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-700 hover:bg-gray-200"
                      >
                        重置密码
                      </button>
                    </form>
                    <DeleteStaffButton id={a.id} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* 重置普通用户密码（按邮箱/手机号定位） */}
      <section className="rounded-lg bg-white p-6 shadow">
        <h2 className="mb-1 text-lg font-semibold text-gray-800">重置普通用户密码</h2>
        <p className="mb-4 text-sm text-gray-500">
          前台用户忘记密码、或短信注册的账号想改用密码登录时，按 <b>邮箱或手机号</b>{" "}
          定位并重置。管理员账号请用上方列表内的「重置密码」。
        </p>
        <form action={resetUserPassword} className="flex flex-wrap items-center gap-3">
          <input
            name="identifier"
            type="text"
            required
            placeholder="用户邮箱或手机号"
            className="w-64 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            name="password"
            type="text"
            required
            minLength={6}
            placeholder="新密码（≥6 位）"
            className="w-40 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800"
          >
            重置密码
          </button>
        </form>
      </section>

      {/* 用户联系方式管理（按邮箱/手机号定位任意用户，含普通用户） */}
      <section className="rounded-lg bg-white p-6 shadow">
        <h2 className="mb-1 text-lg font-semibold text-gray-800">用户联系方式管理</h2>
        <p className="mb-4 text-sm text-gray-500">
          按 <b>邮箱或手机号</b> 定位任意用户（含普通用户），由超级管理员直接绑定 / 解绑其手机或邮箱。
          所有操作均记入审计日志。
        </p>
        <form action={adminSearchUser} className="flex flex-wrap items-center gap-3">
          <input
            name="q"
            type="text"
            required
            defaultValue={q ?? ""}
            placeholder="用户邮箱或手机号"
            className="w-64 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800"
          >
            查询
          </button>
          {q && (
            <a href="/admin/accounts" className="text-xs text-gray-400 underline hover:text-gray-600">
              清除
            </a>
          )}
        </form>

        {q && !foundUser && (
          <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            未找到账号：{q}
          </p>
        )}

        {foundUser && (
          <div className="mt-4 rounded-md border border-brand-200 bg-brand-50/60 p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-gray-800">{foundUser.realName || "—"}</span>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                {ROLE_LABELS[foundUser.role]}
              </span>
              <span className="text-gray-600">手机：{foundUser.phone || "未绑定"}</span>
              <span className="text-gray-600">邮箱：{foundUser.email || "未绑定"}</span>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* 绑定 / 更换手机 */}
              <form action={adminBindPhone} className="flex items-end gap-2 rounded-md border border-gray-200 bg-white p-3">
                <input type="hidden" name="id" value={foundUser.id} />
                <input type="hidden" name="q" value={q} />
                <input
                  name="phone"
                  type="tel"
                  required
                  pattern="1\d{10}"
                  placeholder="新手机号"
                  className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                />
                <button type="submit" className="rounded-md bg-gray-100 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-200">
                  绑定手机
                </button>
              </form>

              {/* 解绑手机 */}
              <form action={adminUnbindPhone} className="flex items-center gap-2 rounded-md border border-gray-200 bg-white p-3">
                <input type="hidden" name="id" value={foundUser.id} />
                <input type="hidden" name="q" value={q} />
                <span className="flex-1 text-sm text-gray-600">
                  {foundUser.phone ? "解除当前手机号绑定" : "当前未绑定手机号"}
                </span>
                <button
                  type="submit"
                  disabled={!foundUser.phone}
                  className="rounded-md border border-red-300 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-40"
                >
                  解绑手机
                </button>
              </form>

              {/* 绑定 / 更换邮箱 */}
              <form action={adminBindEmail} className="flex items-end gap-2 rounded-md border border-gray-200 bg-white p-3">
                <input type="hidden" name="id" value={foundUser.id} />
                <input type="hidden" name="q" value={q} />
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="新邮箱"
                  className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                />
                <button type="submit" className="rounded-md bg-gray-100 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-200">
                  绑定邮箱
                </button>
              </form>

              {/* 解绑邮箱 */}
              <form action={adminUnbindEmail} className="flex items-center gap-2 rounded-md border border-gray-200 bg-white p-3">
                <input type="hidden" name="id" value={foundUser.id} />
                <input type="hidden" name="q" value={q} />
                <span className="flex-1 text-sm text-gray-600">
                  {foundUser.email ? "解除当前邮箱绑定" : "当前未绑定邮箱"}
                </span>
                <button
                  type="submit"
                  disabled={!foundUser.email}
                  className="rounded-md border border-red-300 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-40"
                >
                  解绑邮箱
                </button>
              </form>
            </div>
          </div>
        )}
      </section>

      {/* 模块权限设置（按账号细粒度 RBAC）：超级管理员为每个普通管理员勾选可管理模块 */}
      <section className="rounded-lg bg-white p-6 shadow">
        <h2 className="mb-1 text-lg font-semibold text-gray-800">模块权限设置</h2>
        <p className="mb-5 text-sm text-gray-500">
          为每名<b>普通管理员 / 编辑</b>单独勾选其可管理的后台模块。未勾选任何模块并保存即<b>回退该角色默认权限</b>。
          超级管理员权限固定为全部，不可配置。
        </p>
        <div className="space-y-6">
          {accounts
            .filter((a) => a.role !== "super_admin")
            .map((a) => (
              <div key={a.id} className="rounded-lg border border-gray-200 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="font-medium text-gray-800">{a.email}</span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                    {ROLE_LABELS[a.role]}
                  </span>
                  <span className="text-xs text-gray-400">{a.realName || "—"}</span>
                </div>
                <StaffPermMatrix id={a.id} role={a.role} permissions={a.permissions} />
              </div>
            ))}
          {accounts.filter((a) => a.role === "super_admin").length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
              <b>超级管理员</b>（
              {accounts.filter((a) => a.role === "super_admin").map((a) => a.email).join("、")}
              ）拥有全部后台权限（含账号管理 / 操作审计），系统固定、无需配置。
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
