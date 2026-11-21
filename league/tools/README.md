# league/tools

Hand-run tools for league data. Nothing here runs at game time.

- `names.mjs`: draws "market names" (the most common real Taiwanese names) for league people.
  `node league/tools/names.mjs` prints, `--write` rewrites only the `name` fields of `../players.js`;
  `--staff [--write]` does the same for `../staff.js` (`STAFF_SEED`, player full names taken, a coach
  never shares a given name with a player of his team).
  Deterministic (`NAME_SEED`); `drawNames(people, {taken})` is exported for staff and umpires.
- `blocklist.txt`: full names of real athletes, one per line; `#` lines are section headers.
  No league person may carry one of these names. `tests/names.check.mjs` enforces it.

## Name statistics (source of the pools in names.mjs)

Ministry of the Interior (內政部戶政司), 《全國姓名統計分析》, edition based on household
registration data of 2023-06-30 (民國112年), published 2023-10-30. Used from it: the surname
frequency order (陳 林 黃 張 李 王 吳 劉 蔡 楊 ...), the national top male given names
(家豪, 志明, 建宏, 俊傑, 俊宏, 志偉, 志豪, 文雄, 金龍, 正雄, 承翰, 冠宇) and the generation trend
(承恩, 宥廷, 品睿 for births after 2011; 恩碩 for 2021). The per-decade tables of the report could
not be downloaded from this environment, so the decade pools and the surname shares are curated
approximations in that order, not copied tables. Checked 2026-11-21.

## Blocklist sources (names only, no other personal data; checked 2026-11-21)

1. CPBL first team 1990-2025: every name in the yearly batting and pitching records scraped from
   the CPBL official site, repository `Dk1422ss/-cpbl-player-stats` (commit 7b51b76), folder
   `CPBL_Players/Records`. 1990 names. Players who never appeared in a first-team game are missing.
2. CPBL first team 2026: season data of 2026-10, repository `Eat1ng233/cpbl-players-9-grids`
   (commit 3f86aaa), `index.html`. 10 names not already in list 1.
3. Hand list: Taiwanese players in MLB, NPB and KBO organisations, and national-team players in
   basketball, football and volleyball, plus a few other well-known Taiwanese athletes, compiled
   from zh.wikipedia national-team pages, the CTFA selection minutes of 2025-10-23 and news
   coverage (NOWnews, udn, TVBS, Marie Claire Taiwan). Incomplete by nature: add a name whenever a
   real athlete is spotted, then rerun the check.
4. CPBL coaches and umpires (#52): names in 2016-2026 news coverage of umpires (The News Lens,
   CNA, Mirror Media, NOWnews, TVBS) and of the 2025-2026 coaching staffs (TVBS, CNA, NOWnews, udn).
   Only names not already in lists 1-3 (most coaches are former CPBL players). Checked 2026-11-21.
