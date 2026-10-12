/**
 * 改造 C1 验收：对话历史回顾页
 *
 * 验证：
 *   1. 列表查询按 (profileId, userId) 过滤 → 看不到别人的会话
 *   2. 详情查询三重过滤 → 越权返回 null
 *   3. 会话摘要字段完整（mood / preview / messageCount / minutesUsed）
 *   4. 情绪聚合 moodTrend 统计正确
 *   5. 页面源码断言：权限说明、求助提示条件、AI 标识保留
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { listSessions, loadSession, moodTrend, loadProfile } from "@/lib/whisper-service";

const prisma = new PrismaClient();

let pass = 0,
  fail = 0;
function check(name: string, ok: boolean, extra = "") {
  if (ok) {
    pass++;
    console.log(`PASS  ${name}  ${extra}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}  ${extra}`);
  }
}

// ============================================================
// 构造：一座一次性馆 + 装置 + 两个用户各自的会话
// ============================================================
const owner = await prisma.user.findFirst({ where: { role: "user" } });
if (!owner) throw new Error("无 user 角色账号");

// 找第二个用户，用于越权测试
const other = await prisma.user.findFirst({ where: { id: { not: owner.id } } });
if (!other) throw new Error("需要至少两个用户才能验证越权防护");

const tempHall = await prisma.memorialHall.create({
  data: { ownerUserId: owner.id, name: `回顾验收馆-${Date.now()}`, deceasedName: "回顾测试", status: "active" },
});
const prof = await prisma.whisperProfile.create({
  data: { ownerUserId: owner.id, hallId: tempHall.id, personaName: "回顾测试先生", mode: "voice" },
});

// owner 的三个会话（3 次关切情绪，触发温和提示条件）
const mkSession = (userId: string, mood: string | null, minutes: number, rounds: number, texts: string[]) =>
  prisma.whisperSession
    .create({
      data: { profileId: prof.id, userId, mode: "voice", mood, minutesUsed: minutes, roundsUsed: rounds },
    })
    .then(async (s) => {
      for (const [i, t] of texts.entries()) {
        await prisma.whisperMessage.create({
          data: {
            sessionId: s.id,
            role: i % 2 === 0 ? "user" : "assistant",
            text: t,
            aiGenerated: i % 2 === 1,
            aiLabel: i % 2 === 1 ? "AI 生成 · mock-llm · 2026-10-10T00:00:00Z" : null,
          },
        });
      }
      return s;
    });

await mkSession(owner.id, "grief", 12, 6, ["爸，我来看你了", "我知道，你慢慢说"]);
await mkSession(owner.id, "guilty", 8, 4, ["最近没能常回来看你，对不起", "别这么说"]);
await mkSession(owner.id, "grief", 5, 3, ["我今天有点撑不住", "我在"]);
await mkSession(owner.id, "joyous", 6, 3, ["妈，我升职了！", "好啊，真好"]);
const sOther = await mkSession(other.id, "calm", 3, 2, ["这是另一个用户的私密对话", "只有他能看到"]);

const loaded = await loadProfile(prof.id);
check("装置构造成功", !!loaded);

// ============================================================
// 1. 列表过滤
// ============================================================
{
  const mine = await listSessions(prof.id, owner.id);
  check("列表·仅返回本人会话", mine.length === 4, `实得 ${mine.length}`);
  check(
    "列表·不含他人会话",
    !mine.some((s) => s.id === sOther.id),
  );
  check("列表·按时间倒序", mine[0].createdAt >= mine[mine.length - 1].createdAt);

  const otherList = await listSessions(prof.id, other.id);
  check("他人视角·只看到自己的 1 条", otherList.length === 1, `实得 ${otherList.length}`);

  const s = mine.find((x) => x.mood === "joyous")!;
  check("摘要·mood 字段", s.mood === "joyous");
  check("摘要·messageCount", s.messageCount === 2, `实得 ${s.messageCount}`);
  check("摘要·minutesUsed", s.minutesUsed === 6);
  check("摘要·preview 非空", !!s.preview);
  check("摘要·preview 已截断", (s.preview ?? "").length <= 60);
}

// ============================================================
// 2. 详情越权
// ============================================================
{
  const mineSessions = await listSessions(prof.id, owner.id);
  const target = mineSessions[0].id;

  const mine = await loadSession(prof.id, owner.id, target);
  check("详情·本人可读", !!mine && mine.messages.length > 0);

  const steal = await loadSession(prof.id, other.id, target);
  check("详情·越权返回 null（不区分不存在/无权限）", steal === null);

  const byOther = await loadSession(prof.id, owner.id, sOther.id);
  check("详情·馆主也读不到他人会话", byOther === null);

  const wrongProfile = await loadSession("nonexistent-profile", owner.id, target);
  check("详情·装置不匹配返回 null", wrongProfile === null);

  check("详情·消息含 AI 标识字段", mine!.messages.some((m) => m.aiGenerated && m.aiLabel));
}

// ============================================================
// 3. 情绪聚合
// ============================================================
{
  const t = await moodTrend(prof.id, owner.id);
  check("聚合·总次数 = 4", t.total === 4, `实得 ${t.total}`);
  const grief = t.buckets.find((b) => b.mood === "grief");
  check("聚合·grief 计 2 次", grief?.count === 2, `实得 ${grief?.count}`);
  check("聚合·按次数降序", t.buckets[0].count >= t.buckets[t.buckets.length - 1].count);

  const tOther = await moodTrend(prof.id, other.id);
  check("聚合·他人视角只看自己的", tOther.total === 1, `实得 ${tOther.total}`);
}

// ============================================================
// 4. 源码断言
// ============================================================
{
  const list = readFileSync("app/(public)/whispers/[hallId]/history/page.tsx", "utf8");
  check("页面·仅本人可见说明", list.includes("只有你自己能看到"));
  check("页面·家人也看不到", list.includes("也看不到你的对话"));
  check("页面·温和求助提示条件", list.includes("concerningCount >= 3"));
  check("页面·含 12356 热线", list.includes("12356"));
  check("页面·AI 告知条", list.includes("AiDisclosureBar"));
  check("页面·不展示比率数字（只给提示）", !list.includes("concerningCount /") && !list.includes("%"));

  const detail = readFileSync("app/(public)/whispers/[hallId]/history/[sessionId]/page.tsx", "utf8");
  check("详情·越权即 404", detail.includes("if (!session) notFound()"));
  check("详情·保留 AI 标识", detail.includes("m.aiLabel"));
  check("详情·危机记录提示", detail.includes("hasCrisis"));

  const svc = readFileSync("lib/whisper-service.ts", "utf8");
  check("服务层·listSessions 按 userId 过滤", svc.includes("where: { profileId, userId }"));
  check("服务层·loadSession 三重过滤", svc.includes("where: { id: sessionId, profileId, userId }"));
}

// ============================================================
// 清理
// ============================================================
await prisma.whisperProfile.delete({ where: { id: prof.id } });
await prisma.memorialHall.delete({ where: { id: tempHall.id } });

console.log(`\n对话历史回顾验收：通过 ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
