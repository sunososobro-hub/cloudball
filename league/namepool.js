/* Name pool of league people (CC0): surnames and given names by birth decade. Pure data, no imports,
 * read by league/tools/names.mjs (factory names, run by hand) and league/freeagents.js (free-agent names, #178).
 * Sources and edition: league/tools/README.md. */
/* Surnames in the MOI frequency order with approximate population shares (per mille). */
export const SURNAMES = [
  ['陳', 111], ['林', 83], ['黃', 60], ['張', 53], ['李', 51], ['王', 41], ['吳', 40], ['劉', 32], ['蔡', 29], ['楊', 26],
  ['許', 23], ['鄭', 19], ['謝', 19], ['郭', 17], ['洪', 16], ['曾', 15], ['邱', 15], ['廖', 14], ['賴', 14], ['周', 12],
  ['徐', 11], ['蘇', 11], ['葉', 11], ['莊', 10], ['呂', 10], ['江', 9], ['何', 9], ['蕭', 9], ['羅', 8], ['高', 8],
  ['潘', 7], ['簡', 7], ['朱', 7], ['鍾', 7], ['游', 6], ['彭', 6], ['詹', 6], ['胡', 6], ['施', 6], ['沈', 5],
];

/* Male given names by birth decade, weight 3 = top of that decade, 1 = still common.
 * Names that are common only for births after 2011 (承恩, 宥廷, 品睿, 恩碩, 子睿) are left out
 * on purpose: nobody on the field or in the booth is that young. */
export const GIVEN = {
  1950: { 3: '金龍 文雄 正雄 明雄 俊雄', 2: '榮輝 明德 進財 清水 國雄 文彬', 1: '振興 建國 金城 永福 國華 春生' },
  1960: { 3: '志明 文雄 俊雄 明輝 志成', 2: '建志 榮輝 國華 文彬 明哲 志忠', 1: '振興 文昌 志雄 正義 明宏 國峰' },
  1970: { 3: '志明 建宏 俊宏 志偉 志豪', 2: '志宏 建志 志強 文傑 嘉宏 智偉', 1: '俊賢 志賢 明哲 宗憲 信宏 志銘' },
  1980: { 3: '家豪 志豪 俊傑 建宏 志偉', 2: '宗翰 俊宏 家銘 志宏 冠宇 信宏', 1: '彥廷 建良 佳宏 俊廷 立偉 家宏' },
  1990: {
    3: '家豪 冠宇 承翰 宗翰 柏翰 冠廷 彥廷 宇翔 俊傑 家銘 柏宇 冠霖',
    2: '子豪 哲瑋 家瑋 威廷 宇軒 浩宇 冠瑋 建廷 柏廷 俊宇 冠勳 品豪 冠傑 柏均 彥均 柏諺 承佑 家榮 宗霖 育誠',
    1: '偉倫 信宏 皓宇 宇恆 冠均 子翔 柏豪 冠穎 俊廷 立偉 家宏 建勳 振宇 書豪',
  },
};
