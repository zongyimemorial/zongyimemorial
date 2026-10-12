import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import ActivityEditor from "@/components/admin/ActivityEditor";

export default async function EditActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "editor" && user.role !== "super_admin")) redirect("/console");

  const { id } = await params;
  const activity = await prisma.clanActivity.findUnique({ where: { id } });
  if (!activity) notFound();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-brand-900">编辑宗族活动</h1>
      <ActivityEditor
        activity={{
          id: activity.id,
          title: activity.title,
          kind: activity.kind,
          surname: activity.surname,
          location: activity.location,
          onlineLink: activity.onlineLink,
          coverImage: activity.coverImage,
          description: activity.description,
          startAt: activity.startAt,
          capacity: activity.capacity,
          reviewStatus: activity.reviewStatus,
        }}
      />
    </div>
  );
}
