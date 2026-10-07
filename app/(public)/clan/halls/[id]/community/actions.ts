// 社区 action 与纪念馆共用同一份实现（多态外键，scope 区分）。
// 宗祠社区页直接从纪念馆侧 import。
export {
  createPost,
  createReply,
  joinCommunity,
  ensureOwner,
} from "@/app/(public)/halls/[id]/community/actions";
export type { CommunityResult } from "@/app/(public)/halls/[id]/community/actions";
