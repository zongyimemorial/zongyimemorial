export interface ArticleDraft {
  title: string;
  summary: string;
  body: string;
  seoTitle: string;
  seoKeywords: string;
  seoDescription: string;
}

/**
 * 新闻草稿生成。优先调用 DeepSeek；未配置 API Key（内测）时返回模板草稿，不阻塞流程。
 * 重要：AI 仅出草稿，绝不自动发布，需人工编辑后送审/发布。
 */
export async function generateArticleDraft(topic: string): Promise<ArticleDraft> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return mockDraft(topic);

  try {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content:
              "你是一名殡葬文化科普编辑。仅输出 JSON：{title,summary,body,seoTitle,seoKeywords,seoDescription}。内容庄重、回避封建迷信话术，统一使用“数字纪念/云祭扫/在线追思”等合规表述。body 使用 Markdown（## 小标题、- 列表）。",
          },
          { role: "user", content: `请围绕主题「${topic}」生成一篇新闻/科普草稿。` },
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(20000),
    });
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return mockDraft(topic);
    const parsed = JSON.parse(content) as Partial<ArticleDraft>;
    return {
      title: parsed.title ?? mockDraft(topic).title,
      summary: parsed.summary ?? "",
      body: parsed.body ?? "",
      seoTitle: parsed.seoTitle ?? parsed.title ?? "",
      seoKeywords: parsed.seoKeywords ?? topic,
      seoDescription: parsed.seoDescription ?? parsed.summary ?? "",
    };
  } catch {
    return mockDraft(topic);
  }
}

function mockDraft(topic: string): ArticleDraft {
  return {
    title: `关于「${topic}」的数字纪念观察（草稿）`,
    summary: `围绕${topic}的初步思考，待编辑完善后发布。`,
    body: `## ${topic}\n\n（这是 AI 生成的草稿示例。当前未配置 DEEPSEEK_API_KEY，返回的是模板内容；配置密钥后将由 DeepSeek 真实生成。）\n\n- 要点一\n- 要点二\n\n请编辑补充正文后发布。`,
    seoTitle: `${topic} | 宗忆堂`,
    seoKeywords: topic,
    seoDescription: `关于${topic}的数字纪念内容。`,
  };
}
