-- 删除 Product.fubPrice 派生列（2026-10）
--
-- 背景：币种改造（1 福币 = 1 人民币）时加了这一列，用 `ROUND(price/100)::int` 回填。
-- 但商品价需要**一位小数**精度（装修素材有 14 处非整元价：1.2 / 1.5 / 2.2 / 3.5 …），
-- `Int` 列装不下 → 它注定落后于真相，成为「同一个事实的第二个判据」。
--
-- 处置：展示层一律 `fubFromFen(product.price)` **现算**（lib/fortune.ts 的 0.1 元精度）。
-- 该列在业务代码里**零引用**（只有 verify-product-pricing.mjs 一条 SQL 断言在读它，
-- 已同步改回从 price 现算），故可直接 DROP，无数据迁移风险。
--
-- 注：price（分）仍是全站人民币唯一账本口径，OrderItem.unitPrice / Payment.amount
--     都从它来 —— 本次只删展示派生列，交易账本一分不动。

ALTER TABLE "Product" DROP COLUMN IF EXISTS "fubPrice";
