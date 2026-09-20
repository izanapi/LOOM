import { SCALES, clamp } from './music.mjs?v=prism-7';

export const WARP_COUNT = 14;
export const HOLD_SECONDS = .32;
export const WEFTS = [
  { name: 'BLOOM', kind:'bloom', detail: 'opening swell' },
  { name: 'HARM', kind:'harm', detail: 'upper partials' },
  { name: 'DUST', kind:'dust', detail: 'scattered string grains' },
  { name: 'FIFTH', kind:'fifth', detail: 'open fifth' },
  { name: 'SILK', kind:'silk', detail: 'soft bowed shimmer' },
  { name: 'THIRD', kind:'third', detail: 'scale harmony' },
  { name: 'SHIMMER', kind:'shimmer', detail: 'trembling high light' },
  { name: 'OCTAVE', kind:'octave', detail: 'double course' },
  { name: 'ECHO', kind:'echo', detail: 'returning neighbors' },
  { name: 'ROOT', kind:'root', detail: 'last-note drone' },
  { name: 'MIRAGE', kind:'mirage', detail: 'reversed string grains' },
  { name: 'DRONE', kind:'drone', detail: 'deep sustained foundation' },
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
  // The bass course has its own frets; crossing it must not pluck a warp.
  return {id:row===WEFTS.length-1?null:id,row};
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
export function resonanceNotes(id, row, config, fret=0) {
  const base=degreeMidi(id,config);
  const steps=SCALES[config.scale].intervals;
  const bass=24+Number(config.root)+(fret>=steps.length?12:steps[clamp(fret,0,steps.length-1)]);
  return {
    bloom:[base,degreeMidi(id+2,config),degreeMidi(id+4,config)],
    harm:[base+12,base+19,base+24], dust:[base,base+12], fifth:[base,base+7],
    silk:[base,degreeMidi(id+4,config)], third:[base,degreeMidi(id+2,config)],
    shimmer:[base+12,base+24], octave:[base,base+12],
    echo:[base,degreeMidi(id+1,config),base+12], root:[base-12,base],
    mirage:[base,degreeMidi(id-1,config)+12], drone:[bass,bass+12],
  }[WEFTS[row].kind];
}
export const wovenChord = id => [0,2,4].map(offset=>(id+offset)%WARP_COUNT);
export const isHarmony = row => row!==null && ['bloom','harm','fifth','third','octave','root','drone'].includes(WEFTS[row].kind);
export const weftRelease = row => WEFTS[row].kind==='drone'?7:isHarmony(row)?.6:3.5;
export const isDrone = row => WEFTS[row]?.kind==='drone';
export function droneFret(x,g,scale,previous=null){
  const count=SCALES[scale].intervals.length+1,step=(g.right+10-g.weftLeft)/count;
  if(!Number.isFinite(x))return 0;
  const position=(x-g.weftLeft)/step;
  if(previous!==null&&position>previous-.12&&position<previous+1.12)return previous;
  return clamp(Math.floor(position),0,count-1);
}
export function droneX(fret,g,scale){const n=SCALES[scale].intervals.length;return g.weftLeft+(clamp(fret,0,n)+.5)*(g.right+10-g.weftLeft)/(n+1);}
// Depth is measured along a string, never against the moving wave itself.
export function warpLayer(y,g,previous=0){
  const depth=(y-g.top)/(g.bottom-g.top),h=.018;
  if(depth>=(previous===2?.76-h:.76+h))return 2;
  if(depth>=(previous>=1?.46-h:.46+h))return 1;
  return 0;
}
export const warpIntervals = layer => layer===2?[0,7,12]:layer===1?[0,7]:[0];
