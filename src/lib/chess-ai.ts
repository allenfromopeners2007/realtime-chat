/**
 * 国际象棋 AI（纯逻辑，不依赖 UI）
 *
 * 做法是最经典的 **极小化极大搜索 + Alpha-Beta 剪枝** ✓
 * 不需要机器学习、不需要外部服务，几百行就能下得像模像样 ✓
 *
 * 三档难度：
 *   1 简单   —— 只看一步（会吃子，但看不到陷阱）
 *   2 普通   —— 看两步（我走完 + 他回一步）★ 默认
 *   3 稍强   —— 看三步（带 Alpha-Beta 剪枝 + 吃子优先排序，大约 1-3 秒）
 *
 * 为什么难度不是"搜索更深"那么简单：纯深搜在浏览器里很慢，
 * 所以第 3 档加了**走法排序**（先试吃子）让剪枝更有效 ✓
 */

import {
  PIECE_VALUE,
  applyMove,
  colOf,
  colorOf,
  generateLegalMoves,
  getStatus,
  rowOf,
  typeOf,
  type Move,
  type Position,
} from "@/lib/chess";

export type AiLevel = 1 | 2 | 3;

export const AI_LEVEL_LABEL: Record<AiLevel, string> = {
  1: "简单（看 1 步）",
  2: "普通（看 2 步）",
  3: "稍强（看 3 步）",
};

/** 位置分：鼓励占中心、鼓励兵前进（简单但有效） */
const CENTER_BONUS = [0, 1, 2, 3, 3, 2, 1, 0];

function positionalBonus(piece: string, square: number): number {
  const type = typeOf(piece);
  if (!type || type === "k") return 0;

  const row = rowOf(square);
  const col = colOf(square);
  // 越靠中心越好（用行列到中心的距离衡量）
  const centerScore = CENTER_BONUS[Math.min(col, 7 - col)] + CENTER_BONUS[Math.min(row, 7 - row)];

  switch (type) {
    case "n":
    case "b":
      return centerScore * 4;
    case "p": {
      // 白兵越靠近第 8 排越好，黑兵越靠近第 1 排越好
      const advance = colorOf(piece) === "w" ? 6 - row : row - 1;
      return advance * 6 + centerScore * 2;
    }
    case "r":
      return centerScore;
    case "q":
      return centerScore * 2;
    default:
      return 0;
  }
}

/** 从白方视角评估局面（正数=白方好） */
export function evaluate(position: Position): number {
  let score = 0;
  for (let square = 0; square < 64; square++) {
    const piece = position.board[square];
    if (!piece) continue;
    const value = PIECE_VALUE[typeOf(piece)!] + positionalBonus(piece, square);
    score += colorOf(piece) === "w" ? value : -value;
  }
  return score;
}

/** 走法排序：吃子优先（代价高的先），让 Alpha-Beta 剪枝更有效 ✓ */
function orderMoves(moves: Move[]): Move[] {
  return moves
    .map((move) => {
      let score = 0;
      if (move.captured) {
        score += 10 * PIECE_VALUE[typeOf(move.captured)!] - PIECE_VALUE[typeOf(move.piece)!];
      }
      if (move.promotion) score += PIECE_VALUE[move.promotion];
      return { move, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.move);
}

/** 把分数折算成"轮到谁走"的视角（极大化方永远是当前走子方） */
function negamax(
  position: Position,
  depth: number,
  alpha: number,
  beta: number,
): number {
  const status = getStatus(position);
  if (status === "checkmate") return -100000 - depth; // 越早将杀越好
  if (status === "stalemate" || status === "draw-fifty" || status === "draw-material") return 0;
  if (depth === 0) {
    const raw = evaluate(position);
    return position.turn === "w" ? raw : -raw;
  }

  let best = -Infinity;
  for (const move of orderMoves(generateLegalMoves(position))) {
    const score = -negamax(applyMove(position, move), depth - 1, -beta, -alpha);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break; // 剪枝
  }
  return best === -Infinity ? 0 : best;
}

export type AiOptions = {
  level: AiLevel;
  /** 注入随机源，方便测试时固定结果 */
  random?: () => number;
};

/**
 * 选一步棋。没有合法走法（将杀/逼和）时返回 null ✓
 *
 * 第 1 档：在"能吃的子"里挑最值钱的（贪心），偶尔随机
 * 第 2/3 档：搜索 2/3 层，同分时随机挑一个（避免每盘都一样 ✓）
 */
export function pickAiMove(position: Position, options: AiOptions): Move | null {
  const random = options.random ?? Math.random;
  const moves = generateLegalMoves(position);
  if (moves.length === 0) return null;

  if (options.level === 1) {
    const captures = moves.filter((move) => move.captured);
    const pool = captures.length > 0 && random() < 0.8 ? captures : moves;
    const best = pool.reduce((top, move) => {
      const value = move.captured ? PIECE_VALUE[typeOf(move.captured)!] : 0;
      const topValue = top.captured ? PIECE_VALUE[typeOf(top.captured)!] : 0;
      return value > topValue ? move : top;
    }, pool[0]);
    return best;
  }

  const depth = options.level === 3 ? 3 : 2;
  const scored = orderMoves(moves).map((move) => ({
    move,
    score: -negamax(applyMove(position, move), depth - 1, -Infinity, Infinity),
  }));

  const bestScore = Math.max(...scored.map((entry) => entry.score));
  // 同分（含"都看不出来"的情况）时随机挑，避免每次都走同一盘 ✓
  const tied = scored.filter((entry) => entry.score >= bestScore - 1);
  return tied[Math.floor(random() * tied.length)]?.move ?? scored[0].move;
}
