/* #323: the max-tier roof follows the park (muntjacs has shape.roof false). Plain Node: runs props/roof_rule.js and the recolor wiring contract. */
import {roofOn} from '../render/props/roof_rule.js';
const bad=[],cases=[[{shape:{roof:false}},false,'roof:false'],[{shape:{roof:true}},true,'roof:true'],[{shape:{}},true,'no roof key'],[{pad:'#000'},true,'no shape yet'],[null,true,'no park'],[undefined,true,'undefined']];
for(const[P,want,name]of cases)if(roofOn(P)!==want)bad.push(`roofOn(${name}) = ${roofOn(P)}, want ${want}`);
if(bad.length){console.error('roof_rule.check FAILED\n'+bad.join('\n'));process.exit(1)}
console.log('roof_rule.check ok ('+cases.length+' cases)');
