import { SCALES, clamp } from './music.mjs';

export const WARP_COUNT = 14;
export const HOLD_SECONDS = .32;
export const WEFTS = [
  { name: 'HARM', detail: 'upper partials', hue: 184 },
  { name: 'BLOOM', detail: 'woven harmony', hue: 161 },
  { name: 'FIFTH', detail: 'open resonance', hue: 147 },
  { name: 'DUST', detail: 'grains of string', hue: 38 },
  { name: 'ECHO', detail: 'returning thread', hue: 208 },
  { name: 'ROOT', detail: 'low drone', hue: 25 },
];
export function loomGeometry(width, height) {
  const left = width < 500 ? 54 : 82, right = width - (width < 500 ? 22 : 52);
  const top = 44, bottom = height - 60;
  return { width, height, left, right, top, bottom, dx: (right-left)/(WARP_COUNT-1), dy: (bottom-top-36)/(WEFTS.length-1) };
}
export const warpX = (id, g) => g.left + id*g.dx;
export const weftY = (row, g) => g.top + 18 + row*g.dy;
export function intersection(point, g, previous = null) {
  if (point.x < g.left-g.dx*.7 || point.x > g.right+g.dx*.7 || point.y < g.top-12 || point.y > g.bottom+12) return null;
  let id = clamp(Math.round((point.x-g.left)/g.dx),0,WARP_COUNT-1);
  let row = clamp(Math.round((point.y-g.top-18)/g.dy),0,WEFTS.length-1);
  // Fixed touch geometry, with hysteresis independent of animated displacement.
  if (previous && Math.abs(point.x-warpX(previous.id,g)) < g.dx*.61) id=previous.id;
  if (previous && Math.abs(point.y-weftY(previous.row,g)) < g.dy*.59) row=previous.row;
  return {id,row};
}
export function crossedWarps(from, to, g) {
  const count=Math.min(160,Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.y-from.y)/5)));
  let previous=intersection(from,g)?.id; const result=[];
  for(let i=1;i<=count;i++) {
    const p={x:from.x+(to.x-from.x)*i/count,y:from.y+(to.y-from.y)*i/count};
    const hit=intersection(p,g);
    if(hit && hit.id!==previous) result.push({...hit,y:p.y});
    previous=hit?.id;
  }
  return result;
}
export function degreeMidi(degree, config) {
  const steps=SCALES[config.scale].intervals, n=steps.length;
  return 48+Number(config.root)+config.octave*12+Math.floor(degree/n)*12+steps[((degree%n)+n)%n];
}
export function resonanceNotes(id, row, config) {
  const base=degreeMidi(id,config), tonic=degreeMidi(0,config);
  return [
    [base+12,base+19,base+24],
    [base,degreeMidi(id+2,config),degreeMidi(id+4,config)],
    [base,base+7,base+12],
    [base,base+12],
    [base,degreeMidi(id+1,config),base+12],
    [tonic-12,base-12],
  ][row];
}
