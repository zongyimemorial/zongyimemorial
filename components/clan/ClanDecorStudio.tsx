"use client";

import DecorStudio, { type DecorStudioProps } from "@/components/console/DecorStudio";
import { clanDecorThumb } from "@/components/clan/ClanDecorThumb";

/**
 * 宗祠装修工坊（客户端薄包装）。
 *
 * 存在的唯一理由：`renderThumb` 是一个**函数**，函数不能从服务端组件直接传给客户端组件
 * （RSC 只允许传可序列化的值）。因此这里在客户端边界内固定传入缩略图渲染器，
 * 服务端只需要传数据。
 */
export default function ClanDecorStudio(props: Omit<DecorStudioProps, "renderThumb">) {
  return <DecorStudio {...props} renderThumb={clanDecorThumb} />;
}
