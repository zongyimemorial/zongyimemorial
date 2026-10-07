import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { generateArticleDraft } from "@/lib/ai";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "editor")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  let topic = "";
  try {
    const body = await req.json();
    topic = String(body?.topic || "");
  } catch {
    /* ignore */
  }
  if (!topic.trim()) {
    return NextResponse.json({ error: "topic required" }, { status: 400 });
  }
  const draft = await generateArticleDraft(topic);
  return NextResponse.json(draft);
}
