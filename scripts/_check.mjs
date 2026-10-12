/*
  scripts/_check.mjs —— 验收断言的统一计数与「前置条件不足」表达

  为什么需要它：
  原先各脚本自己写 `check(name, ok, extra)`，只记录 pass/fail 两态。
  于是一旦遇到"这一项**没条件测**"（馆里没遗像、库里没配 3D 模板的宗祠、
  某商品已下架……），脚本只能二选一：
    · 硬断言 → 报红，但**红得没有信息量**（功能没坏，只是没数据）；
    · 直接 return → 静默消失，报告里看不出"这一项没测"。

  实测后果：`verify-portrait-unify` 打印「通过 21/27」，那 6 条红全在说
  "可能又写回 findTemplate 了"，而真相是**筛选条件压根没匹配到可测的宗祠**
  —— 排查方向被误导，且分母把"没测"当成"失败"，让整份报告的红灯失去信号价值。

  本模块把三态分清：
    pass  真正验证通过
    fail  真的不符合预期（必须红）
    skip  前置条件不满足，**没测**（不计入失败，但单独列出，防止"假装测过"）

  用法：
    import { makeChecks } from "./_check.mjs";
    const { check, skip, summary } = makeChecks();

    if (!hall) skip("宗祠 3D 渲染", "库里没有配了 3D 模板的宗祠");
    else check("宗祠 3D 渲染", has3d);

    summary("verify-portrait-unify");
*/

export function makeChecks() {
  const results = [];
  const noColor = process.env.NO_COLOR || !process.stdout.isTTY;

  const paint = (s, code) => (noColor ? s : `\u001b[${code}m${s}\u001b[0m`);

  /** 真断言：不符合预期就是失败 */
  const check = (name, ok, extra = "") => {
    const line = { name, state: ok ? "pass" : "fail", extra: String(extra).slice(0, 200).replace(/\n/g, " ") };
    results.push(line);
    console.log(
      `${ok ? paint("✅", 32) : paint("❌", 31)} ${name}${line.extra ? `  — ${line.extra}` : ""}`,
    );
    return !!ok;
  };

  /**
   * 前置条件不满足 → **没测**，不是失败。
   * 必须写明原因，否则就是"假装测过"（比报红更危险）。
   */
  const skip = (name, reason) => {
    const line = { name, state: "skip", extra: String(reason).slice(0, 200).replace(/\n/g, " ") };
    results.push(line);
    console.log(`${paint("⏭ ", 33)} ${name}  — 跳过：${reason}`);
    return true;
  };

  /**
   * 输出汇总。**分母不含 skip** —— 这样"红"才真的代表有问题。
   * 同时打印被跳过的项，避免静默漏测。
   */
  const summary = (title = "验收") => {
    const pass = results.filter((r) => r.state === "pass").length;
    const fail = results.filter((r) => r.state === "fail").length;
    const skipped = results.filter((r) => r.state === "skip").length;
    const total = pass + fail; // 分母刻意排除 skip

    console.log(`\n${"=".repeat(60)}`);
    const head = `${title}: ${pass}/${total} 通过`;
    console.log(fail === 0 ? paint(head, 32) : paint(head, 31));
    if (skipped > 0) {
      console.log(paint(`⏭  ${skipped} 项因前置条件不足被跳过（未计入分母）`, 33));
      for (const r of results.filter((x) => x.state === "skip")) {
        console.log(`     · ${r.name} — ${r.extra}`);
      }
    }
    if (fail > 0) {
      console.log(paint("❌ 失败项：", 31));
      for (const r of results.filter((x) => x.state === "fail")) {
        console.log(`     · ${r.name}${r.extra ? `  — ${r.extra}` : ""}`);
      }
    }
    return { pass, fail, skipped, total };
  };

  /** 供需要额外逻辑的脚本读取原始结果 */
  const all = () => results;

  return { check, skip, summary, all };
}
