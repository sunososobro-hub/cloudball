/* 九宮格棒球 screen text (#332 part 2): pure helpers, no DOM. One line per pitch outcome of practice.js. */
import { PT, MODE } from './practice.js';

export const KIND_TEXT = {
  called: '好球，沒揮', ball: '壞球', whiff: '揮空', foul: '界外', foulBunt: '觸擊界外', popup: '觸擊變小飛球',
  bunt: '觸擊送出去了',
};
export const TIER_TEXT = { full: '完整達成', half: '達成一半' };

/** A short line for one pitch result `out` of practice.js; `side` is 'bat' | 'pitch'. */
export function describeOutcome(out, side, hitQ) {
  const pitch = PT[out.pt] ? PT[out.pt].n : out.pt;
  let line = KIND_TEXT[out.kind];
  if (out.kind === 'contact') line = out.q >= hitQ ? '擊中，漂亮的安打' : '擊中，但球被接住';
  if (!line) line = out.kind;
  const where = out.missed ? '（投偏了）' : '';
  return side === 'bat' ? `${pitch}${where}：${line}` : `你投${pitch}${where}：${line}`;
}

export const modeName = mode => MODE[mode] || mode;

/** The end-of-session line from a result object {side, mode, hits, pitches, tier}. */
export function describeResult(r) {
  const what = r.side === 'bat' ? '打擊' : '投球';
  const unit = r.side === 'bat' ? '安打' : '成功';
  return `${what}練習結束：${r.pitches} 球 ${r.hits} ${unit}，${TIER_TEXT[r.tier] || r.tier}`;
}

/* part 3c-2: text for the 3-inning game screen (state S of game.js); pure, no DOM. */
const TEAM_NAME = ['你的隊', '電腦隊'];
export const canSteal = S => !!((S.bases[1] && !S.bases[2]) || (S.bases[0] && !S.bases[1]));
export const describeHalf = S => `第 ${(S.half >> 1) + 1} 局${S.half % 2 ? '下' : '上'}（${S.half % 2 ? '你守備' : '你打擊'}）`;
export const describeBases = bases => `壘上：${['一', '二', '三'].map((n, i) => `${n}壘${bases[i] ? '●' : '○'}`).join(' ')}`;
export const describeCount = S => `${S.balls} 壞 ${S.strikes} 好 ${S.outs} 出局`;
export const describeScore = S => `${TEAM_NAME[0]} ${S.score[0]} : ${S.score[1]} ${TEAM_NAME[1]}`;
/** Line score, one row per team: "你的隊  0 2 1 | 3". */
export const describeLine = S => S.line.map((l, i) => `${TEAM_NAME[i]}　${l.join(' ')}　＝ ${S.score[i]}`).join('\n');
export function describeGameResult(res) {
  const who = res.winner === -1 ? '平手' : res.winner === 0 ? '你贏了！' : '電腦隊贏了';
  return `比賽結束：${res.score[0]} 比 ${res.score[1]}，${who}`;
}
