/* #563 part 7: the broadcast field map (grass stripes, dirt, mound, base paths, chalk, worn dabs, grain), moved out of render/game.js
   so the 九宮格 3D field (ui/baseball9/field3d.js) paints the same ground. Pure canvas 2D: no three.js, no DOM at load, no randomness
   outside its fixed LCGs (same park every load). Frame: home plate at (0,0), x to first base on the right, centre field at -z, metres.
   `drawFieldTex(doc)` -> {c,g,X,Y,S}: the 3072 px canvas, its 2D context and the metre -> pixel maps; game.js wraps it in a texture. */
export const FIELD_X0=-130,FIELD_Z0=-150,FIELD_W=260,FIELD_H=190,FIELD_PX=3072;
export const CHALK_SCUFFS=420,FIELD_WEAR_R=30,BOX_SCUFFS=160,BASE_DUST=60,DIRT_RGB='122,88,58';
export function drawFieldTex(doc){
  const X0=FIELD_X0,Z0=FIELD_Z0,W=FIELD_W,H=FIELD_H,S=FIELD_PX/W,c=doc.createElement('canvas');c.width=FIELD_PX;c.height=Math.round(H*S);
  const g=c.getContext('2d'),X=x=>(x-X0)*S,Y=z=>(z-Z0)*S;
  const wedge=r=>{g.beginPath();g.moveTo(X(0),Y(0));for(let a=-45;a<=45;a+=1){const t=a*Math.PI/180;g.lineTo(X(Math.sin(t)*r),Y(-Math.cos(t)*r))}g.closePath()};
  g.fillStyle='#2c6331';g.fillRect(0,0,c.width,c.height);
  g.save();wedge(110);g.clip();for(let z=-150,i=0;z<10;z+=6,i++){g.fillStyle=i%2?'#27662c':'#317a36';g.fillRect(0,Y(z),c.width,6*S)}g.restore();
  g.save();wedge(110);g.fillStyle='#7a5a3c';g.fill();wedge(106);g.clip();for(let z=-150,i=0;z<10;z+=6,i++){g.fillStyle=i%2?'#27662c':'#317a36';g.fillRect(0,Y(z),c.width,6*S)}g.restore();
  g.fillStyle='#9c6b42';g.beginPath();g.arc(X(0),Y(-18.4),29*S,0,7);g.fill();
  g.fillStyle='#3a8440';g.beginPath();g.moveTo(X(0),Y(-3.2));g.lineTo(X(16.2),Y(-19.4));g.lineTo(X(0),Y(-35.6));g.lineTo(X(-16.2),Y(-19.4));g.closePath();g.fill();
  g.fillStyle='#9c6b42';for(const [x,z,r] of [[0,-18.4,2.7],[0,0,4],[19.4,-19.4,2.2],[0,-38.8,2.2],[-19.4,-19.4,2.2]]){g.beginPath();g.arc(X(x),Y(z),r*S,0,7);g.fill()}
  g.strokeStyle='#fff';g.lineWidth=.12*S;
  for(const s of [-1,1]){g.beginPath();g.moveTo(X(0),Y(0));g.lineTo(X(s*Math.sin(Math.PI/4)*110),Y(-Math.cos(Math.PI/4)*110));g.stroke();g.strokeRect(X(s>0?.6:-1.5),Y(-.9),.9*S,1.8*S)}
  g.fillStyle='#fff';for(const [x,z] of [[19.4,-19.4],[0,-38.8],[-19.4,-19.4]]){g.save();g.translate(X(x),Y(z));g.rotate(Math.PI/4);g.fillRect(-.22*S,-.22*S,.44*S,.44*S);g.restore()}
  g.beginPath();g.moveTo(X(-.22),Y(-.22));g.lineTo(X(.22),Y(-.22));g.lineTo(X(.22),Y(0));g.lineTo(X(0),Y(.22));g.lineTo(X(-.22),Y(0));g.closePath();g.fill();
  g.fillRect(X(-.3),Y(-18.5),.6*S,.15*S);
  /* #150 round 2: worn chalk, dusty bases, plate and rubber. Dirt-coloured dabs (fixed LCG, same park every load): CHALK_SCUFFS along each
     foul line inside FIELD_WEAR_R, heavier rub-out on the batter's boxes, a dusting on each base, the plate and the rubber. */
  {let r=4242;const R=()=>(r=(r*1103515245+12345)&0x7fffffff)/0x7fffffff,dab=(x,z,rad,n,a,col)=>{for(let i=0;i<n;i++){const t=R()*6.283,d=Math.sqrt(R())*rad,s=(.03+R()*.09)*S;
      g.fillStyle=`rgba(${col},${a*(.4+R()*.6)})`;g.fillRect(X(x+Math.cos(t)*d)-s/2,Y(z+Math.sin(t)*d)-s/2,s,s*(.5+R()))}};
    for(const s of [-1,1])for(let i=0;i<CHALK_SCUFFS;i++){const L=R()*FIELD_WEAR_R;dab(s*L*Math.SQRT1_2,-L*Math.SQRT1_2,.12,1,.55,DIRT_RGB)}
    for(const x of [-1.05,1.05])dab(x,-.1,1.1,BOX_SCUFFS,.6,DIRT_RGB);
    for(const [x,z] of [[19.4,-19.4],[0,-38.8],[-19.4,-19.4],[0,0]])dab(x,z,.24,BASE_DUST,.35,DIRT_RGB);
    dab(0,-18.42,.3,BASE_DUST,.4,DIRT_RGB)}
  try{const im=g.getImageData(0,0,c.width,c.height),d=im.data;let r=12345;for(let i=0;i<d.length;i+=4){r=(r*1103515245+12345)&0x7fffffff;const n=((r>>16)&31)-15;d[i]+=n;d[i+1]+=n*1.1;d[i+2]+=n*.7}g.putImageData(im,0,0)}catch(e){}
  return {c,g,X,Y,S};
}
