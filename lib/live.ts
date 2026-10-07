export interface SubtitleSegment {
  time: string;
  text: string;
}

/**
 * 直播字幕生成（内测占位）。
 * 公开阶段接入 Gemini / GPT-4o 语音转写：需先评估数据合规、取得逝者家属授权，
 * 且仅对"公开可直播"内容启用。内测返回占位字幕，不调用任何外部模型。
 */
export async function generateLiveSubtitle(_source: string): Promise<SubtitleSegment[]> {
  return [
    { time: "00:00", text: "（内测占位字幕）真实字幕将在公开阶段由 AI 语音转写生成。" },
    { time: "00:30", text: "本场为示例直播，用于验证播放与回放页面。" },
  ];
}
