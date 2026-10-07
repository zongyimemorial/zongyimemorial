import { NextResponse } from "next/server";
import { answerFaq } from "@/lib/customerService";

export async function POST(req: Request) {
  let query = "";
  try {
    const body = await req.json();
    query = String(body?.query || "");
  } catch {
    query = "";
  }

  if (!query.trim()) {
    return NextResponse.json(
      { answer: "请输入您的问题。", source: "fallback" },
      { status: 400 }
    );
  }

  const res = answerFaq(query);
  return NextResponse.json(res);
}
