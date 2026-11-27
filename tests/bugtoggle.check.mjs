/* Guard for the scoreboard 顯示/隱藏 toggle (#629, ui/layout.js). Runs the real script against a tiny fake DOM.
 * Fails when: default is not shown; the toggle does not hide / show; the choice is not saved in localStorage 'zu_bug';
 * a saved '0' does not start hidden; hidden shows no corner tag with the score; the tag does not bring it back;
 * a browser that throws on storage breaks the toggle. Usage: node tests/bugtoggle.check.mjs */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [], bad = m => problems.push(m);
const src = readFileSync(path.join(ROOT, 'ui/layout.js'), 'utf8');
function run(store, throwing) {
  const cls = new Set(), els = {};
  const mk = id => els[id] ||= { id, hidden: false, style: {}, children: [], textContent: '', attrs: {}, classList: { toggle() {}, add() {}, remove() {} },
    setAttribute(k, v) { this.attrs[k] = String(v); }, addEventListener() {}, getBoundingClientRect: () => ({}), querySelector(q) { return this.q && this.q[q] || null; }, appendChild() {} };
  mk('bt0').q = { '.tn': { textContent: '雲' }, '.sc': { textContent: '3' } }; mk('bt1').q = { '.tn': { textContent: '風' }, '.sc': { textContent: '2' } };
  const body = { classList: { toggle: (c, on) => on ? cls.add(c) : cls.delete(c), add: c => cls.add(c) }, appendChild() {} };
  const ls = throwing ? { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } } : { getItem: k => k in store ? store[k] : null, setItem: (k, v) => { store[k] = String(v); } };
  const ctx = { window: {}, document: { body, createElement: () => mk('x' + Math.random()), querySelector: () => null, fullscreenElement: null }, localStorage: ls,
    getComputedStyle: () => ({}), addEventListener() {}, setInterval() {}, matchMedia: () => ({ matches: false, addEventListener() {} }), navigator: { userAgent: '', maxTouchPoints: 0 },
    MutationObserver: class { observe() {} }, screen: {}, innerWidth: 800, innerHeight: 400, isFinite, parseFloat, Math, JSON };
  ctx.window = ctx; vm.createContext(ctx); vm.runInContext(src, ctx);
  const $ = id => mk(id); ctx.UILAYOUT({ $, clamp: (v, a, b) => Math.min(b, Math.max(a, v)), note() {} });
  return { cls, $, store };
}
let r = run({});
if (r.cls.has('nobug') || !r.$('bugTag').hidden) bad('default must show the scoreboard');
r.$('sbToggle').onclick(); if (!r.cls.has('nobug')) bad('toggle did not hide'); if (r.store.zu_bug !== '0') bad('hide not saved');
if (r.$('bugTag').hidden) bad('no corner tag when hidden'); if (!/3/.test(r.$('bugTag').textContent) || !/2/.test(r.$('bugTag').textContent)) bad('tag lacks the score: ' + r.$('bugTag').textContent);
r.$('bugTag').onclick(); if (r.cls.has('nobug') || r.store.zu_bug !== '1') bad('tag did not bring it back');
r = run({ zu_bug: '0' }); if (!r.cls.has('nobug')) bad('saved 0 must start hidden');
r = run({}, true); try { r.$('sbToggle').onclick(); if (!r.cls.has('nobug')) bad('toggle fails without storage'); } catch (e) { bad('storage throw escaped: ' + e.message); }
if (problems.length) { console.error('bugtoggle.check FAIL\n' + problems.join('\n')); process.exit(1); }
console.log('bugtoggle.check ok');
