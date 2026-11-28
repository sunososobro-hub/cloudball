/* 試跑 marker (#750). Pure: no imports, no clock, no randomness, no DOM, no network.
 * Every trial file carries `trial: true`: league/site/season.json at the top, each record of league/site/farm_games.json.
 * Trial data is never official (rule 24, owner 2026-11-28 08:59 TPE on #743): the official record writer refuses it.
 *
 *   isTrial(x)                    true for an object with trial === true, or an array holding one
 *   officialProblem(x)            TRIAL_REFUSED when x is trial data, else null
 *   assertOfficial(x, what)       throws `<what>: TRIAL_REFUSED` for trial data, else returns x */
export const TRIAL_REFUSED = 'trial (試跑) data is never official: rule 24, #750';

export const isTrial = x => !!x && typeof x === 'object' && (Array.isArray(x) ? x.some(isTrial) : x.trial === true);

export const officialProblem = x => (isTrial(x) ? TRIAL_REFUSED : null);

export function assertOfficial(x, what = 'input') {
  const why = officialProblem(x);
  if (why) throw new Error(`${what}: ${why}`);
  return x;
}
