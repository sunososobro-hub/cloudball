/* 友誼賽 daily limit (#810 part 2): starting a game of your own arrangement uses one of PRACTICE_PER_DAY (league/practice.js).
 * The count lives in this browser's localStorage only; no server call, nothing official (rules 10, 24). A friend who opens a share link is not counted:
 * the link goes straight to play.html. Blocked storage = no limit, the game still plays. */
import { practiceLeft, practiceUse, PRACTICE_PER_DAY } from '../league/practice.js';

export { PRACTICE_PER_DAY };
const pad = n => String(n).padStart(2, '0');
/** 'YYYY-MM-DD' of the visitor's local day (the limit resets at his midnight). */
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const defStore = () => { try { return window.localStorage; } catch (e) { return {}; } };
export const gamesLeft = (store = defStore(), day = dayKey()) => practiceLeft(store, day);
export const takeGame = (store = defStore(), day = dayKey()) => practiceUse(store, day);
