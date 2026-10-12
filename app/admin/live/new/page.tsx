import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createLive } from "@/app/admin/live/actions";
import LiveForm from "@/components/admin/LiveForm";

export default async function NewLivePage() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "editor" && user.role !== "super_admin")) redirect("/console");

  return (
    <div className="max-w-xl">
      <h1 className="mb-1 text-2xl font-semibold text-brand-900">新建直播</h1>
      <p className="mb-6 text-sm text-brand-500">
        直播由平台承载，本平台只负责嵌入展示。建议先建成「预告」，当天再改为「直播中」。
      </p>
      <LiveForm action={createLive} submitLabel="创建" />
    </div>
  );
}
