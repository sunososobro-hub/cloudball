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
      {id: "pheasants-b1", name: "劉立偉", num: 58, pos: "2B", con: 0.96, pow: 1.076, eye: 1.16, age: 22, pot: 1.102, arm: 1.077, avg: 0.258, spd: 0.919, hand: "R", body: {slim: 0, power: 0.28, heavy: 0.65}, ht: 1.83},
      {id: "pheasants-b2", name: "張柏豪", num: 53, pos: "RF", con: 1.019, pow: 1.409, eye: 0.949, age: 30, pot: 1.229, arm: 1.049, avg: 0.282, spd: 0.901, hand: "R", body: {slim: 0, power: 1, heavy: 1}, ht: 1.81},
      {id: "pheasants-b3", name: "陳冠霖", num: 97, pos: "LF", con: 0.953, pow: 1.176, eye: 0.973, age: 29, pot: 0.964, arm: 1, avg: 0.255, spd: 0.92, hand: "L", body: {slim: 0, power: 0.78, heavy: 1}, ht: 1.91},
      {id: "pheasants-b4", name: "林宇軒", num: 72, pos: "3B", con: 0.982, pow: 1.409, eye: 0.986, age: 29, pot: 1.007, arm: 0.944, avg: 0.267, spd: 0.938, hand: "R", body: {slim: 0, power: 1, heavy: 1}, ht: 1.84},
      {id: "pheasants-b5", name: "蕭家瑋", num: 59, pos: "DH", con: 0.986, pow: 0.813, eye: 0.924, age: 28, pot: 1.011, arm: 0.913, avg: 0.269, spd: 0.897, hand: "L", body: {slim: 0, power: 0, heavy: 0}, ht: 1.83},
      {id: "pheasants-b6", name: "黃振宇", num: 62, pos: "CF", con: 0.974, pow: 1.012, eye: 0.987, age: 30, pot: 1.059, arm: 1.03, avg: 0.264, spd: 0.961, hand: "R", body: {slim: 0, power: 0, heavy: 0}, ht: 1.87},
      {id: "pheasants-b7", name: "林家銘", num: 79, pos: "SS", con: 1.091, pow: 0.799, eye: 1.157, age: 23, pot: 0.962, arm: 0.931, avg: 0.312, spd: 1.088, hand: "R", body: {slim: 1, power: 0, heavy: 0}, ht: 1.85},
      {id: "pheasants-b8", name: "陳柏翰", num: 95, pos: "C", con: 1.009, pow: 0.936, eye: 0.971, age: 28, pot: 0.94, arm: 1.108, avg: 0.278, spd: 0.945, hand: "L", body: {slim: 0, power: 0, heavy: 0}, ht: 1.83},
      {id: "pheasants-b9", name: "王俊廷", num: 75, pos: "1B", con: 0.82, pow: 0.422, eye: 0.89, age: 24, pot: 0.976, arm: 0.999, avg: 0.2, spd: 0.981, hand: "R", body: {slim: 1, power: 0, heavy: 0}, ht: 1.9},
    ],
    pit: [
      {id: "pheasants-p1", name: "許柏廷", num: 33, role: "SP", stuff: 0.986, ctrl: 0.995, age: 33, pot: 0.927, throws: "L", arm: 0.998, body: {slim: 0, power: 0, heavy: 0}, ht: 1.87},
      {id: "pheasants-p2", name: "王冠傑", num: 90, role: "SP", stuff: 1.05, ctrl: 0.976, age: 34, pot: 0.96, throws: "L", arm: 1.048, body: {slim: 0, power: 0.5, heavy: 0}, ht: 1.8},
      {id: "pheasants-p3", name: "彭宇翔", num: 91, role: "SP", stuff: 0.997, ctrl: 0.967, age: 26, pot: 0.993, throws: "R", arm: 1.184, body: {slim: 0, power: 0, heavy: 0}, ht: 1.75},
      {id: "pheasants-p4", name: "郭彥均", num: 2, role: "SP", stuff: 1.185, ctrl: 1.122, age: 31, pot: 0.951, throws: "L", arm: 1.016, body: {slim: 0, power: 1, heavy: 0}, ht: 1.77},
      {id: "pheasants-p5", name: "許子豪", num: 40, role: "SP", stuff: 0.988, ctrl: 0.979, age: 29, pot: 1.046, throws: "R", arm: 1, body: {slim: 0, power: 0, heavy: 0}, ht: 1.82},
      {id: "pheasants-p6", name: "王俊宇", num: 17, role: "RP", stuff: 0.97, ctrl: 0.957, age: 21, pot: 0.992, throws: "R", arm: 0.943, body: {slim: 0, power: 0, heavy: 0}, ht: 1.77},
      {id: "pheasants-p7", name: "黃柏宇", num: 65, role: "RP", stuff: 1.082, ctrl: 0.957, age: 21, pot: 0.966, throws: "L", arm: 0.978, body: {slim: 0, power: 0.91, heavy: 0}, ht: 1.84},
      {id: "pheasants-p8", name: "洪冠穎", num: 48, role: "RP", stuff: 0.953, ctrl: 1.1, age: 30, pot: 1.013, throws: "R", arm: 1.219, body: {slim: 0, power: 0, heavy: 0}, ht: 1.77},
      {id: "pheasants-p9", name: "黃家豪", num: 9, role: "RP", stuff: 0.976, ctrl: 1.055, age: 22, pot: 1.023, throws: "R", arm: 0.974, body: {slim: 0, power: 0, heavy: 0}, ht: 1.79},
    ],
  },
  { /* owls */
    bat: [
      {id: "owls-b1", name: "蔡俊廷", num: 78, pos: "C", con: 1.104, pow: 1.008, eye: 0.972, age: 28, pot: 1.424, arm: 0.954, avg: 0.318, spd: 1.191, hand: "R", body: {slim: 1, power: 0, heavy: 0}, ht: 1.78},
      {id: "owls-b2", name: "張家銘", num: 33, pos: "RF", con: 0.986, pow: 0.763, eye: 0.945, age: 26, pot: 0.958, arm: 0.989, avg: 0.269, spd: 1.179, hand: "R", body: {slim: 1, power: 0, heavy: 0}, ht: 1.76},
      {id: "owls-b3", name: "郭彥廷", num: 64, pos: "1B", con: 0.955, pow: 1.432, eye: 0.909, age: 24, pot: 1.038, arm: 0.906, avg: 0.256, spd: 1.019, hand: "L", body: {slim: 0, power: 1, heavy: 1}, ht: 1.76},
      {id: "owls-b4", name: "邱子翔", num: 7, pos: "3B", con: 1.113, pow: 1.771, eye: 1.209, age: 26, pot: 1.237, arm: 1.011, avg: 0.322, spd: 0.943, hand: "R", body: {slim: 0, power: 1, heavy: 1}, ht: 1.9},
      {id: "owls-b5", name: "許柏翰", num: 4, pos: "LF", con: 0.96, pow: 0.827, eye: 0.971, age: 22, pot: 0.969, arm: 0.987, avg: 0.258, spd: 1.068, hand: "R", body: {slim: 1, power: 0, heavy: 0}, ht: 1.76},
      {id: "owls-b6", name: "林柏均", num: 65, pos: "2B", con: 1.025, pow: 0.795, eye: 1.144, age: 31, pot: 0.926, arm: 1.031, avg: 0.285, spd: 0.917, hand: "R", body: {slim: 0, power: 0, heavy: 0}, ht: 1.75},
      {id: "owls-b7", name: "陳偉倫", num: 21, pos: "SS", con: 0.987, pow: 0.914, eye: 0.978, age: 32, pot: 1.043, arm: 1.021, avg: 0.269, spd: 0.91, hand: "R", body: {slim: 0, power: 0, heavy: 0}, ht: 1.86},
      {id: "owls-b8", name: "鄭冠勳", num: 44, pos: "CF", con: 1.019, pow: 0.946, eye: 0.934, age: 31, pot: 0.993, arm: 0.968, avg: 0.282, spd: 1.184, hand: "R", body: {slim: 1, power: 0, heavy: 0}, ht: 1.89},
      {id: "owls-b9", name: "潘振宇", num: 71, pos: "DH", con: 0.805, pow: 0.472, eye: 1.008, age: 30, pot: 1.027, arm: 0.998, avg: 0.194, spd: 0.919, hand: "R", body: {slim: 1, power: 0, heavy: 0}, ht: 1.87},
    ],
    pit: [
      {id: "owls-p1", name: "楊柏宇", num: 56, role: "SP", stuff: 1.072, ctrl: 1.1, age: 25, pot: 0.983, throws: "R", arm: 0.909, body: {slim: 0, power: 0.77, heavy: 0}, ht: 1.9},
      {id: "owls-p2", name: "林建勳", num: 90, role: "SP", stuff: 0.968, ctrl: 0.997, age: 22, pot: 0.914, throws: "R", arm: 0.915, body: {slim: 0, power: 0, heavy: 0}, ht: 1.82},
      {id: "owls-p3", name: "王書豪", num: 63, role: "SP", stuff: 1.102, ctrl: 0.944, age: 23, pot: 0.967, throws: "R", arm: 1.014, body: {slim: 0, power: 1, heavy: 0}, ht: 1.83},
      {id: "owls-p4", name: "黃承佑", num: 14, role: "SP", stuff: 0.982, ctrl: 0.989, age: 32, pot: 1.086, throws: "R", arm: 1.018, body: {slim: 0, power: 0, heavy: 0}, ht: 1.84},
      {id: "owls-p5", name: "黃宗翰", num: 76, role: "SP", stuff: 1.016, ctrl: 0.957, age: 21, pot: 0.923, throws: "R", arm: 0.977, body: {slim: 0, power: 0.07, heavy: 0}, ht: 1.81},
      {id: "owls-p6", name: "謝柏諺", num: 80, role: "RP", stuff: 1.028, ctrl: 1.001, age: 21, pot: 1.003, throws: "R", arm: 0.909, body: {slim: 0, power: 0.23, heavy: 0}, ht: 1.8},
      {id: "owls-p7", name: "葉俊傑", num: 10, role: "RP", stuff: 0.961, ctrl: 0.959, age: 24, pot: 0.986, throws: "R", arm: 1.008, body: {slim: 0, power: 0, heavy: 0}, ht: 1.74},
      {id: "owls-p8", name: "沈冠均", num: 85, role: "RP", stuff: 0.97, ctrl: 0.998, age: 34, pot: 1.093, throws: "R", arm: 0.926, body: {slim: 0, power: 0, heavy: 0}, ht: 1.8},
      {id: "owls-p9", name: "楊冠瑋", num: 73, role: "RP", stuff: 0.955, ctrl: 0.961, age: 28, pot: 1.013, throws: "L", arm: 1.149, body: {slim: 0, power: 0, heavy: 0}, ht: 1.8},
    ],
  },
  { /* macaques */
    bat: [
      {id: "macaques-b1", name: "謝宗翰", num: 56, pos: "DH", con: 1.048, pow: 0.79, eye: 1.025, age: 29, pot: 1.068, arm: 0.96, avg: 0.295, spd: 0.905, hand: "R", body: {slim: 0, power: 0, heavy: 0}, ht: 1.85},
      {id: "macaques-b2", name: "吳偉倫", num: 4, pos: "CF", con: 1.296, pow: 0.912, eye: 1.209, age: 33, pot: 0.964, arm: 1.011, avg: 0.398, spd: 1.402, hand: "R", body: {slim: 1, power: 0, heavy: 0}, ht: 1.82},
      {id: "macaques-b3", name: "劉彥廷", num: 7, pos: "1B", con: 0.994, pow: 1.118, eye: 1.126, age: 29, pot: 1.042, arm: 0.937, avg: 0.272, spd: 0.948, hand: "R", body: {slim: 0, power: 0.49, heavy: 0.65}, ht: 1.8},
      {id: "macaques-b4", name: "鄭威廷", num: 51, pos: "3B", con: 1.166, pow: 0.756, eye: 0.958, age: 22, pot: 0.968, arm: 0.949, avg: 0.343, spd: 0.969, hand: "L", body: {slim: 0.51, power: 0, heavy: 0}, ht: 1.85},
      {id: "macaques-b5", name: "張俊宇", num: 62, pos: "LF", con: 1.176, pow: 0.833, eye: 1.16, age: 33, pot: 0.916, arm: 1.03, avg: 0.347, spd: 0.899, hand: "R", body: {slim: 0, power: 0, heavy: 0}, ht: 1.75},
      {id: "macaques-b6", name: "莊建勳", num: 57, pos: "2B", con: 0.978, pow: 1.153, eye: 0.978, age: 23, pot: 0.988, arm: 1.022, avg: 0.265, spd: 1.19, hand: "L", body: {slim: 0.74, power: 0.66, heavy: 0}, ht: 1.89},
      {id: "macaques-b7", name: "林冠廷", num: 15, pos: "SS", con: 0.978, pow: 0.91, eye: 0.951, age: 28, pot: 1.008, arm: 0.954, avg: 0.265, spd: 1.011, hand: "R", body: {slim: 0.16, power: 0, heavy: 0}, ht: 1.81},
      {id: "macaques-b8", name: "許冠宇", num: 46, pos: "C", con: 0.975, pow: 0.866, eye: 0.945, age: 28, pot: 0.926, arm: 1.034, avg: 0.264, spd: 1.036, hand: "R", body: {slim: 0.62, power: 0, heavy: 0}, ht: 1.85},
      {id: "macaques-b9", name: "林家豪", num: 49, pos: "RF", con: 0.828, pow: 0.41, eye: 0.921, age: 28, pot: 1.136, arm: 1.011, avg: 0.203, spd: 0.912, hand: "L", body: {slim: 1, power: 0, heavy: 0}, ht: 1.79},
    ],
    pit: [
      {id: "macaques-p1", name: "吳子豪", num: 2, role: "SP", stuff: 0.982, ctrl: 1.094, age: 26, pot: 0.99, throws: "R", arm: 0.902, body: {slim: 0, power: 0, heavy: 0}, ht: 1.88},
      {id: "macaques-p2", name: "鄭浩宇", num: 93, role: "SP", stuff: 1.041, ctrl: 1.1, age: 29, pot: 0.968, throws: "R", arm: 0.949, body: {slim: 0, power: 0.38, heavy: 0}, ht: 1.82},
      {id: "macaques-p3", name: "張書豪", num: 44, role: "SP", stuff: 1.028, ctrl: 0.985, age: 25, pot: 0.983, throws: "R", arm: 1.185, body: {slim: 0, power: 0.22, heavy: 0}, ht: 1.8},
      {id: "macaques-p4", name: "徐建廷", num: 75, role: "SP", stuff: 1.032, ctrl: 1.1, age: 30, pot: 1.01, throws: "R", arm: 0.888, body: {slim: 0, power: 0.27, heavy: 0}, ht: 1.85},
      {id: "macaques-p5", name: "楊冠傑", num: 69, role: "SP", stuff: 0.981, ctrl: 1.015, age: 31, pot: 1.052, throws: "R", arm: 0.927, body: {slim: 0, power: 0, heavy: 0}, ht: 1.76},
      {id: "macaques-p6", name: "曾俊傑", num: 45, role: "RP", stuff: 0.972, ctrl: 0.961, age: 23, pot: 0.95, throws: "L", arm: 1.032, body: {slim: 0, power: 0, heavy: 0}, ht: 1.84},
      {id: "macaques-p7", name: "黃育誠", num: 79, role: "RP", stuff: 1.013, ctrl: 1.099, age: 34, pot: 1.199, throws: "R", arm: 1.072, body: {slim: 0, power: 0.04, heavy: 0}, ht: 1.82},
      {id: "macaques-p8", name: "蘇品豪", num: 63, role: "RP", stuff: 1.022, ctrl: 0.956, age: 30, pot: 1.031, throws: "R", arm: 1.219, body: {slim: 0, power: 0.15, heavy: 0}, ht: 1.76},
      {id: "macaques-p9", name: "何宇翔", num: 71, role: "RP", stuff: 1.021, ctrl: 1.001, age: 24, pot: 1.151, throws: "R", arm: 0.964, body: {slim: 0, power: 0.14, heavy: 0}, ht: 1.81},
    ],
  },
  { /* muntjacs */
    bat: [
      {id: "muntjacs-b1", name: "李冠勳", num: 87, pos: "1B", con: 0.995, pow: 0.777, eye: 0.908, age: 29, pot: 1.086, arm: 0.959, avg: 0.272, spd: 1.174, hand: "R", body: {slim: 1, power: 0, heavy: 0}, ht: 1.93},
      {id: "muntjacs-b2", name: "楊育誠", num: 15, pos: "DH", con: 1.207, pow: 0.912, eye: 0.995, age: 25, pot: 1.165, arm: 1.106, avg: 0.36, spd: 1.351, hand: "L", body: {slim: 1, power: 0, heavy: 0}, ht: 1.83},
      {id: "muntjacs-b3", name: "張柏諺", num: 88, pos: "LF", con: 1.106, pow: 1.144, eye: 1.17, age: 30, pot: 0.986, arm: 1.035, avg: 0.318, spd: 0.922, hand: "R", body: {slim: 0, power: 0.62, heavy: 1}, ht: 1.77},
      {id: "muntjacs-b4", name: "劉冠廷", num: 94, pos: "RF", con: 1.021, pow: 1.409, eye: 0.885, age: 24, pot: 0.949, arm: 1.125, avg: 0.283, spd: 0.893, hand: "R", body: {slim: 0, power: 1, heavy: 1}, ht: 1.87},
      {id: "muntjacs-b5", name: "王冠宇", num: 18, pos: "3B", con: 1.117, pow: 0.881, eye: 1.007, age: 30, pot: 0.962, arm: 0.891, avg: 0.323, spd: 0.921, hand: "R", body: {slim: 0, power: 0, heavy: 0}, ht: 1.8},
      {id: "muntjacs-b6", name: "林家榮", num: 48, pos: "2B", con: 0.944, pow: 1.094, eye: 0.948, age: 28, pot: 0.926, arm: 0.941, avg: 0.251, spd: 0.933, hand: "L", body: {slim: 0, power: 0.37, heavy: 0.63}, ht: 1.79},
      {id: "muntjacs-b7", name: "蔡柏豪", num: 59, pos: "CF", con: 0.954, pow: 0.94, eye: 1.055, age: 34, pot: 1.005, arm: 1.126, avg: 0.255, spd: 0.982, hand: "L", body: {slim: 0, power: 0, heavy: 0}, ht: 1.76},
      {id: "muntjacs-b8", name: "蘇承佑", num: 27, pos: "C", con: 1.012, pow: 0.983, eye: 0.951, age: 31, pot: 1.007, arm: 0.996, avg: 0.279, spd: 0.897, hand: "R", body: {slim: 0, power: 0, heavy: 0.25}, ht: 1.86},
      {id: "muntjacs-b9", name: "張家瑋", num: 51, pos: "SS", con: 0.827, pow: 0.474, eye: 0.977, age: 32, pot: 0.925, arm: 0.996, avg: 0.203, spd: 0.921, hand: "R", body: {slim: 1, power: 0, heavy: 0}, ht: 1.74},
    ],
    pit: [
      {id: "muntjacs-p1", name: "李冠均", num: 45, role: "SP", stuff: 0.969, ctrl: 0.994, age: 26, pot: 1.048, throws: "R", arm: 0.895, body: {slim: 0, power: 0, heavy: 0}, ht: 1.82},
      {id: "muntjacs-p2", name: "洪承翰", num: 98, role: "SP", stuff: 1.102, ctrl: 0.969, age: 22, pot: 0.966, throws: "L", arm: 0.919, body: {slim: 0, power: 1, heavy: 0}, ht: 1.81},
      {id: "muntjacs-p3", name: "林冠霖", num: 28, role: "SP", stuff: 1.068, ctrl: 1.039, age: 26, pot: 1.051, throws: "R", arm: 1.179, body: {slim: 0, power: 0.72, heavy: 0}, ht: 1.75},
      {id: "muntjacs-p4", name: "郭哲瑋", num: 81, role: "SP", stuff: 1.022, ctrl: 1.021, age: 26, pot: 0.985, throws: "R", arm: 0.988, body: {slim: 0, power: 0.15, heavy: 0}, ht: 1.77},
      {id: "muntjacs-p5", name: "葉家宏", num: 95, role: "SP", stuff: 0.959, ctrl: 0.972, age: 33, pot: 1.17, throws: "R", arm: 1.219, body: {slim: 0, power: 0, heavy: 0}, ht: 1.89},
      {id: "muntjacs-p6", name: "郭宇軒", num: 7, role: "RP", stuff: 1.042, ctrl: 0.945, age: 32, pot: 1.001, throws: "L", arm: 0.899, body: {slim: 0, power: 0.4, heavy: 0}, ht: 1.83},
      {id: "muntjacs-p7", name: "林建廷", num: 85, role: "RP", stuff: 0.99, ctrl: 0.992, age: 25, pot: 0.962, throws: "L", arm: 0.898, body: {slim: 0, power: 0, heavy: 0}, ht: 1.77},
      {id: "muntjacs-p8", name: "何冠瑋", num: 70, role: "RP", stuff: 0.976, ctrl: 0.977, age: 22, pot: 1.343, throws: "R", arm: 1.011, body: {slim: 0, power: 0, heavy: 0}, ht: 1.88},
      {id: "muntjacs-p9", name: "李柏均", num: 86, role: "RP", stuff: 1.043, ctrl: 0.992, age: 31, pot: 0.993, throws: "L", arm: 0.922, body: {slim: 0, power: 0.41, heavy: 0}, ht: 1.8},
    ],
  },
];
