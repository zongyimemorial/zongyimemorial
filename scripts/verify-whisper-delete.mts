/**
 * 改造 B2 验收：数据删除权（《个人信息保护法》第 47 条）
 *
 * 验证：
 *   1. 级联删除：删 profile 后，声线/授权/会话/消息全部消失
 *   2. 文件层删除：whispers/<profileId>/ 整棵目录被清掉
 *   3. 路径穿越防护：非法 profileId 被拒
 *   4. 越权防护：源码断言仅 owner 可删
 *   5. 审计留痕：删除动作写日志
 *
 * 做法：构造一个一次性 profile（不碰演示数据），删完即验。
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { promises as fs } from "fs";

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
// 1. 路径穿越防护（纯函数，先测，不需数据）
// ============================================================
{
  const { removeWhisperProfileDir } = await import("@/lib/upload");

  for (const bad of ["../etc", "../../../root", "abc/../../x", "ABC-123", "abc def", "abc_def", ""]) {
    const r = await removeWhisperProfileDir(bad);
    check(`防穿越·拒绝非法 id「${bad}」`, r.removed === false && r.bytes === 0);
  }

  // 合法但不存在的 id：应返回 removed=false 且不抛错
  const r = await removeWhisperProfileDir("nonexistent-profile-xyz");
  check("合法 id·目录不存在时不抛错", r.removed === false, JSON.stringify(r));
}

// ============================================================
// 2. 构造带全量子表的临时装置，验证级联
// ============================================================
const owner = await prisma.user.findFirst({ where: { role: "user" } });
if (!owner) throw new Error("无 user 角色账号");

// WhisperProfile.hallId 是 @unique（一馆一装置），故本脚本自建一座一次性纪念馆。
// 删 profile 后一并把这座馆也删掉，不留垃圾。
const tempHall = await prisma.memorialHall.create({
  data: {
    ownerUserId: owner.id,
    name: `删除验收馆-${Date.now()}`,
    deceasedName: "删除验收逝者",
    status: "active",
  },
});

const temp = await prisma.whisperProfile.create({
  data: {
    ownerUserId: owner.id,
    hallId: tempHall.id,
    personaName: `删除验收-${Date.now()}`,
    personTitle: "测试",
    mode: "voice",
  },
});

const voice = await prisma.whisperVoice.create({
  data: { profileId: temp.id, name: "验收声线", provider: "mock", isPreset: false, sampleUrl: null },
});
await prisma.whisperConsent.create({
  data: {
    profileId: temp.id,
    applicantName: "验收用户",
    applicantIdNo: "enc:verify",
    relation: "子女",
    otherHeirsAck: true,
  },
});
const session = await prisma.whisperSession.create({
  data: { profileId: temp.id, userId: owner.id, mode: "voice", mood: "missing" },
});
await prisma.whisperMessage.create({
  data: { sessionId: session.id, role: "user", text: "验收消息" },
});

check("构造被子表齐全（声线/授权/会话/消息）", true, `profile=${temp.id}`);

// 造一个磁盘目录，验证文件层删除
const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");
const dir = path.join(UPLOAD_ROOT, "whispers", temp.id);
await fs.mkdir(path.join(dir, "tts", "2026-01"), { recursive: true });
await fs.writeFile(path.join(dir, "sample.wav"), Buffer.alloc(2048));
await fs.writeFile(path.join(dir, "tts", "2026-01", "reply.mp3"), Buffer.alloc(4096));
check("构造样本目录（含嵌套 tts）", existsSync(dir) && existsSync(path.join(dir, "tts", "2026-01", "reply.mp3")));

// ---------- 级联删除 ----------
await prisma.whisperProfile.delete({ where: { id: temp.id } });
await prisma.memorialHall.delete({ where: { id: tempHall.id } });

const gone = {
  profile: await prisma.whisperProfile.findUnique({ where: { id: temp.id } }),
  voice: await prisma.whisperVoice.findUnique({ where: { id: voice.id } }),
  consent: await prisma.whisperConsent.findUnique({ where: { profileId: temp.id } }),
  session: await prisma.whisperSession.findUnique({ where: { id: session.id } }),
  messages: await prisma.whisperMessage.count({ where: { sessionId: session.id } }),
};

check("级联·profile 已删", gone.profile === null);
check("级联·声线已删", gone.voice === null);
check("级联·授权记录已删", gone.consent === null);
check("级联·会话已删", gone.session === null);
check("级联·消息已删", gone.messages === 0, `剩 ${gone.messages} 条`);

// ---------- 文件层删除 ----------
{
  const { removeWhisperProfileDir } = await import("@/lib/upload");
  const r = await removeWhisperProfileDir(temp.id);
  check("文件层·整棵目录已移除", r.removed === true && r.bytes > 0, `回收 ${r.bytes} 字节`);
  check("文件层·目录确实不存在", !existsSync(dir));
}

// ============================================================
// 3. 源码断言：越权防护 + 审计留痕
// ============================================================
{
  const src = readFileSync("app/console/whispers/[id]/actions.ts", "utf8");
  check("源码·导出 deleteProfile", src.includes("export async function deleteProfile"));
  check("源码·仅 owner 可删", src.includes("profile.ownerUserId !== user.id"));
  check("源码·删除前写审计日志", src.indexOf("whisper_delete:") < src.indexOf("whisperProfile.delete"));
  check("源码·删文件用 removeWhisperProfileDir", src.includes("removeWhisperProfileDir(id)"));
  check("源码·删除后重定向", src.includes('redirect("/console?whisperDeleted=1")'));

  const comp = readFileSync("components/whisper/DangerZone.tsx", "utf8");
  check("UI·二次确认（输入名称）", comp.includes("matched") && comp.includes("personaName"));
  check("UI·明确告知不可逆", comp.includes("不可撤销") || comp.includes("无法找回"));
  check("UI·引用 PIPL 第 47 条", comp.includes("第 47 条"));
}

// ============================================================
// 4. 上传工具源码断言
// ============================================================
{
  const src = readFileSync("lib/upload.ts", "utf8");
  check("upload·导出 removeWhisperProfileDir", src.includes("export async function removeWhisperProfileDir"));
  check("upload·profileId 白名单校验", src.includes("PROFILE_ID_RE"));
  check("upload·二次防穿越", src.includes("dir.startsWith(base + path.sep)"));
}

console.log(`\n数据删除权验收：通过 ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
