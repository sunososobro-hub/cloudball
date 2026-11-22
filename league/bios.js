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
 * Wave 1 (#54): the 18 starters and 10 starting pitchers of the default pairing. Wave 2: the other 44,
 * written on the #169 abilities (tags[0] follows the raw values the engine uses).
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
  "pheasants-p6": {line: "二十一歲的後援，各項都還在預售階段，交屋要再等幾年。", tags: ["球威",  "預售屋",  "新秀"]},
  "pheasants-p7": {line: "二十一歲左投，球威驚人，控球像頭期款，總差一點湊不齊。", tags: ["球威",  "頭期款",  "左投"]},
  "pheasants-p8": {line: "球速慢得像老公寓電梯，控球和牽制卻一格不差。", tags: ["強肩",  "老公寓"]},
  "pheasants-p9": {line: "二十二歲，球不快但很準，像房貸自動扣繳，從不跳票。", tags: ["控球",  "自動扣繳",  "新秀"]},
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
  "owls-p6": {line: "新秀後援，球威有，傳一壘卻軟，說那不在他的職務說明書。", tags: ["球威",  "職務說明",  "新秀"]},
  "owls-p7": {line: "一七四公分，球威控球都還在測試版，只有傳壘已上線。", tags: ["強肩",  "測試版",  "新秀"]},
  "owls-p8": {line: "三十四歲全隊最老，球不快只靠控球，像在維護沒人敢動的舊程式。", tags: ["控球",  "舊程式",  "老將"]},
  "owls-p9": {line: "左投，球威控球都普通，牽制卻快，跑者一離壘就像摸魚被抓到。", tags: ["強肩",  "摸魚",  "左投"]},
  /* macaques */
  "macaques-b1": {line: "指定打擊，安打靠巧勁，跑壘慢條斯理，說帥的人不趕路。", tags: ["巧打",  "不趕路"]},
  "macaques-b2": {line: "三十三歲仍是聯盟最快的腿，說猴子爬樹不看身分證。", tags: ["快腿",  "爬樹",  "老將"]},
  "macaques-b3": {line: "一壘手，選球眼尖，像猴子盯著遊客手上的便當。", tags: ["選球",  "盯便當"]},
  "macaques-b4": {line: "左打新秀，巧打一流，打完必撥瀏海，傳一壘卻常偏。", tags: ["巧打",  "撥瀏海",  "左打"]},
  "macaques-b5": {line: "三十三歲，球看得準也打得準，跑壘慢，說是穿慣了藍白拖。", tags: ["巧打",  "藍白拖",  "老將"]},
  "macaques-b6": {line: "一八九的左打二壘手，腿快棒子重，盜壘前一定先戴墨鏡。", tags: ["快腿",  "墨鏡",  "左打"]},
  "macaques-b7": {line: "游擊手，樣樣中等，傳一壘偏軟，瞪投手卻全隊最兇。", tags: ["快腿",  "瞪投手"]},
  "macaques-b8": {line: "腿快手也有力的捕手，壞球卻常揮，說人家挑釁就要回應。", tags: ["快腿",  "挑釁"]},
  "macaques-b9": {line: "左打右外野，球打不遠，回傳倒很有力，說力氣都拿去比腕力。", tags: ["強肩",  "比腕力",  "左打"]},
  "macaques-p1": {line: "一八八的右投，球不快但點得很準，投完一定甩頭下投手丘。", tags: ["控球",  "甩頭"]},
  "macaques-p2": {line: "隊上王牌，控球精準，每次三振完都對打者比一個噓。", tags: ["控球",  "比噓"]},
  "macaques-p3": {line: "牽制又快又狠，控球普通，說壘包是他的地盤，誰靠近誰倒楣。", tags: ["強肩",  "地盤"]},
  "macaques-p4": {line: "控球頂尖，守備傳球卻軟，說他的煞氣只留給打者。", tags: ["控球",  "留給打者"]},
  "macaques-p5": {line: "三十一歲第五號先發，靠控球過日子，出場音樂全隊最吵。", tags: ["控球",  "出場音樂",  "老將"]},
  "macaques-p6": {line: "左投新秀，牽制不錯，球還在練，下場就幫隊友理毛。", tags: ["強肩",  "理毛",  "左投"]},
  "macaques-p7": {line: "三十四歲全隊最老，人稱猴王，球不快但捕手手套不用動。", tags: ["控球",  "猴王",  "老將"]},
  "macaques-p8": {line: "牽制一流，控球亂飄，說保送是給打者一點面子。", tags: ["強肩",  "給面子"]},
  "macaques-p9": {line: "二十四歲後援，球威不錯，潛力很高，帽沿永遠壓得很低。", tags: ["球威",  "壓帽沿",  "新秀"]},
  /* muntjacs */
  "muntjacs-b1": {line: "一九三的一壘手，腿很快，選球卻差，說一早看出去都是兩顆球。", tags: ["快腿",  "兩顆球"]},
  "muntjacs-b2": {line: "腿快手強卻只當指定打擊，說守備那半局他通常還在補眠。", tags: ["快腿",  "補眠",  "左打"]},
  "muntjacs-b3": {line: "選球極精，跑得慢，說宿醉的人怕光，壞球一眼就躲。", tags: ["選球",  "怕光"]},
  "muntjacs-b4": {line: "新秀右外野，棒重肩強，揮棒像受驚的山羌，有球就跳。", tags: ["長打",  "受驚",  "新秀"]},
  "muntjacs-b5": {line: "三壘手很會打安打，傳一壘卻無力，說右手還停在昨晚乾杯的高度。", tags: ["巧打",  "乾杯"]},
  "muntjacs-b6": {line: "左打二壘手，偶爾一棒打很遠，但隔天他自己都不記得。", tags: ["長打",  "斷片",  "左打"]},
  "muntjacs-b7": {line: "三十四歲全隊最老，回傳又遠又準，說老了才學會一杯就好。", tags: ["強肩",  "一杯就好",  "老將"]},
  "muntjacs-b8": {line: "三十一歲捕手，打擊中規中矩，跑得慢，休息區永遠備著醒酒湯。", tags: ["巧打",  "醒酒湯",  "老將"]},
  "muntjacs-b9": {line: "游擊老將，打擊偏弱，傳一壘還算穩，手機鬧鐘設了十個。", tags: ["強肩",  "十個鬧鐘",  "老將"]},
  "muntjacs-p1": {line: "球不快，控球普通，說每一球都跟著太陽穴一跳一跳。", tags: ["控球",  "太陽穴"]},
  "muntjacs-p2": {line: "左投新秀，球又快又重，控球像凌晨回家的路，只記得大概方向。", tags: ["球威",  "回家的路",  "左投"]},
  "muntjacs-p3": {line: "隊上王牌，球威牽制都強，賽前固定先灌兩瓶運動飲料。", tags: ["強肩",  "運動飲料"]},
  "muntjacs-p4": {line: "樣樣中等的先發，投完都說今天不喝了，隔天照樣續攤。", tags: ["球威",  "今天不喝"]},
  "muntjacs-p5": {line: "老將先發，球不快也不準，牽制卻快，說盯跑者像盯自己的酒杯。", tags: ["強肩",  "盯酒杯",  "老將"]},
  "muntjacs-p6": {line: "左投老將，球威夠，控球卻亂飄，說投手丘在他眼裡會晃。", tags: ["球威",  "地在晃",  "左投"]},
  "muntjacs-p7": {line: "左投後援，各項普通，每次上場前都在找另一隻釘鞋。", tags: ["控球",  "找釘鞋",  "左投"]},
  "muntjacs-p8": {line: "二十二歲潛力極高，球還不快，是全隊唯一滴酒不沾的人。", tags: ["強肩",  "滴酒不沾",  "新秀"]},
  "muntjacs-p9": {line: "左投老將，球威夠重，三振後會大叫一聲，像山羌在吠。", tags: ["球威",  "吠叫",  "左投"]},
};

export const bioOf = id => BIOS[id] || null;
