/* Factory settings: every player as created. Data format and stats: CC0. Player names and identities are reserved (not licensed); forks use their own names.
 * Current ability = these values + the official ledger (cloudball-league). Do not edit a
 * player here once official games exist; changes to ability belong in the ledger.
 *
 * bat: lineup order. con = contact, pow = power, eye = plate discipline, spd = speed,
 *      arm = throwing arm (all ratings centred on 1.0), hand = bats L/R, avg = display
 *      placeholder until real stats exist.
 * pit: first five are starters (SP), the rest relievers (RP). stuff, ctrl centred on 1.0.
 * body/ht: appearance only (build blend weights, height in metres). */
export const ROSTERS = [
  { /* pheasants */
    bat: [
      {id: "pheasants-b1", name: "劉立偉", num: 58, pos: "2B", con: 1.0502359740156682, pow: 0.7689541824162006, eye: 1.1475988114718347, age: 22, pot: 1.071703302359674, arm: 0.992, avg: 0.291, spd: 1.134, hand: "R", body: {slim: 0.8, power: 0, heavy: 0}, ht: 1.83},
      {id: "pheasants-b2", name: "張柏豪", num: 53, pos: "RF", con: 1.1130233252653854, pow: 1.1965984281385318, eye: 0.9972659464692697, age: 30, pot: 1.112098731601145, arm: 1.039, avg: 0.325, spd: 1.103, hand: "R", body: {slim: 0, power: 0.53, heavy: 0}, ht: 1.81},
      {id: "pheasants-b3", name: "陳冠霖", num: 97, pos: "LF", con: 0.9583726436598227, pow: 1.1515424306271598, eye: 0.9481489371974021, age: 29, pot: 0.9955417162040249, arm: 0.98, avg: 0.261, spd: 1.005, hand: "L", body: {slim: 0, power: 0.44, heavy: 0.37}, ht: 1.91},
      {id: "pheasants-b4", name: "林宇軒", num: 72, pos: "3B", con: 0.9891645521856844, pow: 1.239464297075756, eye: 0.9210964115569368, age: 29, pot: 1.0933643135707825, arm: 1.113, avg: 0.275, spd: 0.988, hand: "R", body: {slim: 0, power: 1, heavy: 0.75}, ht: 1.84},
      {id: "pheasants-b5", name: "蕭家瑋", num: 59, pos: "DH", con: 1.0220506777614355, pow: 0.9343477880116552, eye: 0.8769346893532202, age: 28, pot: 0.9214279629290104, arm: 0.925, avg: 0.283, spd: 0.991, hand: "L", body: {slim: 0, power: 0.02, heavy: 0}, ht: 1.83},
      {id: "pheasants-b6", name: "黃振宇", num: 62, pos: "CF", con: 1.0499751901766285, pow: 0.7613928730133921, eye: 1.0298091849545017, age: 30, pot: 0.9086128545808606, arm: 1.106, avg: 0.291, spd: 0.876, hand: "R", body: {slim: 0, power: 0, heavy: 0}, ht: 1.87},
      {id: "pheasants-b7", name: "林家銘", num: 79, pos: "SS", con: 0.922512079300359, pow: 0.8931791929993779, eye: 1.1062886223662645, age: 23, pot: 0.9307507375255227, arm: 0.913, avg: 0.241, spd: 0.996, hand: "R", body: {slim: 0.05, power: 0, heavy: 0}, ht: 1.85},
      {id: "pheasants-b8", name: "陳柏翰", num: 95, pos: "C", con: 0.9741024952847511, pow: 0.7713200694415718, eye: 1.0975878644036128, age: 28, pot: 1.131987012142781, arm: 1.098, avg: 0.26, spd: 0.949, hand: "L", body: {slim: 0, power: 0, heavy: 0}, ht: 1.83},
      {id: "pheasants-b9", name: "王俊廷", num: 75, pos: "1B", con: 0.9279601869545877, pow: 1.0103665495291352, eye: 1.000358981406316, age: 24, pot: 1.0857133714365772, arm: 1.031, avg: 0.246, spd: 0.889, hand: "R", body: {slim: 0, power: 0.16, heavy: 0}, ht: 1.9},
    ],
    pit: [
      {id: "pheasants-p1", name: "許柏廷", num: 33, role: "SP", stuff: 1.0399675596738234, ctrl: 0.9598992496659048, age: 33, pot: 1.0831298309843986, throws: "L", arm: 1.128, body: {slim: 0, power: 0.06, heavy: 0}, ht: 1.87},
      {id: "pheasants-p2", name: "王冠傑", num: 90, role: "SP", stuff: 1.0292194241378456, ctrl: 1.0098971374914982, age: 34, pot: 0.9308854824397713, throws: "L", arm: 0.867, body: {slim: 0, power: 0, heavy: 0}, ht: 1.8},
      {id: "pheasants-p3", name: "彭宇翔", num: 91, role: "SP", stuff: 1.0210708711622283, ctrl: 1.0180078913504258, age: 26, pot: 0.9118129656766542, throws: "R", arm: 1.099, body: {slim: 0.04, power: 0.24, heavy: 0}, ht: 1.75},
      {id: "pheasants-p4", name: "郭彥均", num: 2, role: "SP", stuff: 1.0863865623250604, ctrl: 1.0326917117042467, age: 31, pot: 1.0454051983891985, throws: "L", arm: 0.99, body: {slim: 0, power: 0.04, heavy: 0}, ht: 1.77},
      {id: "pheasants-p5", name: "許子豪", num: 40, role: "SP", stuff: 1.0087855512043462, ctrl: 0.996495688490104, age: 29, pot: 1.082336974190548, throws: "R", arm: 1.067, body: {slim: 0, power: 0.01, heavy: 0}, ht: 1.82},
      {id: "pheasants-p6", name: "王俊宇", num: 17, role: "RP", stuff: 0.975625657401979, ctrl: 0.9256005625799298, age: 21, pot: 1.0360262616653926, throws: "R", arm: 1.012, body: {slim: 0.06, power: 0.05, heavy: 0}, ht: 1.77},
      {id: "pheasants-p7", name: "黃柏宇", num: 65, role: "RP", stuff: 1.0357359454780817, ctrl: 1.0461196632683278, age: 21, pot: 0.9686563000199385, throws: "L", arm: 0.913, body: {slim: 0, power: 0.08, heavy: 0}, ht: 1.84},
      {id: "pheasants-p8", name: "洪冠穎", num: 48, role: "RP", stuff: 0.9934453421831132, ctrl: 0.9595371846854687, age: 30, pot: 1.0143013649852946, throws: "R", arm: 1.116, body: {slim: 0, power: 0, heavy: 0}, ht: 1.77},
      {id: "pheasants-p9", name: "黃家豪", num: 9, role: "RP", stuff: 0.9830714507028461, ctrl: 0.928012537099421, age: 22, pot: 0.9155805549002253, throws: "R", arm: 0.939, body: {slim: 0, power: 0, heavy: 0}, ht: 1.79},
    ],
  },
  { /* owls */
    bat: [
      {id: "owls-b1", name: "蔡俊廷", num: 78, pos: "C", con: 1.110501849493012, pow: 0.9718898259103298, eye: 1.0901837218319996, age: 28, pot: 1.0193058897042646, arm: 1.078, avg: 0.32, spd: 1.131, hand: "R", body: {slim: 0.52, power: 0.28, heavy: 0}, ht: 1.78},
      {id: "owls-b2", name: "張家銘", num: 33, pos: "RF", con: 1.079759330651723, pow: 1.1348476559622214, eye: 1.0483143087709321, age: 26, pot: 1.1128790261922403, arm: 0.888, avg: 0.31, spd: 1.139, hand: "R", body: {slim: 0.22, power: 0.66, heavy: 0}, ht: 1.76},
      {id: "owls-b3", name: "郭彥廷", num: 64, pos: "1B", con: 1.014810177376494, pow: 1.1399510823423042, eye: 0.9549807772506028, age: 24, pot: 0.988563233090099, arm: 1.022, avg: 0.284, spd: 1.09, hand: "L", body: {slim: 0, power: 0.4, heavy: 0}, ht: 1.76},
      {id: "owls-b4", name: "邱子翔", num: 7, pos: "3B", con: 1.0058524055359885, pow: 1.2804142129141838, eye: 0.9898554110201075, age: 26, pot: 1.1084668510360642, arm: 0.999, avg: 0.283, spd: 1.016, hand: "R", body: {slim: 0, power: 0.82, heavy: 0.88}, ht: 1.9},
      {id: "owls-b5", name: "許柏翰", num: 4, pos: "LF", con: 1.0874525641603396, pow: 1.0395259690703824, eye: 0.9101551967207342, age: 22, pot: 0.9738816992379725, arm: 0.939, avg: 0.311, spd: 1.118, hand: "R", body: {slim: 0.09, power: 0.13, heavy: 0}, ht: 1.76},
      {id: "owls-b6", name: "林柏均", num: 65, pos: "2B", con: 0.9585971893556416, pow: 0.8476293965475634, eye: 1.1280508304713293, age: 31, pot: 1.0159891569404862, arm: 0.917, avg: 0.255, spd: 1.023, hand: "R", body: {slim: 0.08, power: 0, heavy: 0}, ht: 1.75},
      {id: "owls-b7", name: "陳偉倫", num: 21, pos: "SS", con: 1.0311046333611011, pow: 0.7912019425770267, eye: 1.0414424879476427, age: 32, pot: 0.9832421895465814, arm: 1.069, avg: 0.283, spd: 0.939, hand: "R", body: {slim: 0, power: 0, heavy: 0}, ht: 1.86},
      {id: "owls-b8", name: "鄭冠勳", num: 44, pos: "CF", con: 1.0137355942791328, pow: 0.9063348405063152, eye: 0.9250031740870326, age: 31, pot: 1.123952511907555, arm: 0.888, avg: 0.279, spd: 1.104, hand: "R", body: {slim: 0.2, power: 0, heavy: 0}, ht: 1.89},
      {id: "owls-b9", name: "潘振宇", num: 71, pos: "DH", con: 0.9166737380530685, pow: 0.7565298455534503, eye: 1.0553684428334236, age: 30, pot: 1.0606377937714568, arm: 0.97, avg: 0.236, spd: 0.896, hand: "R", body: {slim: 0, power: 0, heavy: 0}, ht: 1.87},
    ],
    pit: [
      {id: "owls-p1", name: "楊柏宇", num: 56, role: "SP", stuff: 1.0084960461128503, ctrl: 1.0280249386816287, age: 25, pot: 0.9941243791021407, throws: "R", arm: 0.867, body: {slim: 0.08, power: 0.23, heavy: 0}, ht: 1.9},
      {id: "owls-p2", name: "林建勳", num: 90, role: "SP", stuff: 0.9867126722959801, ctrl: 1.0362247508461588, age: 22, pot: 1.1009617243893444, throws: "R", arm: 0.946, body: {slim: 0, power: 0, heavy: 0}, ht: 1.82},
      {id: "owls-p3", name: "王書豪", num: 63, role: "SP", stuff: 1.0762821040023118, ctrl: 1.0740570880752058, age: 23, pot: 1.0533800127217545, throws: "R", arm: 0.868, body: {slim: 0, power: 0.28, heavy: 0}, ht: 1.83},
      {id: "owls-p4", name: "黃承佑", num: 14, role: "SP", stuff: 0.99742048015818, ctrl: 1.05477075135801, age: 32, pot: 1.0650577931432053, throws: "R", arm: 1.095, body: {slim: 0, power: 0, heavy: 0}, ht: 1.84},
      {id: "owls-p5", name: "黃宗翰", num: 76, role: "SP", stuff: 1.0205778600648046, ctrl: 1.006481050872244, age: 21, pot: 0.9146846054121852, throws: "R", arm: 0.883, body: {slim: 0, power: 0.17, heavy: 0}, ht: 1.81},
      {id: "owls-p6", name: "謝柏諺", num: 80, role: "RP", stuff: 1.0106211329624057, ctrl: 1.0047934618219734, age: 21, pot: 1.0117848571739159, throws: "R", arm: 1.072, body: {slim: 0, power: 0, heavy: 0}, ht: 1.8},
      {id: "owls-p7", name: "葉俊傑", num: 10, role: "RP", stuff: 1.0249317506700755, ctrl: 0.9255492261052132, age: 24, pot: 0.994617243448738, throws: "R", arm: 1.095, body: {slim: 0, power: 0, heavy: 0}, ht: 1.74},
      {id: "owls-p8", name: "沈冠均", num: 85, role: "RP", stuff: 1.0522440094128251, ctrl: 1.0156650669872762, age: 34, pot: 0.9225770634133369, throws: "R", arm: 1.015, body: {slim: 0, power: 0.27, heavy: 0}, ht: 1.8},
      {id: "owls-p9", name: "楊冠瑋", num: 73, role: "RP", stuff: 1.022837643250823, ctrl: 1.0501631031557919, age: 28, pot: 1.0246815917547791, throws: "L", arm: 1.108, body: {slim: 0, power: 0, heavy: 0}, ht: 1.8},
    ],
  },
  { /* macaques */
    bat: [
      {id: "macaques-b1", name: "謝宗翰", num: 56, pos: "DH", con: 1.0838941066758707, pow: 0.8319718936458229, eye: 1.1076611912110819, age: 29, pot: 1.0632337065530009, arm: 1.078, avg: 0.306, spd: 0.934, hand: "R", body: {slim: 0, power: 0, heavy: 0}, ht: 1.85},
      {id: "macaques-b2", name: "吳偉倫", num: 4, pos: "CF", con: 1.100458619198762, pow: 0.9541297890245914, eye: 1.066064186859876, age: 33, pot: 1.0241210624575614, arm: 0.897, avg: 0.315, spd: 1.023, hand: "R", body: {slim: 0.01, power: 0.02, heavy: 0}, ht: 1.82},
      {id: "macaques-b3", name: "劉彥廷", num: 7, pos: "1B", con: 0.931329895039089, pow: 1.2024043787736445, eye: 0.9216937931487337, age: 29, pot: 1.0125975656323134, arm: 1.034, avg: 0.251, spd: 0.936, hand: "R", body: {slim: 0, power: 0.84, heavy: 0.9}, ht: 1.8},
      {id: "macaques-b4", name: "鄭威廷", num: 51, pos: "3B", con: 0.976549374354072, pow: 1.2657887835986914, eye: 0.9452263546874746, age: 22, pot: 1.1325162920751608, arm: 0.964, avg: 0.271, spd: 1.103, hand: "L", body: {slim: 0, power: 1, heavy: 0.11}, ht: 1.85},
      {id: "macaques-b5", name: "張俊宇", num: 62, pos: "LF", con: 1.053364531886764, pow: 1.0155610677087679, eye: 1.032704439945519, age: 33, pot: 1.0956498997169546, arm: 1.067, avg: 0.297, spd: 0.872, hand: "R", body: {slim: 0, power: 0, heavy: 0}, ht: 1.75},
      {id: "macaques-b6", name: "莊建勳", num: 57, pos: "2B", con: 0.9129979135934264, pow: 0.9781033590901643, eye: 1.0814599631587043, age: 23, pot: 0.9548543944605626, arm: 0.902, avg: 0.239, spd: 1.003, hand: "L", body: {slim: 0, power: 0.09, heavy: 0}, ht: 1.89},
      {id: "macaques-b7", name: "林冠廷", num: 15, pos: "SS", con: 1.0704653793992476, pow: 0.9263293331721798, eye: 0.9267964332364499, age: 28, pot: 0.9025048194802366, arm: 0.922, avg: 0.302, spd: 1.093, hand: "R", body: {slim: 0.31, power: 0, heavy: 0}, ht: 1.81},
      {id: "macaques-b8", name: "許冠宇", num: 46, pos: "C", con: 0.9711622687336058, pow: 0.7828513621585443, eye: 0.9329029202228412, age: 28, pot: 1.0102226400398648, arm: 1.033, avg: 0.259, spd: 0.966, hand: "R", body: {slim: 0, power: 0, heavy: 0}, ht: 1.85},
      {id: "macaques-b9", name: "林家豪", num: 49, pos: "RF", con: 0.9333471424411983, pow: 1.0183022830169648, eye: 0.9317407777300104, age: 28, pot: 0.9421804147190415, arm: 1.126, avg: 0.248, spd: 0.851, hand: "L", body: {slim: 0, power: 0.43, heavy: 0.06}, ht: 1.79},
    ],
    pit: [
      {id: "macaques-p1", name: "吳子豪", num: 2, role: "SP", stuff: 1.038077485957183, ctrl: 1.0141398948966525, age: 26, pot: 1.133062936400529, throws: "R", arm: 1.052, body: {slim: 0, power: 0.02, heavy: 0}, ht: 1.88},
      {id: "macaques-p2", name: "鄭浩宇", num: 93, role: "SP", stuff: 0.9666859708027914, ctrl: 1.0294687546766363, age: 29, pot: 0.98731678040931, throws: "R", arm: 1.129, body: {slim: 0.04, power: 0, heavy: 0}, ht: 1.82},
      {id: "macaques-p3", name: "張書豪", num: 44, role: "SP", stuff: 1.0024799028318376, ctrl: 1.0167094056867063, age: 25, pot: 1.0691443203599191, throws: "R", arm: 1.005, body: {slim: 0, power: 0, heavy: 0}, ht: 1.8},
      {id: "macaques-p4", name: "徐建廷", num: 75, role: "SP", stuff: 0.9701675886334851, ctrl: 1.0135499277641065, age: 30, pot: 1.1310296724317594, throws: "R", arm: 0.951, body: {slim: 0, power: 0, heavy: 0}, ht: 1.85},
      {id: "macaques-p5", name: "楊冠傑", num: 69, role: "SP", stuff: 1.0156599831301718, ctrl: 1.0355141752725467, age: 31, pot: 1.03147695310181, throws: "R", arm: 1.092, body: {slim: 0, power: 0, heavy: 0}, ht: 1.76},
      {id: "macaques-p6", name: "曾俊傑", num: 45, role: "RP", stuff: 0.9702612755820156, ctrl: 0.9698949413374067, age: 23, pot: 1.08483063619351, throws: "L", arm: 1.116, body: {slim: 0.02, power: 0, heavy: 0}, ht: 1.84},
      {id: "macaques-p7", name: "黃育誠", num: 79, role: "RP", stuff: 0.9208133981749416, ctrl: 1.0172074073553086, age: 34, pot: 0.9409431799198501, throws: "R", arm: 1.028, body: {slim: 0, power: 0, heavy: 0}, ht: 1.82},
      {id: "macaques-p8", name: "蘇品豪", num: 63, role: "RP", stuff: 1.0630436335504057, ctrl: 1.0021025522798301, age: 30, pot: 0.9307295899256133, throws: "R", arm: 0.857, body: {slim: 0, power: 0.04, heavy: 0}, ht: 1.76},
      {id: "macaques-p9", name: "何宇翔", num: 71, role: "RP", stuff: 1.0221183874085547, ctrl: 0.9778096199408174, age: 24, pot: 1.149966968607623, throws: "R", arm: 1.02, body: {slim: 0.08, power: 0.3, heavy: 0}, ht: 1.81},
    ],
  },
  { /* muntjacs */
    bat: [
      {id: "muntjacs-b1", name: "李冠勳", num: 87, pos: "1B", con: 1.1139702008478345, pow: 1.2589436993701384, eye: 1.1204099883325398, age: 29, pot: 0.9520270927227102, arm: 0.874, avg: 0.327, spd: 0.997, hand: "R", body: {slim: 0, power: 0.78, heavy: 0.83}, ht: 1.93},
      {id: "muntjacs-b2", name: "楊育誠", num: 15, pos: "DH", con: 1.080844263713807, pow: 0.7655885907588527, eye: 0.9533729397691786, age: 25, pot: 1.0691107034566811, arm: 0.967, avg: 0.303, spd: 1.14, hand: "L", body: {slim: 0.82, power: 0, heavy: 0}, ht: 1.83},
      {id: "muntjacs-b3", name: "張柏諺", num: 88, pos: "LF", con: 0.9813179945666344, pow: 1.1194566261954606, eye: 1.0015678813681006, age: 30, pot: 1.0127200494520365, arm: 1.059, avg: 0.27, spd: 0.967, hand: "R", body: {slim: 0, power: 0.62, heavy: 0.08}, ht: 1.77},
      {id: "muntjacs-b4", name: "劉冠廷", num: 94, pos: "RF", con: 0.9628642520541326, pow: 1.2517265481874347, eye: 0.8594675666652619, age: 24, pot: 0.9088579128496349, arm: 0.863, avg: 0.265, spd: 0.885, hand: "R", body: {slim: 0, power: 0.78, heavy: 0.94}, ht: 1.87},
      {id: "muntjacs-b5", name: "王冠宇", num: 18, pos: "3B", con: 1.101855219951831, pow: 1.1391443236730994, eye: 0.9261276965728029, age: 30, pot: 1.0323449387564323, arm: 1.131, avg: 0.319, spd: 0.902, hand: "R", body: {slim: 0, power: 0.57, heavy: 0.5}, ht: 1.8},
      {id: "muntjacs-b6", name: "林家榮", num: 48, pos: "2B", con: 0.9960791160678492, pow: 0.8789027452701703, eye: 1.0321286984719336, age: 28, pot: 1.0811082629137672, arm: 1.084, avg: 0.271, spd: 1.021, hand: "L", body: {slim: 0.04, power: 0, heavy: 0}, ht: 1.79},
      {id: "muntjacs-b7", name: "蔡柏豪", num: 59, pos: "CF", con: 0.9280086061730981, pow: 0.7295928973471746, eye: 1.119370783912018, age: 34, pot: 1.1365547766094095, arm: 1.056, avg: 0.24, spd: 1.023, hand: "L", body: {slim: 0.41, power: 0, heavy: 0}, ht: 1.76},
      {id: "muntjacs-b8", name: "蘇承佑", num: 27, pos: "C", con: 0.9651179158687592, pow: 0.8280797337880358, eye: 0.9898405561223625, age: 31, pot: 0.9642806633841247, arm: 0.947, avg: 0.257, spd: 1.096, hand: "R", body: {slim: 0.51, power: 0, heavy: 0}, ht: 1.86},
      {id: "muntjacs-b9", name: "張家瑋", num: 51, pos: "SS", con: 0.9776010823994875, pow: 0.7753758986713364, eye: 0.9515559080755338, age: 32, pot: 0.9607434352859855, arm: 1.031, avg: 0.261, spd: 0.946, hand: "R", body: {slim: 0, power: 0, heavy: 0}, ht: 1.74},
    ],
    pit: [
      {id: "muntjacs-p1", name: "李冠均", num: 45, role: "SP", stuff: 1.0505962459091098, ctrl: 0.9844604363874532, age: 26, pot: 1.0719498464372008, throws: "R", arm: 1.079, body: {slim: 0, power: 0, heavy: 0}, ht: 1.82},
      {id: "muntjacs-p2", name: "洪承翰", num: 98, role: "SP", stuff: 1.0667517452966422, ctrl: 1.0475107635674068, age: 22, pot: 0.9436872441205196, throws: "L", arm: 1.042, body: {slim: 0, power: 0.34, heavy: 0}, ht: 1.81},
      {id: "muntjacs-p3", name: "林冠霖", num: 28, role: "SP", stuff: 1.0434455919126049, ctrl: 1.0779675206355752, age: 26, pot: 1.0212986945174634, throws: "R", arm: 1.051, body: {slim: 0.05, power: 0.36, heavy: 0}, ht: 1.75},
      {id: "muntjacs-p4", name: "郭哲瑋", num: 81, role: "SP", stuff: 0.984023219840601, ctrl: 0.9701527384086511, age: 26, pot: 0.9105237659299746, throws: "R", arm: 0.882, body: {slim: 0, power: 0, heavy: 0}, ht: 1.77},
      {id: "muntjacs-p5", name: "葉家宏", num: 95, role: "SP", stuff: 0.9696572613110765, ctrl: 1.078516390232835, age: 33, pot: 1.0704593953327275, throws: "R", arm: 0.865, body: {slim: 0, power: 0, heavy: 0}, ht: 1.89},
      {id: "muntjacs-p6", name: "郭宇軒", num: 7, role: "RP", stuff: 0.9240984786301851, ctrl: 1.0493875259160996, age: 32, pot: 1.0617347130086272, throws: "L", arm: 0.89, body: {slim: 0.09, power: 0, heavy: 0}, ht: 1.83},
      {id: "muntjacs-p7", name: "林建廷", num: 85, role: "RP", stuff: 0.9512770283967257, ctrl: 0.9325377531349659, age: 25, pot: 1.0816450455226003, throws: "L", arm: 1.044, body: {slim: 0.19, power: 0.1, heavy: 0}, ht: 1.77},
      {id: "muntjacs-p8", name: "何冠瑋", num: 70, role: "RP", stuff: 1.0723337600752711, ctrl: 1.017903762459755, age: 22, pot: 0.9090369394747541, throws: "R", arm: 1.028, body: {slim: 0, power: 0.25, heavy: 0}, ht: 1.88},
      {id: "muntjacs-p9", name: "李柏均", num: 86, role: "RP", stuff: 1.0715801745653153, ctrl: 0.919237972535193, age: 31, pot: 1.0945932549424469, throws: "L", arm: 1.04, body: {slim: 0, power: 0.12, heavy: 0}, ht: 1.8},
    ],
  },
];
