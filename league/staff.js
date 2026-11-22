/* Factory settings: the people besides the players. Data only (CC0), plus one pure helper.
 * Content for the picture and the booth: nothing here changes a game (rule 10), the engine
 * never reads this file, and there are no tendencies, zones or ejections on purpose.
 *
 * STAFF: per team a manager, a pitching coach, a first-base coach and a third-base coach.
 *        id `<team>-<role>` is stable; role is one of the keys of ROLES; line = one short
 *        on-air line of character in the spirit of the team name (the animal and the job).
 * UMPIRES: the league pool of 8; years = seasons of service.
 * crewFor(seed): the four umpires of a game from its seed (pure, seeded, no clock).
 * Names come from league/tools/names.mjs (--staff): market names of the birth decade,
 * filtered against the real-athlete, coach and umpire blocklist; tests/names.check.mjs. */
export const ROLES = { manager: '總教練', pitching: '投手教練', first: '一壘指導教練', third: '三壘指導教練' };
export const CREW_POSITIONS = ['plate', 'first', 'second', 'third'];
export const CREW_LABELS = { plate: '主審', first: '一壘審', second: '二壘審', third: '三壘審' };

export const STAFF = [
  /* pheasants */
  {id: "pheasants-manager", name: "劉智偉", team: "pheasants", role: "manager", num: 80, age: 56, line: "換投前一定先按計算機，說牛棚也要算利息。"},
  {id: "pheasants-pitching", name: "陳建志", team: "pheasants", role: "pitching", num: 81, age: 49, line: "把投手的球數當分期付款，一局繳一點，從不提前清償。"},
  {id: "pheasants-first", name: "周志豪", team: "pheasants", role: "first", num: 86, age: 41, line: "跑者站上一壘，他就拍拍肩膀說「頭期款付了」。"},
  {id: "pheasants-third", name: "游俊傑", team: "pheasants", role: "third", num: 88, age: 45, line: "揮手送跑者回本壘時，嘴裡一直念「繳清、繳清」。"},
  /* owls */
  {id: "owls-manager", name: "廖志強", team: "owls", role: "manager", num: 77, age: 52, line: "凌晨三點還在看影片，頭一轉就看得到身後的牛棚。"},
  {id: "owls-pitching", name: "陳俊宏", team: "owls", role: "pitching", num: 81, age: 47, line: "走上投手丘的第一句話永遠是「你昨晚睡幾個小時？」"},
  {id: "owls-first", name: "陳家豪", team: "owls", role: "first", num: 88, age: 38, line: "記得每個投手牽制前眨幾次眼，自稱夜班監控。"},
  {id: "owls-third", name: "林冠宇", team: "owls", role: "third", num: 89, age: 44, line: "暗號一晚改三版，問他就說是版本更新。"},
  /* macaques */
  {id: "macaques-manager", name: "游文雄", team: "macaques", role: "manager", num: 77, age: 61, line: "抗議從不大吼，只是慢慢走出去，雙手插腰站滿三十秒。"},
  {id: "macaques-pitching", name: "羅俊宏", team: "macaques", role: "pitching", num: 80, age: 54, line: "上投手丘先把投手的帽簷壓正，說氣勢要先整理好。"},
  {id: "macaques-first", name: "蕭建宏", team: "macaques", role: "first", num: 83, age: 43, line: "一壘邊話最多的人，連對手的一壘手都被他逗笑。"},
  {id: "macaques-third", name: "黃信宏", team: "macaques", role: "third", num: 86, age: 39, line: "手勢大到外野看台都看得懂，要不要衝本壘全場先知道。"},
  /* muntjacs */
  {id: "muntjacs-manager", name: "王文雄", team: "muntjacs", role: "manager", num: 76, age: 58, line: "白天比賽一律戴墨鏡，說是光線太刺眼，從不解釋為什麼。"},
  {id: "muntjacs-pitching", name: "張志宏", team: "muntjacs", role: "pitching", num: 77, age: 50, line: "上投手丘講話很小聲，因為他自己也怕吵。"},
  {id: "muntjacs-first", name: "詹彥廷", team: "muntjacs", role: "first", num: 89, age: 42, line: "跑者一上壘就遞上一瓶運動飲料，自己也順便喝一瓶。"},
  {id: "muntjacs-third", name: "陳志強", team: "muntjacs", role: "third", num: 91, age: 47, line: "山羌一受驚就跳，他一看到跑者起跑也跟著跳。"},
];

export const UMPIRES = [
  {id: "ump-1", name: "謝俊雄", num: 3, age: 59, years: 31, line: "好球帶穩到被叫「水平儀」，下場一律走直線。"},
  {id: "ump-2", name: "陳文傑", num: 8, age: 55, years: 27, line: "宣判三振的動作像拉弓，全場都在等他放箭。"},
  {id: "ump-3", name: "陳志宏", num: 12, age: 51, years: 22, line: "從不跟教練爭辯，只說一句「我看到了」，然後轉身。"},
  {id: "ump-4", name: "李志偉", num: 19, age: 48, years: 19, line: "年輕時練田徑，跑壘判決常常比球先到位。"},
  {id: "ump-5", name: "施彥廷", num: 21, age: 45, years: 15, line: "每次換局都要把本壘板擦到發亮才肯蹲下。"},
  {id: "ump-6", name: "張建良", num: 26, age: 41, years: 12, line: "喊「出局」的聲音全場最大，外野最後一排也聽得到。"},
  {id: "ump-7", name: "郭家銘", num: 30, age: 37, years: 8, line: "記性最好，說得出哪個打者哪一年對哪一球抱怨過。"},
  {id: "ump-8", name: "郭冠傑", num: 36, age: 33, years: 4, line: "最資淺，每場賽前都把規則書翻到同一頁再看一次。"},
];

export const staffOf = team => STAFF.filter(s => s.team === team);
export const umpire = id => UMPIRES.find(u => u.id === id) || null;

/* mulberry32 on the game seed: same seed, same crew, on every machine. */
const CREW_SALT = 0x5f3759df;
export function crewFor(seed) {
  let s = (Number(seed) ^ CREW_SALT) | 0;
  const r = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const ids = UMPIRES.map(u => u.id);
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  return Object.fromEntries(CREW_POSITIONS.map((pos, i) => [pos, ids[i]]));
}
