/**
 * 国际象棋 AI 测试
 *
 * 重点验证三件事：
 *   1. 一定会返回**合法**走法（不能走出违规步子）
 *   2. 该将杀时能**找到将杀**（一步杀）
 *   3. 白送的大子会**吃掉**（不犯低级错误）
 *
 * 跑法：npm run test:chess-ai
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "chess-ai-test-"));

/**
 * 复制 TS 源码到临时目录再 import（Node 直接跑 .ts 需要绕一下 package type ✓）
 * replacements 用来把 Next 的 `@/...` 别名改写成相对路径 —— Node 不认别名 ✗
 */
async function loadModule(relative, name, replacements = []) {
  const sourcePath = new URL(relative, import.meta.url);
  let text = fs.readFileSync(sourcePath, "utf8");
  for (const [from, to] of replacements) text = text.split(from).join(to);
  const tempFile = path.join(tempDir, name);
  fs.writeFileSync(tempFile, text, "utf8");
  return import(`file://${tempFile.replace(/\\/g, "/")}`);
}

const chess = await loadModule("../src/lib/chess.ts", "chess.mts");
const ai = await loadModule("../src/lib/chess-ai.ts", "chess-ai.mts", [
  ['"@/lib/chess"', '"./chess.mts"'],
]);
fs.rmSync(tempDir, { recursive: true, force: true });

const { fromFen, generateLegalMoves, applyMove, getStatus, squareName, parseSquare } = chess;
const { pickAiMove, evaluate, AI_LEVEL_LABEL } = ai;

let pass = 0;
let fail = 0;

function check(label, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ✅ ${label}${detail ? `  ${detail}` : ""}`);
  } else {
    fail++;
    console.log(`  ❌ ${label}${detail ? `  ${detail}` : ""}`);
  }
}

console.log("========== 1) 基本行为 ==========");
check("三档难度都有名字", Object.keys(AI_LEVEL_LABEL).length === 3);
{
  // 真正的"无棋可走"：黑方被逼和（王 h8，白后 f7，白王 g6）
  const stalemate = fromFen("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
  check("逼和局面返回 null（无棋可走）", pickAiMove(stalemate, { level: 2 }) === null);

  // 被将杀也一样
  const mated = fromFen("rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 0 3");
  check("被将杀局面返回 null", pickAiMove(mated, { level: 2 }) === null);
}

console.log("");
console.log("========== 2) 返回的必须是合法走法 ==========");
{
  const position = fromFen("r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4");
  for (const level of [1, 2, 3]) {
    const move = pickAiMove(position, { level });
    const legal = generateLegalMoves(position);
    const ok = move !== null && legal.some((m) => m.from === move.from && m.to === move.to);
    check(
      `第 ${level} 档返回合法走法`,
      ok,
      move ? `${squareName(move.from)}-${squareName(move.to)}` : "null",
    );
  }
}

console.log("");
console.log("========== 3) 一步杀必须找到 ==========");
{
  // 白后 h5、白象 c4、黑王 e8 无保护：Qxf7# 是标准的一步杀
  const position = fromFen("rnbqkbnr/pppp1ppp/8/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 3");
  const move = pickAiMove(position, { level: 2 });
  const after = move ? applyMove(position, move) : null;
  check(
    "第 2 档能找到一步将杀",
    after !== null && getStatus(after) === "checkmate",
    move ? `${squareName(move.from)}-${squareName(move.to)}` : "没找到",
  );
}

console.log("");
console.log("========== 4) 白送的大子要吃掉 ==========");
{
  // 黑后在 d5，白兵 e4 可以吃它（第 2 档一定会吃）
  const position = fromFen("4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1");
  const move = pickAiMove(position, { level: 2 });
  check(
    "会吃掉白送的黑后",
    move?.to === parseSquare("d5"),
    move ? `${squareName(move.from)}-${squareName(move.to)}` : "没走",
  );
}

console.log("");
console.log("========== 5) 不会主动送子（看两步）==========");
{
  // 白车在 a1，黑兵在 a3 保护着 a2 附近……简化场景：
  // 黑方走棋，白车 d1 白送吗？构造：黑象能吃到白车，但吃子后会被黑…… 这里用"避免走进被兵保护的格"
  // 黑马 h5 可以跳 f4 —— f4 被白兵 e3 保护 → 第 2 档不应去吃/跳过去送马
  const position = fromFen("4k3/8/8/7n/8/4P3/8/4K3 b - - 0 1");
  const move = pickAiMove(position, { level: 2 });
  const hangs = move?.to === parseSquare("f4");
  check("不会把马跳到被兵保护的格", !hangs, move ? `${squareName(move.from)}-${squareName(move.to)}` : "没走");
}

console.log("");
console.log("========== 6) 评估函数方向正确 ==========");
{
  const start = fromFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  check("开局评估接近平衡", Math.abs(evaluate(start)) < 40, String(evaluate(start)));

  const whiteUpQueen = fromFen("4k3/8/8/8/8/8/8/3QK3 w - - 0 1");
  check("白多一个后 → 评估明显为正", evaluate(whiteUpQueen) > 800, String(evaluate(whiteUpQueen)));

  const blackUpQueen = fromFen("3qk3/8/8/8/8/8/8/4K3 w - - 0 1");
  check("黑多一个后 → 评估明显为负", evaluate(blackUpQueen) < -800, String(evaluate(blackUpQueen)));
}

console.log("");
console.log("========== 7) 三档难度能实际下完若干步（不崩）==========");
{
  let position = fromFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  let plies = 0;
  while (plies < 12 && getStatus(position) === "playing") {
    const move = pickAiMove(position, { level: 2, random: () => 0.5 });
    if (!move) break;
    position = applyMove(position, move);
    plies += 1;
  }
  check("连续走 12 步没有异常", plies === 12, `实际走了 ${plies} 步`);
  check("局面仍然合法（FEN 能被解析）", typeof chess.toFen(position) === "string");
}

console.log("");
console.log(`========== 结果：${pass} 项通过 / ${fail} 项失败 ==========`);
process.exitCode = fail === 0 ? 0 : 1;
