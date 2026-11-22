/* Factory settings: one line of character per player, keyed by player id. Data format: CC0.
 * The lines and tags are player characterisation: reserved, not licensed (TRADEMARKS.md).
 * Content for the booth, the introductions and the guide: nothing here changes a game (rule 10)
 * and the engine never reads this file.
 *
 * BIOS[id] = { line, tags }
 *   line: one short on-air line (max 30 characters) that agrees with the player's data.
 *   tags: two or three. tags[0] is the SKILL_TAGS word of his best rating; tags[1] is his
 *         gimmick, unique in the league; an optional tags[2] is a DATA_TAGS word that must
 *         match his data (bats/throws left, age).
 * Wave 1 (#54): the 18 starters and 10 starting pitchers of the default pairing.
 * Checked by tests/bios.check.mjs. */
export const SKILL_TAGS = { con: '巧打', pow: '長打', eye: '選球', spd: '快腿', arm: '強肩', stuff: '球威', ctrl: '控球' };
export const DATA_TAGS = { batsLeft: '左打', throwsLeft: '左投', young: '新秀', veteran: '老將' };
export const YOUNG_MAX_AGE = 24, VETERAN_MIN_AGE = 31;

export const BIOS = {
  /* pheasants */
  "pheasants-b1": {line: "選球像挑房子，壞球一律嫌「公設比太高」。", tags: ["選球", "公設比", "新秀"]},
  "pheasants-b2": {line: "全壘打一落地，他先問那一帶的實價登錄。", tags: ["長打", "實價登錄"]},
  "pheasants-b3": {line: "一九一公分的左打，自稱全隊唯一沒灌水的實坪。", tags: ["長打", "實坪", "左打"]},
  "pheasants-b4": {line: "第四棒，揮空也揮滿，說房貸都背了不差這一棒。", tags: ["長打", "全揮"]},
  "pheasants-b5": {line: "只打不守的指定打擊，說守備那份工作轉租出去了。", tags: ["巧打", "轉租", "左打"]},
  "pheasants-b6": {line: "中外野回傳像催繳通知，準時、直接、不留情面。", tags: ["強肩", "催繳"]},
  "pheasants-b7": {line: "還跟爸媽住，說保送和房子一樣，都是別人給的。", tags: ["選球", "住家裡", "新秀"]},
  "pheasants-b8": {line: "左打捕手，盜壘的人在他眼裡都是想提前解約的房客。", tags: ["強肩", "房東", "左打"]},
  "pheasants-b9": {line: "打擊像銀行對保，等很久才有結果，但上了壘就不會出錯。", tags: ["強肩", "對保", "新秀"]},
  "pheasants-p1": {line: "左投老將，牽制一流，好球帶卻像浮動利率。", tags: ["強肩", "浮動利率", "左投"]},
  "pheasants-p2": {line: "三十四歲全隊最年長，說房貸繳完那天就退休。", tags: ["球威", "繳完退休", "左投"]},
  "pheasants-p3": {line: "一七五公分的右投，自稱小宅格局，每一球都很實用。", tags: ["強肩", "小宅"]},
  "pheasants-p4": {line: "左投，直球又重又沉，捕手說像接到違約金。", tags: ["球威", "違約金", "左投"]},
  "pheasants-p5": {line: "第五號先發，說自己是寬限期，輪到他大家先喘口氣。", tags: ["強肩", "寬限期"]},
  /* owls */
  "owls-b1": {line: "第一棒捕手，跑壘飛快，說是每天衝末班車練的。", tags: ["快腿", "末班車"]},
  "owls-b2": {line: "腳程飛快，右外野回傳卻軟，說手要留給鍵盤。", tags: ["快腿", "鍵盤"]},
  "owls-b3": {line: "左打長打，每次揮大棒前都低聲說一句「先存檔」。", tags: ["長打", "存檔", "左打"]},
  "owls-b4": {line: "全隊最強長打，說每支全壘打都是一次強制下班。", tags: ["長打", "強制下班"]},
  "owls-b5": {line: "新人左外野，腳快，連壞球都追，說主管交代的不能等。", tags: ["快腿", "主管交代", "新秀"]},
  "owls-b6": {line: "選球極精，壞球一律已讀不回。", tags: ["選球", "已讀不回", "老將"]},
  "owls-b7": {line: "老將游擊，傳一壘又穩又強，自稱全隊的備援系統。", tags: ["強肩", "備援", "老將"]},
  "owls-b8": {line: "中外野什麼球都追得到，傳回來卻要轉兩手，說是外包。", tags: ["快腿", "外包", "老將"]},
  "owls-b9": {line: "九棒指定打擊，站在打擊區像開會，只聽不發言。", tags: ["選球", "開會"]},
  "owls-p1": {line: "一九〇的右投，控球像排程，幾點幾分投哪裡都寫好了。", tags: ["控球", "排程"]},
  "owls-p2": {line: "二十二歲控球就很穩，每晚十點準時睡，隊上當他是傳說。", tags: ["控球", "準時睡", "新秀"]},
  "owls-p3": {line: "球威全隊最兇，說每一球都是交件前的最後衝刺。", tags: ["球威", "交件", "新秀"]},
  "owls-p4": {line: "三十二歲老將，球速不快，靠經驗吃局數，像熬第三個通宵。", tags: ["強肩", "通宵", "老將"]},
  "owls-p5": {line: "全隊最年輕的先發，還在實習期，每局下場都問能不能轉正。", tags: ["球威", "實習", "新秀"]},
};

export const bioOf = id => BIOS[id] || null;
