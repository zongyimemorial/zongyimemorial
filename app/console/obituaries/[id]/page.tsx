import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import ObituaryForm from "@/components/console/ObituaryForm";
import ObituaryManageBar from "@/components/console/ObituaryManageBar";
import { updateObituary } from "../actions";

export const metadata = { title: "管理电子讣告" };

/** Date → <input type="date"> 需要的 "YYYY-MM-DD" */
function dateInput(d: Date | null): string | null {
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function ManageObituaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const obituary = await prisma.obituary.findUnique({ where: { id } });
  if (!obituary) notFound();
  if (obituary.ownerUserId !== user.id) notFound();

  const halls = await prisma.memorialHall.findMany({
    where: { ownerUserId: user.id!, status: "active" },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, deceasedName: true },
  });

  return (
    <div className="container-page max-w-2xl py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-brand-900">管理讣告 · {obituary.deceasedName}</h1>
        <Link href="/console/obituaries" className="text-sm text-brand-500 hover:text-accent-600">
          ← 返回我的讣告
        </Link>
      </div>

      <ObituaryManageBar
        obituaryId={obituary.id}
        status={obituary.status}
        publicHref={`/obituary/${obituary.id}`}
      />

      <ObituaryForm
        obituary={{
          id: obituary.id,
          deceasedName: obituary.deceasedName,
          birthDate: dateInput(obituary.birthDate),
          deathDate: dateInput(obituary.deathDate),
          biography: obituary.biography,
          funeralInfo: obituary.funeralInfo,
          contactInfo: obituary.contactInfo,
          hallId: obituary.hallId,
          isPublic: obituary.isPublic,
          allowMessages: obituary.allowMessages,
          hasPassword: !!obituary.passwordHash,
        }}
        halls={halls}
        action={updateObituary}
      />
    </div>
  );
}
