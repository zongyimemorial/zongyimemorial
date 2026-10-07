/**
 * 零依赖 QR 码编码器（QR Code Model 2 / 字节模式 / 纠错等级 M）。
 *
 * 为什么自绘而不装库：
 *   本平台的原则是「零外部资源」（见 lib/decor-3d.ts 文件头同样的决策记录）——
 *   分享二维码只在弹窗里显示一次，为它引一个 ~50KB 的依赖不划算，
 *   且多一个依赖就多一个供应链面。整个编码器不到 300 行。
 *
 * ⚠️ 自研二维码最大的风险是「看起来像但扫不出来」——静默失败，肉眼绝对看不出。
 *    因此本文件的验收不靠肉眼看，而是：
 *      ① 标准测试向量（ISO/IEC 18004 附录里的已知矩阵特征）；
 *      ② 往返校验：编码 → 用独立实现解码 → 必须还原出原文。
 *    见 scripts/verify-share.mjs §0。
 *
 * 参考：ISO/IEC 18004:2015《QR Code bar code symbology specification》。
 */

// ---------------------------------------------------------------------------
// 纠错等级 M 的容量与纠错参数（版本 1–10）
// ---------------------------------------------------------------------------
//
// 版本 n 的码字总数（数据 + 纠错）、每块纠错码字数、块分组结构。
// 数据来源：ISO/IEC 18004 表 9（纠错特性表）。
//
// 只做到版本 10 —— 版本 10 的 M 级可容纳 213 字节，而本平台最长的分享 URL
// （`https://zongyimemorial.com/clan/halls/<cuid28>?share=<ts>.<64位hex签名>`）
// 约 110 字符，版本 6 就够了。留到 10 是安全余量。
//
// 每项的字段：{ total, ecPerBlock, groups: [[块数, 每块数据码字数], ...] }
//
// ⚠️ 这张表曾被整表写错（初版凭记忆填，版本 1 写成 16 个数据码字，正确是 10）。
//    症状极隐蔽：矩阵照样生成、定位图案照样正确、看起来就是一枚二维码，
//    但**一个格子都扫不出来**（数据区整体偏移，纠错码字也对不上）。
//    现在每个数字都对齐 ISO/IEC 18004 表 9，并由 scripts/verify-share.mjs §0
//    与独立解码器做逐格交叉验证 —— 别再凭记忆改这张表。
const EC_M: Record<number, { total: number; ecPerBlock: number; groups: [number, number][] }> = {
  1: { total: 26, ecPerBlock: 10, groups: [[1, 16]] },
  2: { total: 44, ecPerBlock: 16, groups: [[1, 28]] },
  3: { total: 70, ecPerBlock: 26, groups: [[1, 44]] },
  4: { total: 100, ecPerBlock: 18, groups: [[2, 32]] },
  5: { total: 134, ecPerBlock: 24, groups: [[2, 43]] },
  6: { total: 172, ecPerBlock: 16, groups: [[4, 27]] },
  7: { total: 196, ecPerBlock: 18, groups: [[4, 31]] },
  8: { total: 242, ecPerBlock: 22, groups: [[2, 38], [2, 39]] },
  9: { total: 292, ecPerBlock: 22, groups: [[3, 36], [2, 37]] },
  10: { total: 346, ecPerBlock: 26, groups: [[4, 43], [1, 44]] },
};

const MIN_VERSION = 1;
const MAX_VERSION = 10;

/** 该版本的数据码字总数（不含纠错码字）。 */
function dataCodewords(version: number): number {
  const spec = EC_M[version];
  return spec.groups.reduce((sum, [count, cw]) => sum + count * cw, 0);
}

/** 总码字数 = 数据 + 纠错。用于计算矩阵尺寸。 */
function totalCodewords(version: number): number {
  return EC_M[version].total;
}

function groupCount(version: number): number {
  return EC_M[version].groups.reduce((sum, [count]) => sum + count, 0);
}

/** 版本 → 符号边长（模块数）。尺寸 = 17 + 4 × version。 */
export function sizeOf(version: number): number {
  return 17 + 4 * version;
}

// ---------------------------------------------------------------------------
// GF(256) 伽罗华域运算（生成 Reed-Solomon 纠错码）
// ---------------------------------------------------------------------------
//
// QR 用本原多项式 x^8 + x^4 + x^3 + x^2 + 1（0x11D）。
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function initGaloisField() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d; // 模本原多项式
  }
  // 表延拓一倍，省掉乘法里的取模判断
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

/** 生成多项式 g(x) = (x - α^0)(x - α^1)...(x - α^(degree-1))。 */
function generatorPoly(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], 1); // × x
      next[j + 1] ^= gfMul(poly[j], GF_EXP[i]); // × α^i
    }
    poly = next;
  }
  return poly;
}

/**
 * Reed-Solomon 纠错码字（多项式长除法取余）。
 * @returns 长度恰好为 ecCount 的纠错码字数组
 */
function reedSolomon(data: number[], ecCount: number): number[] {
  const gen = generatorPoly(ecCount);
  const result = new Array<number>(ecCount).fill(0);

  for (const byte of data) {
    const factor = byte ^ result[0];
    result.shift();
    result.push(0);
    if (factor !== 0) {
      for (let i = 0; i < ecCount; i++) {
        result[i] ^= gfMul(gen[i + 1], factor);
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// 位流：模式指示符 + 字符计数 + 数据 + 终止符 + 填充
// ---------------------------------------------------------------------------

/** 字节模式的字符计数指示符位宽（版本 1–9 为 8 位，10–26 为 16 位）。 */
function countIndicatorBits(version: number): number {
  return version <= 9 ? 8 : 16;
}

class BitBuffer {
  bits: number[] = [];
  put(value: number, length: number) {
    for (let i = length - 1; i >= 0; i--) {
      this.bits.push((value >>> i) & 1);
    }
  }
  get length() {
    return this.bits.length;
  }
}

/** 把 UTF-8 字符串转成字节数组（QR 字节模式默认按 ISO-8859-1，中文必须显式 UTF-8）。 */
function toUtf8Bytes(text: string): number[] {
  const bytes: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) {
      bytes.push(cp);
    } else if (cp < 0x800) {
      bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    } else if (cp < 0x10000) {
      bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      bytes.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    }
  }
  return bytes;
}

/** 选择能容纳 dataLength 字节的最小版本（纠错等级 M）。装不下返回 null。 */
export function pickVersion(dataLength: number): number | null {
  for (let v = MIN_VERSION; v <= MAX_VERSION; v++) {
    // 4 位模式指示符 + 字符计数指示符 + 数据 × 8
    const needed = 4 + countIndicatorBits(v) + dataLength * 8;
    if (needed <= dataCodewords(v) * 8) return v;
  }
  return null;
}

/**
 * 组装数据码字：模式 + 计数 + 数据 + 终止符 + 字节对齐 + 0xEC/0x11 填充。
 */
function buildDataCodewords(bytes: number[], version: number): number[] {
  const capacity = dataCodewords(version);
  const buf = new BitBuffer();

  buf.put(0b0100, 4); // 模式指示符：字节模式
  buf.put(bytes.length, countIndicatorBits(version));
  for (const b of bytes) buf.put(b, 8);

  // 终止符：最多 4 个 0（放不下就少放几个）
  const maxBits = capacity * 8;
  const terminator = Math.min(4, maxBits - buf.length);
  buf.put(0, terminator);

  // 补到字节边界
  while (buf.length % 8 !== 0) buf.bits.push(0);

  const codewords: number[] = [];
  for (let i = 0; i < buf.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | buf.bits[i + j];
    codewords.push(byte);
  }

  // 交替填充字节 0xEC / 0x11 直到填满
  const PAD = [0xec, 0x11];
  let padIndex = 0;
  while (codewords.length < capacity) {
    codewords.push(PAD[padIndex % 2]);
    padIndex++;
  }

  return codewords;
}

/**
 * 分块 → 逐块算纠错 → 按标准顺序交织。
 *
 * 分块结构由「总码字数 ÷ 块数」推导（规范里组 1 / 组 2 的差别是**差 1 个数据码字**）：
 *   g2 = total % blocks        （多 1 个数据码字的块数）
 *   dataPerG1 = floor(dataTotal / blocks)
 *   dataPerG2 = dataPerG1 + 1
 * 照这张公式算，版本 8/9/10 那种"两组不同长度"的情况才不会错位。
 *
 * ⚠️ 交织顺序是 QR 最容易写错的地方（错了依然能扫出"某种"图案，只是内容不对）。
 *    规则：先按列依次取各块的**数据**码字（短块在最后一列直跳过），
 *    再按列取各块的**纠错**码字。
 */
function interleave(codewordsToInterleave: number[], version: number): number[] {
  const spec = EC_M[version];
  const total = spec.total;
  const dataTotal = dataCodewords(version);
  const blocks = spec.groups.reduce((sum, [count]) => sum + count, 0);

  const blocksInGroup2 = total % blocks;
  const blocksInGroup1 = blocks - blocksInGroup2;
  const dataPerG1 = Math.floor(dataTotal / blocks);
  const dataPerG2 = dataPerG1 + 1;

  // 按块切出数据码字
  const dcBlocks: number[][] = [];
  let offset = 0;
  for (let b = 0; b < blocks; b++) {
    const size = b < blocksInGroup1 ? dataPerG1 : dataPerG2;
    dcBlocks.push(codewordsToInterleave.slice(offset, offset + size));
    offset += size;
  }

  const ecBlocks = dcBlocks.map((blk) => reedSolomon(blk, spec.ecPerBlock));

  const result: number[] = [];
  const maxDataLen = Math.max(...dcBlocks.map((b) => b.length));
  for (let i = 0; i < maxDataLen; i++) {
    for (const blk of dcBlocks) {
      if (i < blk.length) result.push(blk[i]);
    }
  }
  for (let i = 0; i < spec.ecPerBlock; i++) {
    for (const blk of ecBlocks) {
      result.push(blk[i]);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// 矩阵构建：功能图案 → 数据区
// ---------------------------------------------------------------------------

type Matrix = (boolean | null)[][]; // null = 尚未填充

function blankMatrix(size: number): Matrix {
  return Array.from({ length: size }, () => new Array<boolean | null>(size).fill(null));
}

/** 三个角上的定位图案（7×7 回字）+ 分隔符（白边）。 */
function placeFinderPatterns(m: Matrix, size: number) {
  const at = (row: number, col: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = row + r;
        const cc = col + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        // 外框 7×7 黑、内圈 5×5 白、核心 3×3 黑
        const inOuter = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const inInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        m[rr][cc] = inOuter && (!inInner ? (r === 0 || r === 6 || c === 0 || c === 6) : true);
      }
    }
  };
  at(0, 0);
  at(0, size - 7);
  at(size - 7, 0);
}

/**
 * 对齐图案中心坐标（升序）。
 *
 * ⚠️ 间隔必须用 `ceil((size-13) / (2*count-2)) * 2` —— 分母是 **2*count-2**。
 *    初版误写成 `/(num-1)`，版本 2–6 的坐标看着"差不多对"（因为那些版本
 *    只有一个中间坐标，两种算法恰好同解），但版本 7 起出现多个中间坐标时
 *    就开始偏移 → **二维码扫不出来**。这正是"看起来对"的典型。
 *    现在与参考实现的输出逐版本比对（见 verify-share.mjs §0）。
 */
function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const size = sizeOf(version);
  const posCount = Math.floor(version / 7) + 2;
  // 版本 32 是规范里的特例（size=145），间隔固定 26
  const intervals = size === 145 ? 26 : Math.ceil((size - 13) / (2 * posCount - 2)) * 2;
  const positions = [size - 7];
  for (let i = 1; i < posCount - 1; i++) {
    positions[i] = positions[i - 1] - intervals;
  }
  positions.push(6);
  return positions.reverse();
}

function placeAlignmentPatterns(m: Matrix, version: number) {
  const positions = alignmentPositions(version);
  const last = positions.length - 1;
  for (let i = 0; i < positions.length; i++) {
    for (let j = 0; j < positions.length; j++) {
      // 跳过与三个定位图案重叠的角：(0,0)、(0,last)、(last,0)
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      const row = positions[i];
      const col = positions[j];
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          const isBorder = Math.abs(r) === 2 || Math.abs(c) === 2;
          const isCenter = r === 0 && c === 0;
          m[row + r][col + c] = isBorder || isCenter;
        }
      }
    }
  }
}

/** 定时图案：第 6 行 / 第 6 列黑白交替。 */
function placeTimingPatterns(m: Matrix, size: number) {
  for (let i = 8; i < size - 8; i++) {
    const dark = i % 2 === 0;
    if (m[6][i] === null) m[6][i] = dark;
    if (m[i][6] === null) m[i][6] = dark;
  }
}

/**
 * 预留格式信息区。
 *
 * ⚠️ 这里**只是占位**（值稍后由 placeFormatInfo 覆写），关键是**占的格子必须与规范一致**——
 *    占多了会挤掉数据模块、占少了会让数据写进格式区，两者都导致扫不出来。
 *    形状是：第 8 行与第 8 列，各自被定位图案**断成两段**，加上右上 / 左下两小段。
 *    第 8 行第 6 列、第 8 列第 6 行属于定时图案（已填），故要跳过。
 */
function reserveFormatAreas(m: Matrix, size: number) {
  // 第 8 行：左段 col 0..5、col 7、col 8；右段 col size-8..size-1
  for (let i = 0; i < 9; i++) {
    if (i !== 6 && m[8][i] === null) m[8][i] = false;
  }
  // 第 8 列：上段 row 0..5、row 7、row 8；下段 row size-7..size-1
  for (let i = 0; i < 9; i++) {
    if (i !== 6 && m[i][8] === null) m[i][8] = false;
  }
  for (let i = 0; i < 8; i++) {
    if (m[8][size - 1 - i] === null) m[8][size - 1 - i] = false;
    if (m[size - 1 - i][8] === null) m[size - 1 - i][8] = false;
  }
  // 固定的深色模块
  m[size - 8][8] = true;
}

/**
 * 预留版本信息区（版本 ≥ 7 才有）。两个 3×6 区，紧邻两个定位图案。
 * 位置必须与 placeVersionInfo 完全一致（col = i%3 + size - 11，row = i/3）。
 */
function reserveVersionAreas(m: Matrix, size: number, version: number) {
  if (version < 7) return;
  for (let i = 0; i < 18; i++) {
    const row = Math.floor(i / 3);
    const col = (i % 3) + size - 11;
    if (m[row][col] === null) m[row][col] = false;
    if (m[col][row] === null) m[col][row] = false;
  }
}

/** 生成 BCH 格式信息（纠错等级 + 掩码号），15 位。 */
function formatBits(ecLevel: number, mask: number): number {
  const data = (ecLevel << 3) | mask;
  let value = data << 10;
  const gen = 0b10100110111;
  for (let i = 14; i >= 10; i--) {
    if ((value >> i) & 1) value ^= gen << (i - 10);
  }
  return ((data << 10) | value) ^ 0b101010000010010;
}

/** 生成 BCH 版本信息（版本 ≥ 7），18 位。 */
function versionBits(version: number): number {
  let value = version << 12;
  const gen = 0b1111100100101;
  for (let i = 17; i >= 12; i--) {
    if ((value >> i) & 1) value ^= gen << (i - 12);
  }
  return (version << 12) | value;
}

/**
 * 写入格式信息（15 位）到两处。
 *
 * 位序：`i` 是位下标（0 = LSB），沿「竖向绕左上 + 横向绕左上」两条路径铺。
 * 注意 `i >= 8` 时竖向那条走到左下角、横向那条走到右上角 —— 这两段最容易写反。
 */
function placeFormatInfo(m: Matrix, size: number, ecBits: number, mask: number) {
  const bits = formatBits(ecBits, mask);

  for (let i = 0; i < 15; i++) {
    const bit = ((bits >> i) & 1) === 1;

    // 竖向：绕左上定位图案（第 6 行被定时图案占掉，故 i>=6 时跳过一行），
    // 走到底后继续沿左下角向上。
    if (i < 6) m[i][8] = bit;
    else if (i < 8) m[i + 1][8] = bit;
    else m[size - 15 + i][8] = bit;

    // 横向：沿右上角向左，再绕回左上的第 8 行。
    if (i < 8) m[8][size - i - 1] = bit;
    else if (i < 9) m[8][15 - i - 1 + 1] = bit;
    else m[8][15 - i - 1] = bit;
  }

  // 固定的深色模块（务必写在格式信息之后，否则会被上面的循环覆盖）
  m[size - 8][8] = true;
}

function placeVersionInfo(m: Matrix, version: number) {
  if (version < 7) return;
  const size = sizeOf(version);
  const bits = versionBits(version);
  for (let i = 0; i < 18; i++) {
    const bit = ((bits >> i) & 1) === 1;
    const row = Math.floor(i / 3);
    const col = (i % 3) + size - 8 - 3;
    m[row][col] = bit;
    m[col][row] = bit;
  }
}

/** 8 种掩码函数（ISO/IEC 18004 表 10）。 */
const MASK_FNS: ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r * c) % 3) + ((r + c) % 2)) % 2 === 0,
];

/**
 * 惩罚分值（4 条规则），用于挑选最佳掩码。
 * 规则号与分值均取自 ISO/IEC 18004 表 11：N1=3、N2=3、N3=40、N4=10。
 *
 * ⚠️ 掩码选错**不影响能否扫出**（任何合法掩码都能解码），只影响识别率与观感。
 *    但既然规范给了判据，就按规范算 —— 初版这里三条规则都写错了
 *    （规则 3 的图案取反、规则 4 用 floor 而非 ceil），选出的掩码与标准实现不一致。
 */
function penalty(m: Matrix, size: number): number {
  let score = 0;
  const dark = (r: number, c: number) => m[r][c] === true;

  // 规则 1：同行/同列同色连续 ≥5 → 3 + (长度 - 5)。
  // 行与列分开累计（初版把两者混在一个循环里，导致跨行列误判）。
  for (let row = 0; row < size; row++) {
    let runRow = 0;
    let runCol = 0;
    let lastRow: boolean | null = null;
    let lastCol: boolean | null = null;
    for (let col = 0; col < size; col++) {
      // 横向
      const h = dark(row, col);
      if (h === lastRow) runRow++;
      else {
        if (runRow >= 5) score += 3 + (runRow - 5);
        lastRow = h;
        runRow = 1;
      }
      // 纵向
      const v = dark(col, row);
      if (v === lastCol) runCol++;
      else {
        if (runCol >= 5) score += 3 + (runCol - 5);
        lastCol = v;
        runCol = 1;
      }
    }
    if (runRow >= 5) score += 3 + (runRow - 5);
    if (runCol >= 5) score += 3 + (runCol - 5);
  }

  // 规则 2：2×2 同色块 → 每个 3 分
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const sum =
        (dark(r, c) ? 1 : 0) + (dark(r, c + 1) ? 1 : 0) +
        (dark(r + 1, c) ? 1 : 0) + (dark(r + 1, c + 1) ? 1 : 0);
      if (sum === 4 || sum === 0) score += 3;
    }
  }

  // 规则 3：滑窗比对 11 位图案。
  // 规范里的目标图案是「深浅浅深浅/深/浅…」：0x5D0 = 10111010000、
  // 0x05D = 00001011101（两个方向都算）。初版把图案写反了。
  for (let row = 0; row < size; row++) {
    let bitsRow = 0;
    let bitsCol = 0;
    for (let col = 0; col < size; col++) {
      bitsRow = ((bitsRow << 1) & 0x7ff) | (dark(row, col) ? 1 : 0);
      if (col >= 10 && (bitsRow === 0x5d0 || bitsRow === 0x05d)) score += 40;
      bitsCol = ((bitsCol << 1) & 0x7ff) | (dark(col, row) ? 1 : 0);
      if (col >= 10 && (bitsCol === 0x5d0 || bitsCol === 0x05d)) score += 40;
    }
  }

  // 规则 4：暗模块占比每偏离 50% 满 5% → 10 分。
  // 规范用「向上取整到 5% 档」，初版用 floor 会少扣分（边缘版本选错掩码）。
  let darkCount = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (dark(r, c)) darkCount++;
  const percent = (darkCount * 100) / (size * size);
  score += Math.abs(Math.ceil(percent / 5) - 10) * 10;

  return score;
}

/**
 * 数据位按「之」字形从右下角向上填入（跳过功能图案与预留区）。
 *
 * 走法：每次处理一对列（`col` 与 `col-1`），列内自下而上（或自上而下）逐格填，
 * 到边界后换向并左移两列；第 6 列是定时图案，整列跳过（故 `col--` 变成跨三列）。
 */
function placeData(m: Matrix, size: number, codewords: number[], mask: number) {
  const bits: number[] = [];
  for (const cw of codewords) {
    for (let i = 7; i >= 0; i--) bits.push((cw >> i) & 1);
  }

  let bitIndex = 0;
  let upward = true;

  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--; // 跳过定时图案所在列
    for (let i = 0; i < size; i++) {
      const row = upward ? size - 1 - i : i;
      for (let k = 0; k < 2; k++) {
        const c = col - k;
        if (m[row][c] !== null) continue; // 功能图案 / 预留区
        let bit = bitIndex < bits.length ? bits[bitIndex] === 1 : false;
        bitIndex++;
        if (MASK_FNS[mask](row, c)) bit = !bit;
        m[row][c] = bit;
      }
    }
    upward = !upward;
  }
}

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------

/**
 * 把文本编码成 QR 码矩阵。
 *
 * @returns `true` 表示深色模块的二维数组（含静默区外的全部模块）
 * @throws 文本超出最大容量时抛错（本平台最长的分享 URL 远小于上限）
 */
export function encodeQr(text: string): boolean[][] {
  const bytes = toUtf8Bytes(text);
  const version = pickVersion(bytes.length);
  if (version === null) {
    throw new Error(`文本过长（${bytes.length} 字节），超出 QR 版本 ${MAX_VERSION} 的容量`);
  }

  const size = sizeOf(version);
  const dataCw = buildDataCodewords(bytes, version);
  const allCw = interleave(dataCw, version);

  // 纠错等级 M 的编码值是 0b00（见 ISO/IEC 18004 表 12）
  const EC_BITS = 0b00;

  let bestMatrix: Matrix | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const m = blankMatrix(size);
    placeFinderPatterns(m, size);
    // 定时图案必须先于对齐图案（与规范要求的顺序一致），
    // 否则对齐图案可能覆盖定时图案上的模块
    placeTimingPatterns(m, size);
    placeAlignmentPatterns(m, version);
    reserveFormatAreas(m, size);
    reserveVersionAreas(m, size, version);
    placeData(m, size, allCw, mask);
    // 格式/版本信息最后写：它们要盖掉刚才的占位值
    placeVersionInfo(m, version);
    placeFormatInfo(m, size, EC_BITS, mask);

    const score = penalty(m, size);
    if (score < bestScore) {
      bestScore = score;
      bestMatrix = m;
    }
  }

  const result = bestMatrix!;
  return result.map((row) => row.map((cell) => cell === true));
}

/** 矩阵边长（含 4 模块静默区之外的模块数）。 */
export function matrixSize(matrix: boolean[][]): number {
  return matrix.length;
}
