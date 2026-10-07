// 极简 Markdown → HTML（仅用于平台自营内容，输入来自受信任编辑）
export function mdToHtml(md: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = (md || "").split("\n");
  let html = "";
  let listOpen = false;
  const closeList = () => {
    if (listOpen) {
      html += "</ul>";
      listOpen = false;
    }
  };
  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      closeList();
      continue;
    }
    if (t.startsWith("## ")) {
      closeList();
      html += `<h2 class="mt-6 mb-2 text-xl font-semibold text-brand-900">${esc(t.slice(3))}</h2>`;
    } else if (t.startsWith("# ")) {
      closeList();
      html += `<h2 class="mt-6 mb-2 text-2xl font-semibold text-brand-900">${esc(t.slice(2))}</h2>`;
    } else if (t.startsWith("- ")) {
      if (!listOpen) {
        html += '<ul class="my-2 list-disc space-y-1 pl-6">';
        listOpen = true;
      }
      html += `<li>${esc(t.slice(2))}</li>`;
    } else {
      closeList();
      html += `<p class="my-3 leading-7 text-gray-700">${esc(t)}</p>`;
    }
  }
  closeList();
  return html;
}
