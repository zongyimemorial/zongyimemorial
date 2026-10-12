import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import ActivityEditor from "@/components/admin/ActivityEditor";

export default async function NewActivityPage() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "editor" && user.role !== "super_admin")) redirect("/console");

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-brand-900">新建宗族活动</h1>
      <ActivityEditor />
    </div>
  );
}
