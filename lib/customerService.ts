export interface FaqAnswer {
  answer: string;
  source: "rule" | "fallback";
}

interface Rule {
  keywords: string[];
  answer: string;
}

// 内测：本地规则引擎，零外部依赖。公网阶段替换为 Coze/Dify 真实 bot（见 cozeAnswer 占位）。
const RULES: Rule[] = [
  {
    keywords: ["纪念馆", "建馆", "创建纪念", "数字纪念馆", "开通纪念"],
    answer:
      "开通数字纪念馆：进入「虚拟祭品商城」选择「数字纪念馆」商品 → 下单（内测使用 SIMULATE 模拟支付）→ 支付成功后系统自动开通纪念馆，可在「我的控制台」查看与管理。",
  },
  {
    keywords: ["支付", "付款", "怎么付", "simulate", "模拟支付", "扫码"],
    answer:
      "内测阶段统一使用 SIMULATE 模拟支付：下单后在支付页点击「模拟支付成功」即可完成交易闭环，无需真实微信/支付宝，也不触发任何支付类目资质。",
  },
  {
    keywords: ["实名", "认证", "身份证", "实名认证"],
    answer:
      "建议完成实名认证：进入「我的控制台 → 实名认证」，填写姓名、证件号与手机号，验证码为内测演示（见页面提示），提交后证件号以 AES-256 加密入库并进入人工审核队列。",
  },
  {
    keywords: ["直播", "live", "什么时候直播", "回放"],
    answer:
      "直播为内测版：使用本地/文件模拟流，不接云直播。可在「直播」栏目查看预告与回放，字幕为占位接入点，真实字幕（Gemini/GPT-4o）在公开阶段接入。",
  },
  {
    keywords: ["实体", "发货", "物流", "退换", "退货", "寄送"],
    answer:
      "实体祭祀用品走同一套订单体系：下单填写收货地址 → SIMULATE 支付 → 后台「订单管理」标记发货。内测暂不开放真实退换货，公网阶段补售后流程。",
  },
  {
    keywords: ["退款", "退费", "退钱"],
    answer:
      "内测使用模拟支付，不发生真实资金流动，故无需退款。公开阶段接入真实支付后支持退款，订单状态机已包含 refunded。",
  },
  {
    keywords: ["联系方式", "客服", "电话", "邮箱", "人工"],
    answer:
      "这是内测智能客服（本地规则引擎，零外部依赖）。如需人工，请邮件至 support@example.com 或于工作时段联系运营。",
  },
  {
    keywords: ["账号", "登录", "注册", "密码", "演示"],
    answer:
      "可用邮箱/手机号 + 密码注册登录；演示账号：admin@test.com / admin123456，user@test.com / user123456。",
  },
];

export function answerFaq(query: string): FaqAnswer {
  const q = (query || "").toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some((k) => q.includes(k.toLowerCase()))) {
      return { answer: rule.answer, source: "rule" };
    }
  }
  return {
    answer:
      "抱歉，这个问题我暂时答不上来（内测客服为本地规则引擎）。您可以换个说法，或邮件联系 support@example.com。公开阶段将接入 Coze/Dify 智能客服。",
    source: "fallback",
  };
}

/** 公开阶段接入 Coze/Dify 真实 bot 的占位适配器（内测未启用） */
export async function cozeAnswer(_query: string): Promise<FaqAnswer> {
  throw new Error("Coze/Dify 未接入（内测阶段仅使用本地规则客服）");
}
