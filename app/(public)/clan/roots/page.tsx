import Link from "next/link";
import RootsSearch from "@/components/clan/RootsSearch";

export const metadata = { title: "寻根谒祖 · 宗忆堂" };

export default function RootsPage() {
  return (
    <div className="container-page max-w-4xl py-10">
      <nav className="mb-4 text-sm text-brand-400">
        <Link href="/clan" className="hover:text-brand-700">宗亲文化</Link> / 寻根谒祖
      </nav>
      <h1 className="text-2xl font-semibold text-brand-900">寻根谒祖服务</h1>
      <p className="mt-2 text-sm text-brand-500">
        基于族谱数字化数据库，按姓氏与祖籍智能匹配、溯源世系字辈，帮您找到"我从哪里来"。
        依托数字化族谱数据实现"一键寻根"。
      </p>
      <div className="mt-6">
        <RootsSearch />
      </div>
    </div>
  );
}
