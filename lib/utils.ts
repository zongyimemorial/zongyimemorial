import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 分 → 元（字符串，保留两位小数） */
export function formatYuan(fen: number): string {
  return (fen / 100).toFixed(2);
}

/** 生成订单号：时间戳 + 随机 */
export function genOrderNo(prefix = "MJ"): string {
  const ts = Date.now().toString();
  const rand = Math.floor(Math.random() * 1e6)
    .toString()
    .padStart(6, "0");
  return `${prefix}${ts}${rand}`;
}

/** 简单 slug 生成（中文保留，空格转连字符） */
export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w一-龥-]/g, "")
    .slice(0, 80);
}
