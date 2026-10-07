-- 空间装修商品：ProductType 新增 `decor` 值
--
-- 背景：装修改版后（2026-10），模板与装饰套件改为**商城独立商品**
-- （可积分兑换，也可货币支付买断）。为让它们走通现有的下单-发货链路，
-- 需要给 Product.type 一个专属值 —— 复 use 其它类型会让发货分支误判。
--
-- 纯枚举扩展，不改任何现有列，对运行中的旧代码完全向后兼容。
-- PostgreSQL 的 ALTER TYPE ... ADD VALUE 在 PG12+ 允许在事务内执行
-- （旧版本会报 "ALTER TYPE ... ADD cannot run inside a transaction block"）。
-- 本项目 PG16，可安全放入迁移事务。

ALTER TYPE "ProductType" ADD VALUE IF NOT EXISTS 'decor';
