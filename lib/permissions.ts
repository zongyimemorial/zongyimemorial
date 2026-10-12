// 管理后台 RBAC 权限矩阵
// ---------------------------------------------------------------------------
// 角色三档（对应「1 个最高级别账户 + 2 个普通管理员账户」的需求）：
//   super_admin（超级管理员）：拥有全部后台权限，含「账号管理」「操作审计」两个仅超管可见模块
//   admin（管理员 / 普通管理员）：运营全权限，但不含账号管理、操作审计等系统级模块
//   editor（编辑 / 内容岗）：仅限内容生产与内容安全相关模块，不能触碰商品/订单/财务/台帐等经营性模块
//   user（普通用户）：无后台权限（占位，防止误判）
//
// 设计原则：
//   - 纯 TS + 类型导入，无 prisma 运行时依赖 → 可在服务端/客户端共用
//   - 权限以「模块 key」表达，导航与管理动作都以 key 为唯一判据，避免散落的字符串比较
//   - 路径 → 权限的映射集中在本文件（permForPath），新增后台页只需在 ADMIN_MODULES 注册
// ---------------------------------------------------------------------------

import type { UserRole } from "@prisma/client";

/** 后台可授权模块（同时也是后台导航项） */
export type Permission =
  | "monitor" // 运营监控大盘
  | "content" // 内容管理（新闻文章）
  | "products" // 商品管理（虚拟祭品商城）
  | "mall_ops" // 商城经营测算（定价/成本/毛利内部数据）
  | "orders" // 订单管理
  | "live" // 直播管理
  | "activities" // 宗族活动管理
  | "review" // 内容审核（含建馆/建祠审核）
  | "ledger_halls" // 纪念馆消费台帐
  | "ledger_clans" // 宗祠消费台帐
  | "points" // 积分台账
  | "services" // 服务工单
  | "whispers" // 悄悄话经营（合规审核/内容治理）
  | "memorial_review" // 公益纪念堂审核（申请/留言审核、下架）
  | "accounts" // 账号管理（仅超管）
  | "audit"; // 操作审计（仅超管）

/** 后台模块元信息：导航渲染 + 权限说明都用它 */
export interface AdminModule {
  key: Permission;
  label: string;
  href: string;
  desc: string; // 该模块的管理职责说明（用于权限说明页/审计）
  superOnly?: boolean; // 仅超级管理员可见
}

/** 后台全部模块（顺序即导航顺序）。新增后台页在此注册即可。 */
export const ADMIN_MODULES: AdminModule[] = [
  {
    key: "monitor",
    label: "运营监控",
    href: "/admin",
    desc: "网站整体运营数据大盘：流量、活跃（DAU/WAU/MAU）、营收、转化、健康度等",
  },
  {
    key: "content",
    label: "内容管理",
    href: "/admin/articles",
    desc: "新闻/资讯文章的全生命周期管理：新建、编辑、发布、下架",
  },
  {
    key: "products",
    label: "商品管理",
    href: "/admin/products",
    desc: "虚拟祭品商城的商品（祭品/服务/订阅等）上下架与定价维护",
  },
  {
    key: "mall_ops",
    label: "商城经营",
    href: "/admin/mall",
    desc: "虚拟祭品商城的定价体系、单位成本与毛利等经营内部数据（类似「悄悄话经营」）",
  },
  {
    key: "orders",
    label: "订单管理",
    href: "/admin/orders",
    desc: "订单查询、发货/退款状态流转等履约操作",
  },
  {
    key: "live",
    label: "直播管理",
    href: "/admin/live",
    desc: "重大仪式/公祭直播的编排、上下线管理",
  },
  {
    key: "activities",
    label: "宗族活动",
    href: "/admin/activities",
    desc: "宗族活动（祭祖大典/宗亲联谊/修谱研讨等）的发布、编辑与下架管理",
  },
  {
    key: "review",
    label: "内容审核",
    href: "/admin/review",
    desc: "纪念馆/宗祠建馆审核、评论与内容安全复核（运营核心风控）",
  },
  {
    key: "ledger_halls",
    label: "纪念馆台帐",
    href: "/admin/ledger/halls",
    desc: "纪念馆维度消费/营收与供奉记录台帐查询",
  },
  {
    key: "ledger_clans",
    label: "宗祠台帐",
    href: "/admin/ledger/clans",
    desc: "宗祠维度消费/营收与祭祀记录台帐查询",
  },
  {
    key: "points",
    label: "积分台账",
    href: "/admin/points",
    desc: "用户积分发放/兑换/调整的台账与人工调整",
  },
  {
    key: "services",
    label: "服务工单",
    href: "/admin/services",
    desc: "云祭扫/纪念服务等人工履约工单的受理与完成",
  },
  {
    key: "whispers",
    label: "悄悄话经营",
    href: "/admin/whispers",
    desc: "午夜悄悄话产品的合规审核、声线/配额与内容治理",
  },
  {
    key: "memorial_review",
    label: "公益纪念审核",
    href: "/admin/memorial-review",
    desc: "公益纪念堂的家属申请审核、公众留言审核与违规下架（纯公益、合规隔离）",
  },
  {
    key: "accounts",
    label: "账号管理",
    href: "/admin/accounts",
    desc: "管理员账号的增删改、角色与状态管理（系统级，仅超管）",
    superOnly: true,
  },
  {
    key: "audit",
    label: "操作审计",
    href: "/admin/audit",
    desc: "全量管理员操作审计日志查询（系统级，仅超管）",
    superOnly: true,
  },
];

/** 各角色被授予的权限集合（模块 key 列表） */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  // 普通用户：无后台权限
  user: [],
  // 编辑 / 内容岗：内容生产与内容安全相关，不碰经营性/财务性模块
  editor: ["monitor", "content", "review", "whispers"],
  // 管理员 / 普通管理员：运营全权限，但不含账号管理、操作审计
  admin: [
    "monitor",
    "content",
    "products",
    "mall_ops",
    "orders",
    "live",
    "activities",
    "review",
    "ledger_halls",
    "ledger_clans",
    "points",
    "services",
    "whispers",
    "memorial_review",
  ],
  // 超级管理员：全部权限
  super_admin: ADMIN_MODULES.map((m) => m.key),
};

/** 角色中文标签（底部身份条三态+） */
export const ROLE_LABELS: Record<UserRole, string> = {
  user: "普通用户",
  editor: "编辑",
  admin: "管理员",
  super_admin: "超级管理员",
};

/** 管理员账号上限（需求：管理后台最多设置 3 个管理员账号 = 1 超管 + 2 普通） */
export const MAX_STAFF_ACCOUNTS = 3;

/** 管理类角色集合（用于账号统计与上限判定） */
export const STAFF_ROLES: UserRole[] = ["super_admin", "admin", "editor"];

/** 是否后台员工（任一管理角色） */
export function isStaff(role?: UserRole | null): boolean {
  if (!role) return false;
  return role === "admin" || role === "editor" || role === "super_admin";
}

/** 是否超级管理员 */
export function isSuperAdmin(role?: UserRole | null): boolean {
  return role === "super_admin";
}

/** 角色是否拥有某权限 */
export function hasPerm(role: UserRole | undefined | null, perm: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(perm);
}

/** 按角色过滤出该角色可见的导航模块 */
export function modulesForRole(role?: UserRole | null): AdminModule[] {
  if (!role) return [];
  const granted = ROLE_PERMISSIONS[role];
  return ADMIN_MODULES.filter((m) => granted.includes(m.key));
}

/**
 * 给定后台路径，判断某角色是否可访问。
 * 用于「页面级」与「客户端路由守卫」门控；敏感页（账号/审计）仍须服务端再以 isSuperAdmin 校验。
 */
export function canAccess(pathname: string, role?: UserRole | null): boolean {
  if (!isStaff(role)) return false;
  // 精确匹配 /admin 根（dashboard 归属 monitor）
  if (pathname === "/admin") return hasPerm(role, "monitor");
  const mod = ADMIN_MODULES.find(
    (m) => m.href !== "/admin" && (pathname === m.href || pathname.startsWith(m.href + "/"))
  );
  if (!mod) return true; // 未知后台路径默认放行给员工（如 /admin 下的非模块子页）
  return hasPerm(role, mod.key);
}

/**
 * 系统级路径（仅超管可访问的账号管理 / 操作审计）。
 * 这类页面会自行渲染「权限不足」提示，客户端守卫不应抢先踢回前台。
 */
export function isSystemOnlyPath(pathname: string): boolean {
  return ADMIN_MODULES.some(
    (m) => m.superOnly && (pathname === m.href || pathname.startsWith(m.href + "/"))
  );
}

/**
 * 可由超级管理员分配给「普通管理员 / 编辑」的模块集合（不含账号管理、操作审计这两个系统级模块）。
 * 超管权限固定全开，不可被勾选/收回。
 */
export const ASSIGNABLE_MODULES: AdminModule[] = ADMIN_MODULES.filter((m) => !m.superOnly);
export const ASSIGNABLE_KEYS: Permission[] = ASSIGNABLE_MODULES.map((m) => m.key);

/**
 * 解析某用户的「有效权限集合」：
 *   - permissions 非空数组 → 直接采用（超管 UI 只能下发 ASSIGNABLE_KEYS，见 sanitizePermKeys）
 *   - 空数组 / 未提供 → 回退到该角色的默认权限（ROLE_PERMISSIONS[role]）
 * 这样「不设即按角色默认」与「显式勾选覆盖角色默认」两套语义都能成立。
 * 注：super_admin 即便 permissions 为空也走角色默认 = 全部模块。
 */
export function effectivePermKeys(
  role?: UserRole | null,
  permissions?: string[] | null
): Permission[] {
  if (permissions && permissions.length > 0) {
    // 仅信任「合法权限 key」，过滤掉任何伪造/越权 key（如 accounts/audit）
    const valid = new Set<string>(ASSIGNABLE_KEYS as string[]);
    return permissions.filter((k) => valid.has(k)) as Permission[];
  }
  if (!role) return [];
  return ROLE_PERMISSIONS[role];
}

/** 按用户判断：该用户是否拥有某权限（含角色默认回退） */
export function hasPermForUser(
  role?: UserRole | null,
  permissions?: string[] | null,
  perm?: Permission | null
): boolean {
  if (!perm) return false;
  return effectivePermKeys(role, permissions).includes(perm);
}

/** 按用户过滤出该用户可见的导航模块（含角色默认回退） */
export function modulesForUser(
  role?: UserRole | null,
  permissions?: string[] | null
): AdminModule[] {
  const granted = effectivePermKeys(role, permissions);
  return ADMIN_MODULES.filter((m) => granted.includes(m.key));
}

/**
 * 按用户判定某后台路径是否可访问（含角色默认回退）。
 * 用于「页面级」与「客户端路由守卫」门控；敏感页（账号/审计）仍须服务端再以 isSuperAdmin 校验。
 */
export function canAccessForUser(
  pathname: string,
  role?: UserRole | null,
  permissions?: string[] | null
): boolean {
  if (!isStaff(role)) return false;
  if (pathname === "/admin") return hasPermForUser(role, permissions, "monitor");
  const mod = ADMIN_MODULES.find(
    (m) => m.href !== "/admin" && (pathname === m.href || pathname.startsWith(m.href + "/"))
  );
  if (!mod) return true; // 未知后台路径默认放行给员工
  return hasPermForUser(role, permissions, mod.key);
}

/**
 * 校验/清洗外部传入的权限数组：只保留属于「可分配模块」的合法 key，去重。
 * 用途：账号管理页提交模块开关时，防止越权授予 accounts / audit 等系统级模块。
 */
export function sanitizePermKeys(raw: string[] | null | undefined): Permission[] {
  const valid = new Set<string>(ASSIGNABLE_KEYS as string[]);
  const out = new Set<string>();
  for (const k of raw ?? []) {
    if (valid.has(k)) out.add(k);
  }
  return Array.from(out) as Permission[];
}
