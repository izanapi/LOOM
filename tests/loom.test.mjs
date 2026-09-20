import test from 'node:test';
import assert from 'node:assert/strict';
import { SCALES, noteName, frequency, LOOM_SCALES, PALETTES, paletteColor } from '../music.mjs';
import { loomGeometry,warpX,weftY,intersection,crossedWarps,crossedWefts,degreeMidi,resonanceNotes,warpLayer,warpIntervals,droneX } from '../loom.mjs';
test('drone is exactly one KEY root independent of scale, warp and octave',()=>{
 for(const scale of Object.keys(SCALES))for(let root=0;root<12;root++)for(const octave of [-1,0,1])for(const id of [0,7,13])
  assert.deepEqual(resonanceNotes(id,11,{root,scale,octave}),[24+root]);
});
test('the entire drone string avoids triggering crossing warps',()=>{
 for(const [width,height] of [[320,250],[390,500],[900,660]]){
  const g=loomGeometry(width,height);
  for(let x=g.weftLeft;x<=g.right+10;x+=.5)assert.deepEqual(intersection({x,y:weftY(11,g)},g),{id:null,row:11});
 }
});
test('every string palette has a continuous multi-stop gradient',()=>{
 for(const name of Object.keys(PALETTES)){
  assert.equal(PALETTES[name].colors.length,3);
  assert.notEqual(paletteColor(name,0),paletteColor(name,1));
 }
});
test('vertical depth layers retain a stable fifth and octave around their boundaries',()=>{
 const g=loomGeometry(390,500),y=d=>g.top+d*(g.bottom-g.top);
 assert.deepEqual(warpIntervals(warpLayer(y(.1),g)),[0]);
 assert.deepEqual(warpIntervals(warpLayer(y(.6),g)),[0,7]);
 assert.deepEqual(warpIntervals(warpLayer(y(.9),g)),[0,7,12]);
 assert.equal(warpLayer(y(.46),g,1),1);assert.equal(warpLayer(y(.76),g,2),2);
});
test('quarter tones keep their pitch and readable labels',()=>{
 assert.equal(noteName(51.5),'E3↓50');assert.equal(noteName(60),'C4');
 assert.ok(Math.abs(frequency(60.5)/frequency(60)-2**(1/24))<1e-12);
 assert.ok(LOOM_SCALES.includes('rast')&&LOOM_SCALES.includes('bayati'));
 assert.ok(!LOOM_SCALES.includes('insen'));
});
test('every crossing targets the same pitch and row on small and large surfaces',()=>{
 for(const [w,h] of [[320,250],[390,550],[900,660]]){
  const g=loomGeometry(w,h);
  for(let id=0;id<14;id++)for(let row=0;row<12;row++)assert.deepEqual(intersection({x:warpX(id,g),y:weftY(row,g)},g),{id:row===11?null:id,row});
  assert.equal(intersection({x:0,y:0},g),null);
  assert.equal(crossedWarps({x:warpX(0,g),y:weftY(2,g)},{x:warpX(13,g),y:weftY(2,g)},g).length,13);
  assert.deepEqual(intersection({x:warpX(5,g)+g.dx*.55,y:weftY(2,g)},g,{id:5,row:2}),{id:5,row:2});
 }
});
test('the empty corner is silent and each arm of the L targets only its own strings',()=>{
  for(const [w,h] of [[320,250],[390,550],[900,660]]){
    const g=loomGeometry(w,h),x=(g.weftLeft+g.left)/2;
    assert.equal(intersection({x,y:g.top+10},g),null);
    assert.deepEqual(intersection({x:warpX(4,g),y:g.top+10},g),{id:4,row:null});
    assert.deepEqual(intersection({x,y:weftY(3,g)},g),{id:null,row:3});
    assert.deepEqual(crossedWefts({x,y:g.weftTop-g.dy},{x,y:g.weftBottom+g.dy},g).map(h=>h.row),Array.from({length:12},(_,i)=>i));
    assert.equal(crossedWarps({x,y:g.top+10},{x:g.width,y:g.top+10},g).length,14);
  }
});
test('ascending strings and BLOOM stay in every selected scale across octaves',()=>{
 for(const scale of Object.keys(SCALES))for(let root=0;root<12;root++)for(let octave=-1;octave<=1;octave++){
  const c={root,scale,octave};let previous=-Infinity;
  for(let id=0;id<14;id++){
   const midi=degreeMidi(id,c);assert(midi>previous);previous=midi;
   for(const note of resonanceNotes(id,0,c))assert(SCALES[scale].intervals.includes(((note-root)%12+12)%12));
  }
 }
});
