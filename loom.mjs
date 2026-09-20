import { SCALES, clamp } from './music.mjs?v=corner-3';

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
  const left = width * .47, right = width - (width < 500 ? 22 : 52);
  const top = 44, bottom = height - 60;
  const weftLeft = width < 500 ? 54 : 76, weftBottom = bottom - 18;
  const weftTop = weftBottom - clamp((bottom-top)*.34, 100, 168);
  return { width, height, left, right, top, bottom, weftLeft, weftTop, weftBottom,
    dx: (right-left)/(WARP_COUNT-1), dy: (weftBottom-weftTop)/(WEFTS.length-1) };
}
export const warpX = (id, g) => g.left + id*g.dx;
export const weftY = (row, g) => g.weftTop + row*g.dy;
export function intersection(point, g, previous = null) {
  const vertical = point.x >= g.left-g.dx*.6 && point.x <= g.right+g.dx*.6 && point.y >= g.top-8 && point.y <= g.bottom+8;
  const horizontal = point.x >= g.weftLeft-8 && point.x <= g.right+12 && point.y >= g.weftTop-g.dy*.55 && point.y <= g.weftBottom+g.dy*.55;
  if (!vertical && !horizontal) return null;
  let id = vertical ? clamp(Math.round((point.x-g.left)/g.dx),0,WARP_COUNT-1) : null;
  let row = horizontal ? clamp(Math.round((point.y-g.weftTop)/g.dy),0,WEFTS.length-1) : null;
  // Fixed touch geometry, with hysteresis independent of animated displacement.
  if (vertical && previous?.id != null && Math.abs(point.x-warpX(previous.id,g)) < g.dx*.61) id=previous.id;
  if (horizontal && previous?.row != null && Math.abs(point.y-weftY(previous.row,g)) < g.dy*.59) row=previous.row;
  return {id,row};
}
export function crossedWarps(from, to, g) {
  const count=Math.min(160,Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.y-from.y)/5)));
  let previous=intersection(from,g)?.id; const result=[];
  for(let i=1;i<=count;i++) {
    const p={x:from.x+(to.x-from.x)*i/count,y:from.y+(to.y-from.y)*i/count};
    const hit=intersection(p,g);
    if(hit?.id != null && hit.id!==previous) result.push({...hit,y:p.y});
    previous=hit?.id;
  }
  return result;
}
export function crossedWefts(from, to, g) {
  const count=Math.min(160,Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.y-from.y)/4)));
  let previous=intersection(from,g)?.row; const result=[];
  for(let i=1;i<=count;i++) {
    const p={x:from.x+(to.x-from.x)*i/count,y:from.y+(to.y-from.y)*i/count};
    const hit=intersection(p,g);
    if(hit?.row != null && hit.row!==previous) result.push({...hit,x:p.x,y:p.y});
    previous=hit?.row;
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
