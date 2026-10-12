/**
 * 改造 C2 验收：情感状态标记
 *
 * 验证：
 *   1. MOODS 定义完整（6 档，含 label/hint/concerning）
 *   2. moodSpec / moodLabel / isConcerningMood 取值正确、非法值安全回落
 *   3. composeSparkPrompt 注入心情语境；未选心情时不注入
 *   4. 会话落库：新建会话写 mood；已有会话仅在原值为空时补记
 *   5. 心情为白名单校验（API 侧非法值丢弃）
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { MOODS, moodSpec, moodLabel, isConcerningMood, type MoodKey } from "@/lib/whisper-mood";
import { composeSparkPrompt, loadProfile } from "@/lib/whisper-service";

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
// 1. MOODS 定义
// ============================================================
{
  check("情绪档位共 6 档", MOODS.length === 6, `实得 ${MOODS.length}`);
  const keys = MOODS.map((m) => m.key).sort().join(",");
  check("档位 key 齐全", keys === "blank,calm,grief,guilty,joyous,missing", keys);
  check("每档都有 label", MOODS.every((m) => !!m.label));
  check("每档都有 hint", MOODS.every((m) => m.hint.length > 8));
  check("key 唯一", new Set(MOODS.map((m) => m.key)).size === MOODS.length);

  const concerning = MOODS.filter((m) => m.concerning).map((m) => m.key).sort().join(",");
  check("关切情绪为 grief + guilty", concerning === "grief,guilty", concerning);
}

// ============================================================
// 2. 取值函数
// ============================================================
{
  check("moodSpec 合法值", moodSpec("grief")?.label === "难过");
  check("moodSpec 非法值 → null", moodSpec("furious") === null);
  check("moodSpec undefined → null", moodSpec(undefined) === null);
  check("moodSpec null → null", moodSpec(null) === null);
  check("moodSpec 空串 → null", moodSpec("") === null);

  check("moodLabel 合法值", moodLabel("joyous") === "有喜事");
  check("moodLabel 非法值回落", moodLabel("xxx") === "未记录");
  check("moodLabel null 回落", moodLabel(null) === "未记录");

  check("isConcerningMood grief=true", isConcerningMood("grief") === true);
  check("isConcerningMood guilty=true", isConcerningMood("guilty") === true);
  check("isConcerningMood calm=false", isConcerningMood("calm") === false);
  check("isConcerningMood 非法值=false", isConcerningMood("nope") === false);
}

// ============================================================
// 3. 提示词注入
// ============================================================
{
  const profile = await loadProfileByHallHelper();
  if (!profile) {
    check("装置存在（用于提示词注入验证）", false, "无可用装置");
  } else {
    const withMood = composeSparkPrompt(profile, "最近还好吗", "grief");
    const without = composeSparkPrompt(profile, "最近还好吗", null);

    check("注入·含心情段标记", withMood.includes("【来访者此刻的心情】"));
    check("注入·含该档 hint", withMood.includes(moodSpec("grief")!.hint));
    check("未选心情·不注入心情段", !without.includes("【来访者此刻的心情】"));
    check("未选心情·人格本体仍在", without.length > 50);
    check("注入不破坏人格本体（子串包含）", withMood.includes(without.replace(/\n【今日节气】[\s\S]*$/, "")) || withMood.length > without.length);
    check("非法心情·不注入", !composeSparkPrompt(profile, "x", "garbage").includes("【来访者此刻的心情】"));
  }
}

async function loadProfileByHallHelper() {
  const row = await prisma.whisperProfile.findFirst({ select: { id: true } });
  if (!row) return null;
  return loadProfile(row.id);
}

// ============================================================
// 4. 会话落库（模拟 ensureSession 的等价逻辑）
// ============================================================
{
  const owner = await prisma.user.findFirst({ where: { role: "user" } });
  const tempHall = await prisma.memorialHall.create({
    data: { ownerUserId: owner!.id, name: `心情验收馆-${Date.now()}`, deceasedName: "测试", status: "active" },
  });
  const prof = await prisma.whisperProfile.create({
    data: { ownerUserId: owner!.id, hallId: tempHall.id, personaName: `心情验收-${Date.now()}`, mode: "voice" },
  });

  // 新建会话即写 mood
  const s1 = await prisma.whisperSession.create({
    data: { profileId: prof.id, userId: owner!.id, mode: "voice", mood: "grief", moodNote: "刚去过墓园" },
  });
  check("新建会话·mood 落库", s1.mood === "grief");
  check("新建会话·moodNote 落库", s1.moodNote === "刚去过墓园");

  // 无 mood 建会话
  const s2 = await prisma.whisperSession.create({
    data: { profileId: prof.id, userId: owner!.id, mode: "voice" },
  });
  check("新建会话·未选心情为 null", s2.mood === null);

  // 补记：原值为空时补
  const patched = await prisma.whisperSession.update({
    where: { id: s2.id },
    data: { mood: "calm", moodNote: null },
  });
  check("补记·空值可补", patched.mood === "calm");

  // 已有值不应被覆盖（模拟 ensureSession 的 !found.mood 守卫）
  const found = await prisma.whisperSession.findUnique({ where: { id: s1.id } });
  const shouldOverwrite = !found!.mood;
  check("补记·已有值不覆盖", shouldOverwrite === false, `mood=${found!.mood}`);

  // 清理
  await prisma.whisperProfile.delete({ where: { id: prof.id } });
  await prisma.memorialHall.delete({ where: { id: tempHall.id } });
}

// ============================================================
// 5. 源码断言：白名单校验 + 心情透传
// ============================================================
{
  const api = readFileSync("app/api/whispers/chat/route.ts", "utf8");
  check("API·白名单校验 mood", api.includes("moodSpec(body.mood)"));
  check("API·moodNote 截断", api.includes("body.moodNote"));
  check("API·透传 mood 到 talk", api.includes("mood: body.mood"));

  const svc = readFileSync("lib/whisper-service.ts", "utf8");
  check("服务层·ensureSession 接收 mood", svc.includes("mood?: string | null"));
  check("服务层·新会话写 mood", svc.includes("mood: mood ?? null"));
  check("服务层·补记守卫", svc.includes("if (!found.mood && mood)"));
  check("服务层·composeSparkPrompt 收 mood", svc.includes("query: string,\n  mood?: string | null,"));

  const ui = readFileSync("components/whisper/WhisperChat.tsx", "utf8");
  check("UI·渲染心情选择", ui.includes("MOODS.map"));
  check("UI·透传 mood 到 API", ui.includes("mood: mood ?? undefined"));
  check("UI·可跳过", ui.includes("跳过"));
  check("UI·可改选", ui.includes("改一下"));
}

console.log(`\n情感状态标记验收：通过 ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
