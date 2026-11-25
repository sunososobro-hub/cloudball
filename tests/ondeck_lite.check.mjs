/* #392: the cheap on-deck circles of the non-max tiers. Plain Node: render/ondeck_lite.js is pure data, game.js builds one 'old:ondeck' mesh per part.
 * Checks: 2 parts per circle, 4 meshes for both, same spot and size as props/ondeck.js DECK (read from its source), road +x / home -x,
 * the ring lies inside the mat and above it, game.js builds the meshes and recolours the rings, props/ondeck.js hides old:ondeck on max. */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {liteOnDeck,LITE} from '../render/ondeck_lite.js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),bad=[];
const src=readFileSync(path.join(ROOT,'render/props/ondeck.js'),'utf8'),game=readFileSync(path.join(ROOT,'render/game.js'),'utf8');
const num=k=>{const m=src.match(new RegExp('export const DECK=\\{[\\s\\S]*?\\b'+k+':([0-9.]+)'));return m?+m[1]:NaN};
for(const k of ['X','Z','R','H'])if(num(k)!==LITE[k])bad.push(`LITE.${k}=${LITE[k]} but props/ondeck.js DECK.${k}=${num(k)}`);
const rg=src.match(/RING:\[([0-9.]+),([0-9.]+)\]/);if(!rg||+rg[1]!==LITE.RING[0]||+rg[2]!==LITE.RING[1])bad.push('LITE.RING differs from props/ondeck.js DECK.RING');
let total=0;
for(const side of [-1,1]){const d=liteOnDeck(side);total+=d.length;
  if(d.length!==2)bad.push(`side ${side}: ${d.length} parts, want 2`);
  const mat=d.find(p=>p.kind==='mat'),ring=d.find(p=>p.kind==='ring');
  if(!mat||!ring){bad.push(`side ${side}: needs a mat and a ring`);continue}
  if(Math.sign(mat.x)!==side||Math.abs(mat.x)!==LITE.X||mat.z!==LITE.Z)bad.push(`side ${side}: circle at ${mat.x},${mat.z}`);
  if(!(ring.r0>0&&ring.r1>ring.r0&&ring.r1<=mat.r0))bad.push(`side ${side}: ring ${ring.r0}..${ring.r1} not inside the mat ${mat.r0}`);
  if(!(ring.y>mat.y+mat.h/2))bad.push(`side ${side}: ring is not above the mat top`)}
if(total>4)bad.push(`${total} meshes, want <= 4`);
if(!/old:ondeck/.test(game)||!/liteOnDeck/.test(game))bad.push('game.js does not build the lite on-deck circles');
if(!/deckRings/.test(game.slice(game.indexOf('function applyPark'),game.indexOf('parkHook=applyPark')))) bad.push('applyPark does not recolour the lite rings');
if(!/old:\s*c=>c\.old\('ondeck'\)/.test(src))bad.push('props/ondeck.js does not hide old:ondeck on max');
if(bad.length){console.error('ondeck_lite.check FAILED\n'+bad.join('\n'));process.exit(1)}
console.log('ondeck_lite.check ok (2 circles x 2 parts)');
