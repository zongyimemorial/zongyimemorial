#!/usr/bin/env bash
# 全量回归：按扩展名选运行器（.mjs → node，.mts → npx tsx）
#
# 两个必须绕开的坑（见 AGENTS.md）：
#   1. 汇总行有三种格式，且失败标记有两种（❌ / FAIL）——
#      只匹配一种会显示"未产出结果且失败=0"，看着像通过其实没测。
#   2. verify-public-login 打的是**公网隧道**，会被 localhost.run 免费版的
#      边缘 503 打红。这不是代码问题，故单列并标注为"公网噪声"。
cd /workspace || exit 1

MJS="verify-p0-growth verify-offering-panel verify-product-pricing verify-clan verify-clan-e2e verify-hall-niche verify-hall-niche-noportrait verify-home-button verify-admin-review verify-clan-tribute-e2e verify-poem-stock-gray verify-memorial-tribute-mask verify-whisper-console verify-whispers-e2e verify-whisper-guide verify-console verify-decor-3d verify-decor-draft-save verify-decor-pricing-v2 verify-decor-prop3d verify-decor-public-v2 verify-decor-scene-engine verify-decor-skin verify-decor-studio-v2 verify-decor-studio-v3 verify-guides verify-portrait-unify verify-premium-unify verify-mobile verify-community verify-clan-activities verify-decor-suites verify-section-order verify-share verify-brand-palette verify-auth-security verify-obituary verify-service-fulfillment verify-hall-review verify-single-source verify-password-eye verify-live-guide verify-live-admin verify-lottie"
MTS="verify-clan-tribute smoke-clan-tribute verify-whisper-compliance verify-whisper-billing verify-whisper-ethics verify-whisper-delete verify-whisper-mood verify-whisper-history verify-compliance-v2 verify-decor-ornaments verify-lease verify-storage"
# 公网隧道套件：503 属已知噪声，仅提示、不计入红绿
PUBLIC="verify-public-login"

# 汇总行：三种格式通吃；失败标记：两种都数
PAT='通过 [0-9]+/[0-9]+|结果: [0-9]+/[0-9]+ 通过|[0-9]+/[0-9]+ PASS'
RED=()

run_one() {
  local file="$1" runner="$2"
  local out line fails
  # .mts 必须走 npx tsx（node 会抛 ERR_UNKNOWN_FILE_EXTENSION）。
  # npx 首次解析包时会把 "npm notice" 之类混进 stderr，且 tsx 的退出码
  # 在管道里偶尔被吞 —— 所以这里**不靠退出码**，只认汇总行 + 失败标记。
  #
  # 重试一次：17 个套件顺序跑，浏览器/端口资源紧张时偶发整套"没跑出汇总行"。
  # 那种情况与"真的崩了"在汇总里长得一样，直接判红会误报；重试一次成本很低。
  local attempt
  for attempt in 1 2; do
    if [ "$runner" = "tsx" ]; then
      out=$(npx tsx "$file" 2>&1)
    else
      out=$(node "$file" 2>&1)
    fi
    line=$(printf '%s\n' "$out" | grep -oE "$PAT" | tail -1)
    [ -n "$line" ] && break
    [ "$attempt" = "1" ] && sleep 3
  done
  fails=$(printf '%s\n' "$out" | grep -cE "❌|FAIL")
  printf '%-34s %s  失败=%s\n' "$(basename "$file" | sed 's/\.[^.]*$//')" "${line:-（未产出结果）}" "$fails"
  if [ -z "$line" ] || [ "$fails" != "0" ]; then RED+=("$(basename "$file")"); fi
}

for s in $MJS; do run_one "scripts/$s.mjs" node; done
for s in $MTS; do run_one "scripts/$s.mts" tsx; done

echo "──────────────────────────────────────────────"
# 已知缺陷白名单：这些套件的红是"产品缺陷被如实暴露"，不是代码坏了。
# ⚠️ 不要图省事把它们从列表里删掉 —— 删掉就再也看不见了。
#    当前暂无长期已知缺陷白名单条目（电子讣告的兑换上限缺陷已于 2026-10 后修复，
#    verify-obituary 已全绿，已从白名单移除）。
KNOWN_RED=""
if [ ${#RED[@]} -eq 0 ]; then
  echo "全绿 ✅"
else
  rest=()
  known=()
  for f in "${RED[@]}"; do
    base=$(echo "$f" | sed 's/\.[^.]*$//')
    if [ "$base" = "$KNOWN_RED" ]; then known+=("$f"); else rest+=("$f"); fi
  done
  if [ ${#known[@]} -gt 0 ]; then
    echo "已知缺陷（如实标红，非回归）: ${known[*]}"
  fi
  if [ ${#rest[@]} -eq 0 ]; then
    echo "全绿 ✅（除上述已知缺陷）"
  else
    echo "变红 ❌: ${rest[*]}"
  fi
fi

# 公网链路单独跑：结果仅供参考（免费隧道 30–50% 边缘 503）
echo "── 公网隧道（已知噪声，不计入判定）──"
for s in $PUBLIC; do
  out=$(node "scripts/$s.mjs" 2>&1)
  printf '%s\n' "$out" | grep -oE "$PAT" | tail -1 | sed "s/^/  $s: /"
done
