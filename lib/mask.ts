/**
 * 实名脱敏工具
 *
 * 用途：宗祠祭祀/消费记录等在**公开展示**的场景下，需要展示「是谁献祭的」，
 * 但又不能泄露完整实名与联系方式。本模块统一处理这类脱敏展示。
 *
 * 原则：
 *   1. 优先展示真实姓名，但必须打码；
 *   2. 无真实姓名时，回退到脱敏后的手机号 / 邮箱；
 *   3. 全空时返回「匿名宗亲」——**任何情况下都不产生空白**（避免出现只有图标没有名字的记录）。
 */

/** 中文姓名脱敏：2 字「张三」→「张*」；3 字「李明华」→「李*华」；4 字「欧阳明华」→「欧**华」 */
function maskChineseName(name: string): string {
  // 用展开符逐字符处理，兼容罕见字与代理对（emoji）编码
  const chars = [...name];
  const n = chars.length;
  if (n <= 1) return name; // 单字无法打码又不失意义，原样返回
  if (n === 2) return chars[0] + "*";
  if (n === 3) return chars[0] + "*" + chars[2];
  // 4 字及以上（含复姓）：保留首尾，中间全部打码
  return chars[0] + "*".repeat(n - 2) + chars[n - 1];
}

/** 拉丁/英文名脱敏：「John」→「J***」；「Al」→「A*」；单字符原样 */
function maskLatinName(name: string): string {
  const t = name.trim();
  if (t.length <= 1) return t;
  if (t.length === 2) return t[0] + "*";
  return t[0] + "*".repeat(Math.min(t.length - 1, 3));
}

/** 手机号脱敏：「13812345678」→「138****5678」 */
function maskPhone(phone: string): string {
  const p = phone.replace(/\D/g, ""); // 去掉空格、横线等分隔符
  if (p.length < 7) return p.length <= 3 ? "*".repeat(p.length) : p.slice(0, 3) + "****";
  return p.slice(0, 3) + "****" + p.slice(-4);
}

/** 邮箱脱敏：「user@test.com」→「us***@test.com」（本地部分保留前 2 位，域名保留） */
function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return maskLatinName(email); // 非法邮箱，退化为拉丁名脱敏
  const local = email.slice(0, at);
  const domain = email.slice(at); // 含 @
  const head = local.slice(0, 2);
  const stars = "*".repeat(Math.max(3, Math.min(Math.max(local.length - 2, 1), 4)));
  return head + stars + domain;
}

export type MaskedIdentity = {
  /** 公开展示用（已脱敏）——可直接渲染到前台页面 */
  display: string;
  /** 完整真实姓名（仅馆主/管理台可见，前台禁止渲染） */
  realName: string | null;
  /** 完整联系方式（手机号或邮箱，仅馆主/管理台可见，前台禁止渲染） */
  contact: string | null;
};

/**
 * 生成脱敏身份。
 * 优先级：realName > phone > email > 「匿名宗亲」
 */
export function maskIdentity(
  user:
    | { realName?: string | null; phone?: string | null; email?: string | null }
    | null
    | undefined,
): MaskedIdentity {
  const realName = user?.realName?.trim() || null;
  const phone = user?.phone?.trim() || null;
  const email = user?.email?.trim() || null;

  let display: string;
  if (realName) {
    // 含 CJK 字符按中文规则，否则按拉丁规则
    display = /[\u4e00-\u9fa5]/.test(realName) ? maskChineseName(realName) : maskLatinName(realName);
  } else if (phone) {
    display = maskPhone(phone);
  } else if (email) {
    display = maskEmail(email);
  } else {
    display = "匿名宗亲";
  }

  return {
    display,
    realName,
    contact: phone ?? email ?? null,
  };
}

/** 便捷函数：只要脱敏后的展示名 */
export function maskName(user: Parameters<typeof maskIdentity>[0]): string {
  return maskIdentity(user).display;
}
