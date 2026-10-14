/**
 * 国际象棋引擎（纯逻辑，无 UI 依赖）
 *
 * 为什么单独一层：走子规则是最容易写错的地方（王车易位、吃过路兵、升变、将杀判定…），
 * 放在纯函数里就能用国际象棋界公认的 **perft** 测试来验证正确性 ✓
 * （perft = 从某个局面出发，按规则枚举到指定深度，数一共有多少条合法走法；
 *   初始局面的标准答案是 20 / 400 / 8902 / 197281，对不上就说明规则有 bug ✗）
 *
 * 坐标约定：索引 0 = a8，7 = h8，56 = a1，63 = h1（也就是"从左上到右下"读棋盘 ✓）
 *          row = Math.floor(i / 8)，col = i % 8；col 0 = a 列，row 0 = 第 8 横排
 */

export type Color = "w" | "b";
export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";

/** 棋盘格上的内容："P" 白兵 / "p" 黑兵 / null 空 */
export type SquareContent = string | null;

export type Position = {
  /** 64 格，索引 0 = a8 ✓ */
  board: SquareContent[];
  /** 轮到谁走 */
  turn: Color;
  /** 易位权：K=白王翼 Q=白后翼 k=黑王翼 q=黑后翼，如 "KQkq" */
  castling: string;
  /** 吃过路兵的目标格（上一步刚走了两格兵），没有就是 null */
  ep: number | null;
  /** 距上次吃子/走兵的半回合数（50 回合和棋用） */
  halfmove: number;
  /** 回合数（从 1 开始） */
  fullmove: number;
};

export type Move = {
  from: number;
  to: number;
  /** 走的棋子（"P" / "n" 这样） */
  piece: string;
  /** 被吃的棋子（吃过路兵时是被吃的兵，不是落点上的东西） */
  captured?: string;
  /** 升变目标：q / r / b / n */
  promotion?: PieceType;
  /** 王车易位：K = 王翼（短），Q = 后翼（长） */
  castle?: "K" | "Q";
  /** 是否吃过路兵 */
  enPassant?: boolean;
};

export type GameStatus =
  | "playing"
  | "check"
  | "checkmate"
  | "stalemate"
  | "draw-fifty"
  | "draw-material";

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const FILES = "abcdefgh";

/** 棋子值（给 AI 评估用；王给一个很大的值） */
export const PIECE_VALUE: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

// ---------------------------------------------------------------------------
// 基础工具
// ---------------------------------------------------------------------------

export function rowOf(square: number): number {
  return Math.floor(square / 8);
}

export function colOf(square: number): number {
  return square % 8;
}

/** 0 → "a8"，63 → "h1" */
export function squareName(square: number): string {
  return `${FILES[colOf(square)]}${8 - rowOf(square)}`;
}

/** "e4" → 索引；不合法返回 null */
export function parseSquare(name: string): number | null {
  const match = /^([a-h])([1-8])$/.exec(name.trim().toLowerCase());
  if (!match) return null;
  const col = FILES.indexOf(match[1]);
  const row = 8 - Number(match[2]);
  return row * 8 + col;
}

export function colorOf(piece: SquareContent): Color | null {
  if (!piece) return null;
  return piece === piece.toUpperCase() ? "w" : "b";
}

export function typeOf(piece: SquareContent): PieceType | null {
  if (!piece) return null;
  return piece.toLowerCase() as PieceType;
}

export function opposite(color: Color): Color {
  return color === "w" ? "b" : "w";
}

export function initialPosition(): Position {
  return fromFen(START_FEN);
}

/** 深拷贝一个局面（引擎里所有修改都返回新对象，不改原局面 ✓） */
export function clonePosition(position: Position): Position {
  return {
    board: position.board.slice(),
    turn: position.turn,
    castling: position.castling,
    ep: position.ep,
    halfmove: position.halfmove,
    fullmove: position.fullmove,
  };
}

// ---------------------------------------------------------------------------
// FEN 读写（用于存档、在线对战同步、以及 perft 测试）
// ---------------------------------------------------------------------------

export function fromFen(fen: string): Position {
  const parts = fen.trim().split(/\s+/);
  const [placement, turn = "w", castling = "-", ep = "-", halfmove = "0", fullmove = "1"] = parts;

  const board: SquareContent[] = new Array(64).fill(null);
  let index = 0;
  for (const char of placement) {
    if (char === "/") continue;
    if (/[1-8]/.test(char)) {
      index += Number(char);
      continue;
    }
    board[index] = char;
    index += 1;
  }
  if (index !== 64) throw new Error(`FEN 解析失败：棋盘格数不对（${index}）`);

  return {
    board,
    turn: turn === "b" ? "b" : "w",
    castling: castling === "-" ? "" : castling,
    ep: ep === "-" ? null : parseSquare(ep),
    halfmove: Number(halfmove) || 0,
    fullmove: Number(fullmove) || 1,
  };
}

export function toFen(position: Position): string {
  const rows: string[] = [];
  for (let row = 0; row < 8; row++) {
    let line = "";
    let empty = 0;
    for (let col = 0; col < 8; col++) {
      const piece = position.board[row * 8 + col];
      if (!piece) {
        empty += 1;
        continue;
      }
      if (empty > 0) {
        line += String(empty);
        empty = 0;
      }
      line += piece;
    }
    if (empty > 0) line += String(empty);
    rows.push(line);
  }

  return [
    rows.join("/"),
    position.turn,
    position.castling === "" ? "-" : position.castling,
    position.ep === null ? "-" : squareName(position.ep),
    String(position.halfmove),
    String(position.fullmove),
  ].join(" ");
}

// ---------------------------------------------------------------------------
// 走子生成
// ---------------------------------------------------------------------------

const KNIGHT_STEPS = [
  [-2, -1],
  [-2, 1],
  [-1, -2],
  [-1, 2],
  [1, -2],
  [1, 2],
  [2, -1],
  [2, 1],
];

const BISHOP_DIRS = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

const ROOK_DIRS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

const KING_DIRS = [...BISHOP_DIRS, ...ROOK_DIRS];

function inside(row: number, col: number): boolean {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

/** 找王的位置（找不到返回 -1；perft 的测试局面一定有王 ✓） */
export function findKing(position: Position, color: Color): number {
  const target = color === "w" ? "K" : "k";
  return position.board.indexOf(target);
}

/** 某个格子是否被 byColor 攻击（不算"王不能走到被攻击格"这层，那层由合法性检查处理） */
export function isSquareAttacked(position: Position, square: number, byColor: Color): boolean {
  const row = rowOf(square);
  const col = colOf(square);

  // 兵：白兵向上（row-1）攻击，黑兵向下（row+1）攻击
  const pawnRow = byColor === "w" ? row + 1 : row - 1;
  const pawn = byColor === "w" ? "P" : "p";
  for (const dc of [-1, 1]) {
    if (inside(pawnRow, col + dc) && position.board[pawnRow * 8 + col + dc] === pawn) return true;
  }

  // 马
  const knight = byColor === "w" ? "N" : "n";
  for (const [dr, dc] of KNIGHT_STEPS) {
    const r = row + dr;
    const c = col + dc;
    if (inside(r, c) && position.board[r * 8 + c] === knight) return true;
  }

  // 王（相邻）
  const king = byColor === "w" ? "K" : "k";
  for (const [dr, dc] of KING_DIRS) {
    const r = row + dr;
    const c = col + dc;
    if (inside(r, c) && position.board[r * 8 + c] === king) return true;
  }

  // 车/后（直线）
  const rook = byColor === "w" ? "R" : "r";
  const queen = byColor === "w" ? "Q" : "q";
  for (const [dr, dc] of ROOK_DIRS) {
    let r = row + dr;
    let c = col + dc;
    while (inside(r, c)) {
      const piece = position.board[r * 8 + c];
      if (piece) {
        if (piece === rook || piece === queen) return true;
        break;
      }
      r += dr;
      c += dc;
    }
  }

  // 象/后（斜线）
  const bishop = byColor === "w" ? "B" : "b";
  for (const [dr, dc] of BISHOP_DIRS) {
    let r = row + dr;
    let c = col + dc;
    while (inside(r, c)) {
      const piece = position.board[r * 8 + c];
      if (piece) {
        if (piece === bishop || piece === queen) return true;
        break;
      }
      r += dr;
      c += dc;
    }
  }

  return false;
}

export function isInCheck(position: Position, color: Color): boolean {
  const king = findKing(position, color);
  if (king < 0) return false;
  return isSquareAttacked(position, king, opposite(color));
}

/** 生成"伪合法"走法（不检查走后自己是否被将军） */
function generatePseudoMoves(position: Position): Move[] {
  const moves: Move[] = [];
  const color = position.turn;

  for (let from = 0; from < 64; from++) {
    const piece = position.board[from];
    if (!piece || colorOf(piece) !== color) continue;

    const type = typeOf(piece)!;
    const row = rowOf(from);
    const col = colOf(from);

    const add = (to: number, extra: Partial<Move> = {}) => {
      const target = position.board[to];
      moves.push({
        from,
        to,
        piece,
        captured: target ?? undefined,
        ...extra,
      });
    };

    if (type === "p") {
      const dir = color === "w" ? -1 : 1;
      const startRow = color === "w" ? 6 : 1;
      const promoRow = color === "w" ? 0 : 7;

      // 前进一格
      const oneRow = row + dir;
      if (inside(oneRow, col) && !position.board[oneRow * 8 + col]) {
        const to = oneRow * 8 + col;
        if (oneRow === promoRow) {
          for (const promotion of ["q", "r", "b", "n"] as PieceType[]) add(to, { promotion });
        } else {
          add(to);
        }

        // 前进两格（只在起始横排、且中间是空的）
        const twoRow = row + dir * 2;
        if (row === startRow && inside(twoRow, col) && !position.board[twoRow * 8 + col]) {
          add(twoRow * 8 + col);
        }
      }

      // 吃子（斜前方）
      for (const dc of [-1, 1]) {
        const r = row + dir;
        const c = col + dc;
        if (!inside(r, c)) continue;
        const to = r * 8 + c;
        const target = position.board[to];
        if (target && colorOf(target) !== color) {
          if (r === promoRow) {
            for (const promotion of ["q", "r", "b", "n"] as PieceType[]) add(to, { promotion });
          } else {
            add(to);
          }
        } else if (!target && position.ep !== null && to === position.ep) {
          // 吃过路兵：落点是空的，但旁边那个兵要被拿掉
          const capturedSquare = color === "w" ? to + 8 : to - 8;
          moves.push({
            from,
            to,
            piece,
            captured: position.board[capturedSquare] ?? undefined,
            enPassant: true,
          });
        }
      }
      continue;
    }

    if (type === "n") {
      for (const [dr, dc] of KNIGHT_STEPS) {
        const r = row + dr;
        const c = col + dc;
        if (!inside(r, c)) continue;
        const to = r * 8 + c;
        const target = position.board[to];
        if (!target || colorOf(target) !== color) add(to);
      }
      continue;
    }

    if (type === "k") {
      for (const [dr, dc] of KING_DIRS) {
        const r = row + dr;
        const c = col + dc;
        if (!inside(r, c)) continue;
        const to = r * 8 + c;
        const target = position.board[to];
        if (!target || colorOf(target) !== color) add(to);
      }

      // 王车易位：王和车都没动过、中间是空的、且王不在被将军的状态、经过的格子不被攻击
      const homeRow = color === "w" ? 7 : 0;
      const kingSquare = homeRow * 8 + 4;
      if (from === kingSquare && !isInCheck(position, color)) {
        const kingSide = color === "w" ? "K" : "k";
        const queenSide = color === "w" ? "Q" : "q";
        const rook = color === "w" ? "R" : "r";

        if (
          position.castling.includes(kingSide) &&
          position.board[homeRow * 8 + 7] === rook &&
          !position.board[homeRow * 8 + 5] &&
          !position.board[homeRow * 8 + 6] &&
          !isSquareAttacked(position, homeRow * 8 + 5, opposite(color)) &&
          !isSquareAttacked(position, homeRow * 8 + 6, opposite(color))
        ) {
          moves.push({ from, to: homeRow * 8 + 6, piece, castle: "K" });
        }

        if (
          position.castling.includes(queenSide) &&
          position.board[homeRow * 8 + 0] === rook &&
          !position.board[homeRow * 8 + 1] &&
          !position.board[homeRow * 8 + 2] &&
          !position.board[homeRow * 8 + 3] &&
          !isSquareAttacked(position, homeRow * 8 + 3, opposite(color)) &&
          !isSquareAttacked(position, homeRow * 8 + 2, opposite(color))
        ) {
          moves.push({ from, to: homeRow * 8 + 2, piece, castle: "Q" });
        }
      }
      continue;
    }

    // 象 / 车 / 后：滑行
    const dirs = type === "b" ? BISHOP_DIRS : type === "r" ? ROOK_DIRS : KING_DIRS;
    for (const [dr, dc] of dirs) {
      let r = row + dr;
      let c = col + dc;
      while (inside(r, c)) {
        const to = r * 8 + c;
        const target = position.board[to];
        if (!target) {
          add(to);
        } else {
          if (colorOf(target) !== color) add(to);
          break;
        }
        r += dr;
        c += dc;
      }
    }
  }

  return moves;
}

/** 走一步（返回新局面，不修改原局面） */
export function applyMove(position: Position, move: Move): Position {
  const next = clonePosition(position);
  const color = position.turn;
  const type = typeOf(move.piece)!;

  next.board[move.from] = null;

  // 吃过路兵：被吃的兵不在落点上
  if (move.enPassant) {
    const capturedSquare = color === "w" ? move.to + 8 : move.to - 8;
    next.board[capturedSquare] = null;
  }

  next.board[move.to] = move.promotion
    ? color === "w"
      ? move.promotion.toUpperCase()
      : move.promotion
    : move.piece;

  // 王车易位：车也要跟着挪
  if (move.castle) {
    const homeRow = color === "w" ? 7 : 0;
    const rook = color === "w" ? "R" : "r";
    if (move.castle === "K") {
      next.board[homeRow * 8 + 5] = rook;
      next.board[homeRow * 8 + 7] = null;
    } else {
      next.board[homeRow * 8 + 3] = rook;
      next.board[homeRow * 8 + 0] = null;
    }
  }

  // 更新易位权：王动了就全部失效；车离开原位则该侧失效；车被吃也失效
  let castling = next.castling;
  const drop = (chars: string) => {
    for (const char of chars) castling = castling.replace(char, "");
  };
  if (type === "k") drop(color === "w" ? "KQ" : "kq");
  if (move.from === 63 || move.to === 63) drop("K");
  if (move.from === 56 || move.to === 56) drop("Q");
  if (move.from === 7 || move.to === 7) drop("k");
  if (move.from === 0 || move.to === 0) drop("q");
  next.castling = castling;

  // 更新吃过路兵目标
  if (type === "p" && Math.abs(rowOf(move.to) - rowOf(move.from)) === 2) {
    next.ep = (rowOf(move.to) + rowOf(move.from)) / 2 * 8 + colOf(move.to);
  } else {
    next.ep = null;
  }

  next.halfmove = type === "p" || move.captured ? 0 : position.halfmove + 1;
  if (color === "b") next.fullmove = position.fullmove + 1;
  next.turn = opposite(color);

  return next;
}

/** 合法走法（过滤掉"走完自己被将军"的） */
export function generateLegalMoves(position: Position): Move[] {
  const color = position.turn;
  const legal: Move[] = [];
  for (const move of generatePseudoMoves(position)) {
    const after = applyMove(position, move);
    if (!isInCheck(after, color)) legal.push(move);
  }
  return legal;
}

/** perft：统计指定深度下的合法走法总数（用来验证规则实现是否正确 ✓） */
export function perft(position: Position, depth: number): number {
  if (depth === 0) return 1;
  const moves = generateLegalMoves(position);
  if (depth === 1) return moves.length;

  let total = 0;
  for (const move of moves) {
    total += perft(applyMove(position, move), depth - 1);
  }
  return total;
}

/** 双方是否只剩王（或王+单马/单象这种无法将杀的局面）→ 和棋 */
export function hasInsufficientMaterial(position: Position): boolean {
  const pieces = position.board.filter((piece): piece is string => Boolean(piece));
  const nonKings = pieces.filter((piece) => typeOf(piece) !== "k");
  if (nonKings.length === 0) return true;
  if (nonKings.length === 1) {
    const type = typeOf(nonKings[0]);
    return type === "n" || type === "b";
  }
  if (nonKings.length === 2) {
    // 双马，或一马一象，或双方各一个象（同色格）—— 简化处理：只认"双方各一个象/马"太复杂，
    // 这里保守一点：只有双马才算和棋（其余交给 50 回合规则）
    return nonKings.every((piece) => typeOf(piece) === "n");
  }
  return false;
}

export function getStatus(position: Position): GameStatus {
  const moves = generateLegalMoves(position);
  const inCheck = isInCheck(position, position.turn);

  if (moves.length === 0) return inCheck ? "checkmate" : "stalemate";
  if (position.halfmove >= 100) return "draw-fifty";
  if (hasInsufficientMaterial(position)) return "draw-material";
  return inCheck ? "check" : "playing";
}

/** 找到从 from 到 to 的合法走法（升变会有多条，返回数组） */
export function movesFrom(position: Position, from: number, to: number): Move[] {
  return generateLegalMoves(position).filter((move) => move.from === from && move.to === to);
}

/**
 * 人类可读的走法记法（简化版长代数记法 ✓ 不追求 SAN 的省略规则）
 * 例：e2-e4 / Ng1-f3 / e5xd6 / e7-e8=Q / O-O / O-O-O / +（将军）/ #（将杀）
 */
export function moveNotation(position: Position, move: Move): string {
  if (move.castle) {
    const base = move.castle === "K" ? "O-O" : "O-O-O";
    return base + suffix(position, move);
  }

  const type = typeOf(move.piece)!;
  const letter = type === "p" ? "" : type.toUpperCase();
  const from = squareName(move.from);
  const to = squareName(move.to);
  const separator = move.captured ? "x" : "-";
  const promotion = move.promotion ? `=${move.promotion.toUpperCase()}` : "";
  return `${letter}${from}${separator}${to}${promotion}${suffix(position, move)}`;
}

function suffix(position: Position, move: Move): string {
  const after = applyMove(position, move);
  if (isInCheck(after, after.turn)) {
    return generateLegalMoves(after).length === 0 ? "#" : "+";
  }
  return "";
}

/** 棋盘上每个格子的棋子（给 UI 用：返回 64 格的字符串数组，null 表示空） */
export function boardSnapshot(position: Position): SquareContent[] {
  return position.board.slice();
}

/** 从"国王被将军"的角度给出提示文案 */
export function describeStatus(status: GameStatus, turn: Color): string {
  const who = turn === "w" ? "白方" : "黑方";
  const other = turn === "w" ? "黑方" : "白方";
  switch (status) {
    case "checkmate":
      return `将杀！${other}获胜 ✓`;
    case "stalemate":
      return `逼和（${who}无子可动但未被将军）—— 和棋`;
    case "check":
      return `${who}被将军！`;
    case "draw-fifty":
      return "50 回合内没有吃子或走兵 —— 和棋";
    case "draw-material":
      return "子力不足以将杀 —— 和棋";
    default:
      return `${who}走棋`;
  }
}
