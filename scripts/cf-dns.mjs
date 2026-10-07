// 用 Cloudflare API 为 zongyitang.com 添加 localhost.run 所需的 DNS 记录
// 用法: CLOUDFLARE_API_TOKEN=xxx node scripts/cf-dns.mjs
// 前置: 域名 NS 已指向 Cloudflare 且 Cloudflare 显示 Active
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ZONE = "zongyitang.com";
const LHR_ID = "2cc4c61d-b365-4bdc-993f-9638e9a7070b"; // localhost.run 域名验证 ID
const API = "https://api.cloudflare.com/client/v4";

if (!TOKEN) {
  console.error("缺少环境变量 CLOUDFLARE_API_TOKEN");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  "Content-Type": "application/json",
};

async function getZoneId() {
  const r = await fetch(`${API}/zones?name=${ZONE}`, { headers });
  const j = await r.json();
  if (!j.success || !j.result.length) {
    throw new Error("找不到域名 " + ZONE + " : " + JSON.stringify(j.errors));
  }
  return j.result[0].id;
}

async function listRecords(zoneId) {
  const r = await fetch(`${API}/zones/${zoneId}/dns_records`, { headers });
  const j = await r.json();
  return j.result || [];
}

async function createRecord(zoneId, body) {
  const r = await fetch(`${API}/zones/${zoneId}/dns_records`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!j.success) throw new Error("创建失败: " + JSON.stringify(j.errors));
  return j.result;
}

async function upsert(zoneId, type, name, content) {
  const existing = await listRecords(zoneId);
  const hit = existing.find(
    (x) => x.type === type && x.name === name && x.content === content
  );
  if (hit) {
    console.log(`已存在,跳过: ${type} ${name} -> ${content}`);
    return hit;
  }
  // 同名但内容不同的记录先不删,仅新增(避免误伤).若需更新可手动
  return await createRecord(zoneId, {
    type,
    name,
    content,
    ttl: 1, // 1 = Automatic
    proxied: false, // 必须 DNS-only,否则 localhost.run 无法正常签发证书
  });
}

(async () => {
  const zoneId = await getZoneId();
  console.log("zoneId:", zoneId);

  // 1) 验证 TXT
  await upsert(zoneId, "TXT", `_lhr.${ZONE}`, LHR_ID);
  // 2) 根域名 CNAME 到 cd.localhost.run (Cloudflare 会自动 CNAME 扁平化)
  await upsert(zoneId, "CNAME", ZONE, "cd.localhost.run");
  // 3) www 也指过去(可选但推荐)
  await upsert(zoneId, "CNAME", `www.${ZONE}`, "cd.localhost.run");

  console.log("\n=== 当前记录 ===");
  const all = await listRecords(zoneId);
  for (const r of all) {
    console.log(`  ${r.type}\t${r.name}\t-> ${r.content}\t(proxied=${r.proxied})`);
  }
  console.log("\n完成。下一步: 重启隧道让 localhost.run 校验 TXT。");
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
