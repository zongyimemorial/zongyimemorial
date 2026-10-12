import Link from "next/link";
import ApplyForm from "@/components/memorial/ApplyForm";

export const metadata = { title: "家属申请 · 公益纪念堂" };

export default function MemorialApplyPage() {
  return (
    <div className="container-page max-w-2xl py-12">
      <header className="mb-8 text-center">
        <h1 className="text-2xl font-semibold text-brand-900">申请创建公益纪念堂</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-brand-500">
          本堂由平台在征得家属同意后，
          <b className="text-brand-700">免费</b>为已故名人、见义勇为者与好人好事者创建最高级别的纪念馆。
          请由近亲属提交，并附权威来源以核验真实性。
        </p>
      </header>

      {/* 提交前须知：让家属先看清要准备的材料与流程 */}
      <div className="mb-6 rounded-xl border border-brand-200 bg-brand-100/70 p-5">
        <h2 className="text-sm font-semibold text-brand-900">提交前，请先准备好以下材料</h2>
        <ul className="mt-3 space-y-2 text-sm text-brand-700">
          <li className="flex gap-2">
            <span className="text-accent-600">·</span>
            <span>逝者真实信息：姓名、纪念类别、生卒年，以及一句话称号、事迹简介与详情</span>
          </li>
          <li className="flex gap-2">
            <span className="text-accent-600">·</span>
            <span>权威来源链接：官方通报 / 主流媒体报道 / 称号评定文书，用于核验真实性</span>
          </li>
          <li className="flex gap-2">
            <span className="text-accent-600">·</span>
            <span>申请人（近亲属）信息：姓名、与逝者关系、联系方式</span>
          </li>
          <li className="flex gap-2">
            <span className="text-accent-600">·</span>
            <span>勾选《家属授权书》，确认信息真实并授权公开展示</span>
          </li>
        </ul>
        <p className="mt-3 text-xs leading-6 text-brand-500">
          提交后将进入人工审核队列，平台核验家属授权与权威来源后决定是否上线，
          数个工作日内完成。本板块纯公益、永久免费，无任何付费引导。
        </p>
      </div>

      <ApplyForm />

      <div className="mt-6 text-center text-sm">
        <Link href="/memorial" className="text-brand-500 hover:text-accent-600">
          ← 返回公益纪念堂
        </Link>
      </div>
    </div>
  );
}
