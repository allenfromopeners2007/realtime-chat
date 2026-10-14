/**
 * 国际象棋引擎测试
 *
 * 核心手段是 **perft**：从某个局面出发按规则枚举到指定深度，数总共多少条合法走法。
 * 这些数字是国际象棋界几十年公认的标准答案 ✓ 对不上就说明规则实现有 bug ✗
 * （比"自己写几个断言"可信得多 —— 尤其是王车易位、吃过路兵、升变这些易错点 ✓）
 *
 * 跑法：npm run test:chess
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const sourcePath = new URL("../src/lib/chess.ts", import.meta.url);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "chess-test-"));
const tempFile = path.join(tempDir, "chess.mts");
fs.copyFileSync(sourcePath, tempFile);
const chess = await import(`file://${tempFile.replace(/\\/g, "/")}`);
fs.rmSync(tempDir, { recursive: true, force: true });

const {
  START_FEN,
  initialPosition,
  fromFen,
  toFen,
  generateLegalMoves,
  perft,
  applyMove,
  isInCheck,
  getStatus,
  squareName,
  parseSquare,
  moveNotation,
  movesFrom,
} = chess;

let pass = 0;
let fail = 0;
let failedPerft = false;

function check(label, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ✅ ${label}${detail ? `  ${detail}` : ""}`);
  } else {
    fail++;
    console.log(`  ❌ ${label}${detail ? `  ${detail}` : ""}`);
  }
}

console.log("========== 1) 坐标系与 FEN ==========");
check('0 → a8', squareName(0) === "a8", squareName(0));
check('63 → h1', squareName(63) === "h1", squareName(63));
check('e4 → 36', parseSquare("e4") === 36, String(parseSquare("e4")));
check("非法格子名返回 null", parseSquare("z9") === null);
{
  const position = initialPosition();
  check("初始局面 FEN 往返一致", toFen(position) === START_FEN, toFen(position));
  check("白方先走", position.turn === "w");
  check("初始 32 个棋子", position.board.filter(Boolean).length === 32);
  check("初始走法 20 条", generateLegalMoves(position).length === 20);
}

console.log("");
console.log("========== 2) perft：初始局面（标准答案）==========");
{
  const position = initialPosition();
  const cases = [
    [1, 20],
    [2, 400],
    [3, 8902],
  ];
  for (const [depth, expected] of cases) {
    const actual = perft(position, depth);
    check(`depth ${depth} = ${expected}`, actual === expected, `实际 ${actual}`);
    if (actual !== expected) failedPerft = true;
  }
}

console.log("");
console.log("========== 3) perft：Kiwipete（复杂局面，专考易位/吃过路兵）==========");
{
  // 这是国际象棋编程界最经典的中局测试局面
  const kiwipete = fromFen("r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1");
  const cases = [
    [1, 48],
    [2, 2039],
  ];
  for (const [depth, expected] of cases) {
    const started = Date.now();
    const actual = perft(kiwipete, depth);
    const ms = Date.now() - started;
    check(`depth ${depth} = ${expected}`, actual === expected, `实际 ${actual}（${ms}ms）`);
    if (actual !== expected) failedPerft = true;
  }
}

console.log("");
console.log("========== 4) 王车易位 ==========");
{
  const base = fromFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
  const moves = generateLegalMoves(base);
  const castles = moves.filter((move) => move.castle);
  check("白方两侧都能易位", castles.length === 2, castles.map((m) => m.castle).join(","));

  const afterKing = applyMove(base, { from: 60, to: 61, piece: "K" });
  check("王动过之后易位权消失", afterKing.castling === "kq", afterKing.castling);

  // 后翼被自己的后挡住 → 长易位不合法，但短易位仍然可以
  const blocked = fromFen("r3k2r/8/8/8/8/8/8/R2QK2R w KQkq - 0 1");
  {
    const blockedCastles = generateLegalMoves(blocked).filter((move) => move.castle);
    check(
      "后翼被自己的后挡住 → 只能短易位",
      blockedCastles.length === 1 && blockedCastles[0].castle === "K",
      blockedCastles.map((m) => m.castle).join(",") || "一个都不能易位",
    );
  }

  // 王的必经格被攻击 → 不能易位
  const attacked = fromFen("4k3/8/8/8/8/8/6r1/R3K2R w KQ - 0 1");
  check(
    "王翼被攻击时不能短易位",
    generateLegalMoves(attacked).filter((move) => move.castle === "K").length === 0,
  );

  // 易位后车也要挪到位
  const castleMove = castles.find((move) => move.castle === "K");
  const castled = applyMove(base, castleMove);
  check("短易位后车到 f1", castled.board[61] === "R" && castled.board[63] === null, squareName(61));
}

console.log("");
console.log("========== 5) 吃过路兵 ==========");
{
  // 白兵 e5，黑兵刚走 d7-d5
  const position = fromFen("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1");
  const ep = generateLegalMoves(position).filter((move) => move.enPassant);
  check("能吃过路兵", ep.length === 1, `找到 ${ep.length} 条`);
  if (ep[0]) {
    const after = applyMove(position, ep[0]);
    check("被吃的兵从 d5 消失", after.board[parseSquare("d5")] === null);
    check("白兵落到 d6", after.board[parseSquare("d6")] === "P");
  }
}

console.log("");
console.log("========== 6) 升变 ==========");
{
  const position = fromFen("4k3/1P6/8/8/8/8/8/4K3 w - - 0 1");
  const promos = generateLegalMoves(position).filter((move) => move.from === parseSquare("b7"));
  check("升变有 4 种选择", promos.length === 4, promos.map((m) => m.promotion).join(","));
  const queen = promos.find((move) => move.promotion === "q");
  const after = applyMove(position, queen);
  check("升变成后", after.board[parseSquare("b8")] === "Q", after.board[parseSquare("b8")] ?? "空");
}

console.log("");
console.log("========== 7) 将杀 / 逼和 / 将军 ==========");
{
  // 傻瓜杀：1. f3 e5 2. g4 Qh4#
  let position = initialPosition();
  const play = (from, to) => {
    const move = movesFrom(position, parseSquare(from), parseSquare(to))[0];
    position = applyMove(position, move);
    return move;
  };
  play("f2", "f3");
  play("e7", "e5");
  play("g2", "g4");
  const beforeMate = position; // 黑后还在 d8 —— 记法要在走子【之前】的局面里算 ✓
  const mate = play("d8", "h4");
  check("傻瓜杀被识别为将杀", getStatus(position) === "checkmate", getStatus(position));
  check(
    "记法带 # 号",
    moveNotation(beforeMate, mate).endsWith("#"),
    moveNotation(beforeMate, mate),
  );

  // 经典逼和局面：黑王 h8，白后 f7，白王 g6
  const stalemate = fromFen("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
  check("逼和被识别", getStatus(stalemate) === "stalemate", getStatus(stalemate));
  check("逼和时并未被将军", isInCheck(stalemate, "b") === false);

  // 将军但仍有解
  const checkPosition = fromFen("4k3/8/8/8/8/8/4r3/4K3 w - - 0 1");
  check("将军被识别", getStatus(checkPosition) === "check", getStatus(checkPosition));
}

console.log("");
console.log("========== 8) 和棋规则 ==========");
{
  check("只剩双方王 → 和棋", getStatus(fromFen("4k3/8/8/8/8/8/8/4K3 w - - 0 1")) === "draw-material");
  check("王+单马 → 和棋", getStatus(fromFen("4k3/8/8/8/8/8/8/N3K3 w - - 0 1")) === "draw-material");
  check(
    "50 回合规则 → 和棋",
    getStatus(fromFen("4k3/8/8/8/8/8/4R3/4K3 w - - 100 80")) === "draw-fifty",
  );
}

console.log("");
console.log("========== 9) 记法与合法性 ==========");
{
  const position = initialPosition();
  const e4 = movesFrom(position, parseSquare("e2"), parseSquare("e4"))[0];
  check("兵走子记法 e2-e4", moveNotation(position, e4) === "e2-e4", moveNotation(position, e4));

  const knight = movesFrom(position, parseSquare("g1"), parseSquare("f3"))[0];
  check("马走子记法 Ng1-f3", moveNotation(position, knight) === "Ng1-f3", moveNotation(position, knight));

  check(
    "不能走非法步子（e2-e5）",
    movesFrom(position, parseSquare("e2"), parseSquare("e5")).length === 0,
  );
  check(
    "不能跳过自己的子（c1-c3 被 b2 挡）",
    movesFrom(position, parseSquare("c1"), parseSquare("c3")).length === 0,
  );
}

console.log("");
console.log(`========== 结果：${pass} 项通过 / ${fail} 项失败 ==========`);
if (failedPerft) {
  console.log("⚠️ perft 对不上 → 走子规则一定有 bug，必须先修引擎 ✗");
}
process.exitCode = fail === 0 ? 0 : 1;
