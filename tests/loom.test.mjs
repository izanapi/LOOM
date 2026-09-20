import test from 'node:test';
import assert from 'node:assert/strict';
import { SCALES } from '../music.mjs';
import { loomGeometry,warpX,weftY,intersection,crossedWarps,degreeMidi,resonanceNotes } from '../loom.mjs';
test('every crossing targets the same pitch and row on small and large surfaces',()=>{
 for(const [w,h] of [[320,250],[390,550],[900,660]]){
  const g=loomGeometry(w,h);
  for(let id=0;id<14;id++)for(let row=0;row<6;row++)assert.deepEqual(intersection({x:warpX(id,g),y:weftY(row,g)},g),{id,row});
  assert.equal(intersection({x:0,y:0},g),null);
  assert.equal(crossedWarps({x:warpX(0,g),y:weftY(2,g)},{x:warpX(13,g),y:weftY(2,g)},g).length,13);
  assert.deepEqual(intersection({x:warpX(5,g)+g.dx*.55,y:weftY(2,g)},g,{id:5,row:2}),{id:5,row:2});
 }
});
test('ascending strings and BLOOM stay in every selected scale across octaves',()=>{
 for(const scale of Object.keys(SCALES))for(let root=0;root<12;root++)for(let octave=-1;octave<=1;octave++){
  const c={root,scale,octave};let previous=-Infinity;
  for(let id=0;id<14;id++){
   const midi=degreeMidi(id,c);assert(midi>previous);previous=midi;
   for(const note of resonanceNotes(id,1,c))assert(SCALES[scale].intervals.includes(((note-root)%12+12)%12));
  }
 }
});
