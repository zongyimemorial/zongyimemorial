"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ObituaryResult } from "@/app/console/obituaries/actions";
import PasswordInput from "@/components/ui/PasswordInput";

type HallOption = { id: string; name: string; deceasedName: string };

type Props = {
  /** 已有讣告（编辑模式）；缺省为发布模式 */
  obituary?: {
    id: string;
    deceasedName: string;
    birthDate: string | null;
    deathDate: string | null;
    biography: string | null;
    funeralInfo: string | null;
    contactInfo: string | null;
    hallId: string | null;
    isPublic: boolean;
    allowMessages: boolean;
    hasPassword: boolean;
  };
  /** 可关联的纪念馆（当前用户 status=active） */
  halls: HallOption[];
  /** 发布模式用：提交 action */
  action: (formData: FormData) => Promise<ObituaryResult>;
  /** 剩余配额（仅发布模式展示） */
  quotaLeft?: number;
};

/**
 * 电子讣告发布 / 编辑表单。
 *
 * 发布模式：配额为 0 时禁用提交并引导去商城/积分页。
 * 编辑模式：密码字段留空=不改，页面上明确提示（绝不回显原密码）。
 */
export default function ObituaryForm({ obituary, halls, action, quotaLeft }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isEdit = !!obituary;
  const noQuota = !isEdit && (quotaLeft ?? 0) <= 0;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await action(fd);
      if (!res.ok) {
        setError(res.message || "操作失败");
        return;
      }
      if (res.id) router.push(`/console/obituaries/${res.id}`);
      else router.push("/console/obituaries");
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" data-obituary-form>
      {obituary && <input type="hidden" name="obituaryId" value={obituary.id} />}

      <div>
        <label className="mb-1 block text-sm font-medium text-brand-800">
          逝者姓名 <span className="text-red-500">*</span>
        </label>
        <input
          name="deceasedName"
          required
          maxLength={30}
          defaultValue={obituary?.deceasedName ?? ""}
          placeholder="如：张公讳明德"
          className="w-full rounded-md border border-brand-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-brand-800">出生日期</label>
          <input
            type="date"
            name="birthDate"
            defaultValue={obituary?.birthDate ?? ""}
            className="w-full rounded-md border border-brand-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-brand-800">逝世日期</label>
          <input
            type="date"
            name="deathDate"
            defaultValue={obituary?.deathDate ?? ""}
            className="w-full rounded-md border border-brand-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-brand-800">生平简介</label>
        <textarea
          name="biography"
          rows={6}
          maxLength={2000}
          defaultValue={obituary?.biography ?? ""}
          placeholder="简述逝者生平、品行与一生行迹……"
          className="w-full rounded-md border border-brand-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-brand-800">告别仪式信息</label>
        <textarea
          name="funeralInfo"
          rows={4}
          maxLength={2000}
          defaultValue={obituary?.funeralInfo ?? ""}
          placeholder="时间、地点、流程、注意事项……"
          className="w-full rounded-md border border-brand-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-brand-800">治丧联系</label>
        <textarea
          name="contactInfo"
          rows={2}
          maxLength={500}
          defaultValue={obituary?.contactInfo ?? ""}
          placeholder="亲属 / 治丧委员会联系方式（将公开展示，请注意隐私）"
          className="w-full rounded-md border border-brand-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-brand-800">关联纪念馆（可选）</label>
        <select
          name="hallId"
          defaultValue={obituary?.hallId ?? ""}
          className="w-full rounded-md border border-brand-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
        >
          <option value="">不关联（独立讣告）</option>
          {halls.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name} · 纪念{h.deceasedName}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-brand-400">关联后将在公开页展示纪念馆入口。</p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-brand-800">
          访问密码{isEdit ? "（留空则不修改）" : "（可选）"}
        </label>
        <PasswordInput
          name="password"
          autoComplete="new-password"
          placeholder={isEdit && obituary?.hasPassword ? "已设置密码 · 留空保持不变" : "留空则任何人凭链接可看"}
          className="w-full rounded-md border border-brand-300 px-3 py-2 pr-10 text-sm focus:border-accent-500 focus:outline-none"
        />
        <p className="mt-1 text-xs text-brand-400">
          设置后，亲友需输入密码才能查看此讣告。
        </p>
      </div>

      <div className="space-y-2 rounded-md border border-brand-200 bg-gray-50 p-3">
        <label className="flex items-center gap-2 text-sm text-brand-800">
          <input
            type="checkbox"
            name="isPublic"
            defaultChecked={obituary ? obituary.isPublic : true}
            className="h-4 w-4"
          />
          公开（允许搜索引擎收录；未设密码时任何人可访问）
        </label>
        <label className="flex items-center gap-2 text-sm text-brand-800">
          <input
            type="checkbox"
            name="allowMessages"
            defaultChecked={obituary ? obituary.allowMessages : true}
            className="h-4 w-4"
          />
          开放留言区（亲友可在线留言悼念）
        </label>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {noQuota && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          暂无发布配额。请先
          <a href="/mall/e-obituary" className="mx-1 underline">
            在商城购买
          </a>
          或用积分
          <a href="/points" className="mx-1 underline">
            兑换
          </a>
          「电子讣告发布」。
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || noQuota}
          className="rounded-md bg-accent-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "提交中…" : isEdit ? "保存修改" : "发布讣告"}
        </button>
        {!isEdit && !noQuota && (
          <span className="text-xs text-brand-400">剩余可发布 {quotaLeft} 份</span>
        )}
      </div>
    </form>
  );
}
