import {
  CHART_META,
  CHART_THEMES,
  baseChartType,
  buildTree,
  genLabel,
  genShort,
  groupByGen,
  type ChartConfig,
  type ChartNode,
  type MemberRow,
} from "@/lib/genealogy-chart";

/**
 * 族谱图渲染器：纯 CSS / DOM 绘制，不依赖 canvas 或外部图片。
 *
 * 支持四种传统体例（欧式 / 苏式 / 宝塔式 / 牒记式）
 * 与三种精美版式（描金欧式 / 绢帛苏式 / 丹青宝塔）。
 */

// ---------------------------------------------------------------------------
// 公共零件
// ---------------------------------------------------------------------------
type Theme = (typeof CHART_THEMES)[keyof typeof CHART_THEMES];

/** 人名标签 */
function NameChip({
  node,
  theme,
  emphasis,
  dashed,
}: {
  node: ChartNode;
  theme: Theme;
  emphasis?: boolean;
  dashed?: boolean;
}) {
  return (
    <div className="flex flex-col items-center">
      <div
        className={
          "whitespace-nowrap rounded px-2 py-0.5 text-sm leading-6 " +
          (dashed ? "border border-dashed" : "border")
        }
        style={{
          borderColor: theme.accent,
          background: theme.chipBg,
          color: theme.ink,
          fontWeight: emphasis ? 600 : 400,
        }}
      >
        {node.name}
      </div>
      {node.relation && (
        <span className="mt-0.5 text-[10px] leading-4" style={{ color: theme.muted }}>
          {node.relation}
        </span>
      )}
    </div>
  );
}

/** 生平注（欧式右侧栏 / 牒记式正文用） */
function Notes({ node, theme }: { node: ChartNode; theme: Theme }) {
  if (!node.note) return null;
  return (
    <span className="text-[11px] leading-5" style={{ color: theme.muted }}>
      {node.note}
    </span>
  );
}

/** 竖直连接线 */
function VLine({ theme, h = 24, dashed }: { theme: Theme; h?: number; dashed?: boolean }) {
  return (
    <span
      className="block w-px"
      style={{
        height: h,
        background: dashed
          ? `repeating-linear-gradient(180deg, ${theme.line} 0 4px, transparent 4px 8px)`
          : theme.line,
      }}
    />
  );
}

/** 横线 */
function HLine({ theme, w, dashed }: { theme: Theme; w?: number | string; dashed?: boolean }) {
  return (
    <span
      className="block h-px"
      style={{
        width: w ?? "100%",
        background: dashed
          ? `repeating-linear-gradient(90deg, ${theme.line} 0 4px, transparent 4px 8px)`
          : theme.line,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// 一、欧式（横行体）：世代分格、由右向左横行，五世一表
// ---------------------------------------------------------------------------
function OuChart({ members, config, theme }: { members: MemberRow[]; config: ChartConfig; theme: Theme }) {
  const byGen = groupByGen(members);
  const gens = [...byGen.keys()].sort((a, b) => a - b);
  const tree = buildTree(members);
  const nodeByName = new Map<string, ChartNode>();
  const walk = (ns: ChartNode[]) => {
    for (const n of ns) {
      nodeByName.set(`${n.gen}-${n.name}`, n);
      walk(n.children);
    }
  };
  walk(tree);

  // 五世一表：每 5 世分为一表
  const tables: number[][] = [];
  for (let i = 0; i < gens.length; i += 5) tables.push(gens.slice(i, i + 5));

  return (
    <div className="space-y-8">
      {tables.map((tableGens, ti) => (
        <div
          key={ti}
          className="rounded-md p-4"
          style={{ border: theme.border, background: "rgba(255,255,255,0.45)" }}
        >
          {/* 表头 */}
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs" style={{ color: theme.accent }}>
              第 {tableGens[0]} — {tableGens[tableGens.length - 1]} 世（五世一表）
            </span>
            {config.origin && (
              <span className="text-xs" style={{ color: theme.muted }}>
                {config.origin}
              </span>
            )}
          </div>

          {/* 世代横行：由右向左（flex-row-reverse） */}
          <div className="space-y-3">
            {tableGens.map((g) => {
              const rows = byGen.get(g) ?? [];
              return (
                <div key={g} className="flex items-stretch gap-3">
                  {/* 世代标签（表右侧，符合右起传统） */}
                  <div
                    className="flex w-16 shrink-0 items-center justify-center rounded text-xs"
                    style={{ background: theme.chipBg, color: theme.accent }}
                  >
                    {genShort(g)}
                  </div>

                  {/* 人名（自右向左） */}
                  <div className="flex flex-1 flex-row-reverse flex-wrap items-start justify-start gap-3">
                    {rows.map((m, i) => {
                      const node = nodeByName.get(`${m.gen}-${m.name}`) ?? {
                        id: `${g}-${i}`,
                        gen: m.gen,
                        name: m.name,
                        relation: m.relation,
                        note: m.note,
                        children: [],
                      };
                      // 旁系（非长子链）用虚线框
                      const dashed = !!m.relation && !/长|嫡|孟|伯/.test(m.relation);
                      return (
                        <div key={`${m.name}-${i}`} className="flex items-start gap-2">
                          <NameChip node={node} theme={theme} dashed={dashed} />
                          {config.showNotes !== false && <Notes node={node} theme={theme} />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 二、苏式（垂珠体）：世代直行下垂，全用竖线串联，兄弟自右向左
// ---------------------------------------------------------------------------
function SuChart({ members, config, theme }: { members: MemberRow[]; config: ChartConfig; theme: Theme }) {
  const byGen = groupByGen(members);
  const gens = [...byGen.keys()].sort((a, b) => a - b);

  return (
    <div className="flex flex-col items-center">
      {gens.map((g, gi) => {
        const rows = byGen.get(g) ?? [];
        return (
          <div key={g} className="flex flex-col items-center">
            {/* 世代标签 */}
            <div
              className="rounded-full px-3 py-0.5 text-[11px]"
              style={{ background: theme.chipBg, color: theme.accent }}
            >
              {genLabel(g)}
            </div>

            {/* 竖向垂珠：兄弟自上而下（长幼有序） */}
            <div className="mt-2 flex flex-col items-center">
              {rows.map((m, i) => (
                <div key={`${m.name}-${i}`} className="flex flex-col items-center">
                  {i > 0 && <VLine theme={theme} h={20} />}
                  <NameChip
                    node={{
                      id: `${g}-${i}`,
                      gen: g,
                      name: m.name,
                      relation: m.relation,
                      note: m.note,
                      children: [],
                    }}
                    theme={theme}
                    dashed={!!m.relation && !/长|嫡|孟|伯/.test(m.relation)}
                  />
                  {config.showNotes !== false && m.note && (
                    <span className="mt-0.5 max-w-56 text-center text-[10px] leading-4" style={{ color: theme.muted }}>
                      {m.note}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* 到下一世的竖线（吊线） */}
            {gi < gens.length - 1 && (
              <div className="my-2 flex flex-col items-center">
                <VLine theme={theme} h={26} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 三、宝塔式（垂丝图）：上下排列，竖线恒在横线中间，层层收拢
// ---------------------------------------------------------------------------
function PagodaChart({
  members,
  config,
  theme,
}: {
  members: MemberRow[];
  config: ChartConfig;
  theme: Theme;
}) {
  const byGen = groupByGen(members);
  const gens = [...byGen.keys()].sort((a, b) => a - b);
  const maxCount = Math.max(...gens.map((g) => (byGen.get(g) ?? []).length), 1);

  return (
    <div className="flex flex-col items-center">
      {gens.map((g, gi) => {
        const rows = byGen.get(g) ?? [];
        // 每层宽度按人数占比，形成对称宝塔形
        const widthPct = Math.max(28, Math.round((rows.length / maxCount) * 100));
        return (
          <div key={g} className="flex w-full flex-col items-center">
            <div
              className="flex flex-col items-center"
              style={{ width: `${widthPct}%` }}
            >
              <div
                className="rounded px-2 py-0.5 text-[11px]"
                style={{ background: theme.chipBg, color: theme.accent }}
              >
                {genLabel(g)}
              </div>

              {/* 横向排列本世代（居中，竖线落在中点） */}
              <div className="relative mt-2 flex w-full justify-center">
                <div className="flex flex-wrap items-start justify-center gap-x-3 gap-y-2">
                  {rows.map((m, i) => (
                    <div key={`${m.name}-${i}`} className="flex flex-col items-center">
                      <NameChip
                        node={{
                          id: `${g}-${i}`,
                          gen: g,
                          name: m.name,
                          relation: m.relation,
                          note: m.note,
                          children: [],
                        }}
                        theme={theme}
                        dashed={!!m.relation && !/长|嫡|孟|伯/.test(m.relation)}
                      />
                      {config.showNotes !== false && m.note && (
                        <span className="mt-0.5 max-w-40 text-center text-[10px] leading-4" style={{ color: theme.muted }}>
                          {m.note}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 竖线：恒落在横线中间 */}
            {gi < gens.length - 1 && (
              <div className="my-1 flex flex-col items-center">
                <VLine theme={theme} h={22} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 四、牒记式：纯文字表述关系，无连线
// ---------------------------------------------------------------------------
function DiejiChart({ members, config, theme }: { members: MemberRow[]; config: ChartConfig; theme: Theme }) {
  const byGen = groupByGen(members);
  const gens = [...byGen.keys()].sort((a, b) => a - b);

  return (
    <div className="space-y-6">
      {gens.map((g) => {
        const rows = byGen.get(g) ?? [];
        return (
          <div key={g}>
            <h4 className="mb-2 text-sm font-semibold" style={{ color: theme.accent }}>
              {genLabel(g)}
            </h4>
            <div className="space-y-1.5">
              {rows.map((m, i) => (
                <p key={`${m.name}-${i}`} className="text-sm leading-7" style={{ color: theme.ink }}>
                  <span style={{ fontWeight: 600 }}>{m.name}</span>
                  {m.relation && (
                    <span style={{ color: theme.muted }}>，{m.relation}</span>
                  )}
                  {config.showNotes !== false && m.note && (
                    <span style={{ color: theme.muted }}>。{m.note}</span>
                  )}
                </p>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 精美版式的装饰层
// ---------------------------------------------------------------------------
function PremiumDecor({ type, theme }: { type: string; theme: Theme }) {
  if (type === "miaojin") {
    return (
      <>
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, rgba(212,175,55,0.07) 0 10px, transparent 10px 20px)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-3 rounded"
          style={{ border: "1px solid rgba(184,134,11,0.55)" }}
        />
      </>
    );
  }
  if (type === "juanbo") {
    return (
      <>
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, rgba(185,154,107,0.10) 0 2px, transparent 2px 9px)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-3"
          style={{ border: "1px dashed rgba(185,154,107,0.6)" }}
        />
      </>
    );
  }
  if (type === "danqing") {
    return (
      <>
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 12% 8%, rgba(63,107,82,0.12), transparent 42%), radial-gradient(circle at 88% 92%, rgba(63,107,82,0.10), transparent 40%)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-3 rounded"
          style={{ border: "1px solid rgba(157,184,166,0.7)" }}
        />
      </>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// 主组件
// ---------------------------------------------------------------------------
export default function GenealogyChart({
  members,
  config,
  className = "",
  showHeader = true,
}: {
  members: MemberRow[];
  config: ChartConfig;
  className?: string;
  showHeader?: boolean;
}) {
  const theme = CHART_THEMES[config.type] ?? CHART_THEMES.ou;
  const meta = CHART_META[config.type] ?? CHART_META.ou;
  const base = baseChartType(config.type);
  const isPremiumStyle = meta.tier === "premium";

  const body =
    base === "su" ? (
      <SuChart members={members} config={config} theme={theme} />
    ) : base === "pagoda" ? (
      <PagodaChart members={members} config={config} theme={theme} />
    ) : base === "dieji" ? (
      <DiejiChart members={members} config={config} theme={theme} />
    ) : (
      <OuChart members={members} config={config} theme={theme} />
    );

  return (
    <div
      className={`relative overflow-hidden rounded-lg ${className}`}
      style={{
        background: theme.paper,
        border: theme.border,
        fontFamily: theme.fontFamily,
        color: theme.ink,
      }}
    >
      {isPremiumStyle && <PremiumDecor type={config.type} theme={theme} />}

      <div className="relative p-6">
        {showHeader && (
          <header className="mb-5 text-center">
            <h3 className="text-xl font-semibold tracking-[0.2em]">{config.title ?? "族谱世系图"}</h3>
            <div className="mt-2 flex items-center justify-center gap-4 text-xs" style={{ color: theme.muted }}>
              {config.hallName && <span>堂号 · {config.hallName}</span>}
              {config.origin && <span>郡望 · {config.origin}</span>}
              <span>
                {meta.name}（{meta.alias}）
              </span>
            </div>
            <div className="mx-auto mt-3 h-px w-24" style={{ background: theme.accent }} />
          </header>
        )}

        {body}

        <footer
          className="mt-6 border-t pt-3 text-[10px] leading-5"
          style={{ borderColor: theme.line, color: theme.muted }}
        >
          直系实线 · 旁系虚线 ｜ 女子注「适某地某姓」｜ 过继注「嗣子」｜ 存疑注「待考」｜
          无后注「止」｜ 未成年亡注「殇」
        </footer>
      </div>
    </div>
  );
}

export { HLine, NameChip, Notes, VLine };
