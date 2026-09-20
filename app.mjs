import { NOTES, SCALES, LOOP_STEPS, clamp, noteName, stepSeconds, loopStep, bpmFromTaps, randomPatch, accompanimentPhrase, recordingClick } from './music.mjs';
import { InstrumentAudio } from './audio.mjs';
import { VOICES } from './voices.mjs';
import { WARP_COUNT, WEFTS, HOLD_SECONDS, loomGeometry, warpX, weftY, intersection, crossedWarps, degreeMidi, resonanceNotes } from './loom.mjs';
import { LoomResonance } from './resonance.mjs';

const $=id=>document.getElementById(id);
const canvas=$('canvas'),ctx=canvas.getContext('2d'),audio=new InstrumentAudio();
const config={root:0,scale:'insen',voice:'koto',octave:0,palette:'aurora',bpm:92,swing:0,glow:55,showNotes:true,calm:false,metronome:false};
const fingers=new Map(),pressedKeys=new Set(),pulses=[],visualQueue=[];
const strings=Array.from({length:WARP_COUNT},(_,id)=>({id,energy:0,last:-10}));
const rows=WEFTS.map(()=>({energy:0}));
const clock={timer:null,step:0,next:0};
const flow={enabled:false,startStep:0,cycle:-1,phrase:[]};
const loop={state:'empty',events:[],startStep:0,startTime:0,visibleStep:0};
let geometry=loomGeometry(390,420),lastFrame=0,frameTime=0,muted=false,lastNoteTime=-10,taps=[],generation=0;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const calm=()=>config.calm||reducedMotion.matches;
const midi=id=>degreeMidi(id,config);
const resonance=new LoomResonance(audio,(id,row,time,source)=>visualQueue.push({id,row,time,strength:.3,y:weftY(row,geometry),fromLoop:source==='loop'}));
const selectOptions=(element,options)=>{for(const [value,label] of options){const o=document.createElement('option');o.value=value;o.textContent=label;element.append(o);}};
selectOptions($('root'),NOTES.map((n,i)=>[i,n]));
selectOptions($('scale'),Object.entries(SCALES).map(([k,s])=>[k,s.name]));
selectOptions($('voice'),Object.entries(VOICES).map(([k,v])=>[k,v.name]));
for(const id of ['voice','scale','palette']) $(id).value=config[id];
$('glow').value=config.glow;$('glowValue').value=config.glow;
function resize(){
  releaseAll();
  const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
  canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
  geometry=loomGeometry(r.width,r.height);
}
new ResizeObserver(resize).observe($('stage'));resize();
function tuningReadout(){ $('keyReadout').textContent=`${NOTES[config.root]} · ${SCALES[config.scale].name.toUpperCase()}`; }
function hint(message){$('hint').textContent=message;}
function startAudio(){
  const currentGeneration=generation;
  audio.unlock().then(()=>{
    if(generation!==currentGeneration||document.hidden)return;
    if(clock.timer===null){clock.next=audio.time+.035;clock.step=0;clock.timer=setInterval(schedule,25);schedule();}
  }).catch(()=>hint('Audio unavailable. Touch a string to retry.'));
}
function colorFor(id,light=70,alpha=1){
  const hue=config.palette==='ember'?24+id*3:config.palette==='neon'?175+id*11:155+id*4.4;
  return `hsla(${hue},65%,${light}%,${alpha})`;
}
function rowColor(row,alpha=1){return `hsla(${WEFTS[row].hue},65%,72%,${alpha})`;}
function visualize(id,strength=.7,fromLoop=false,row=null,y=geometry.height*.5){
  strings[id].energy=Math.max(strings[id].energy,strength);
  if(row!==null) rows[row].energy=Math.max(rows[row].energy,strength);
  pulses.push({id,row,y:row!==null?weftY(row,geometry):y,age:0,strength,fromLoop});if(pulses.length>140)pulses.shift();
  $('noteReadout').textContent=noteName(midi(id))+(row!==null?' × '+WEFTS[row].name:'')+(fromLoop?' / LOOP':'');lastNoteTime=frameTime;
}
function setLoopState(state){
  loop.state=state;
  if(state==='empty'||state==='armed')$('loopProgress').style.width='0%';
  const labels={empty:'REC',armed:'ARMED',recording:'REC',playing:'PAUSE',paused:'PLAY'};
  const icons={empty:'●',armed:'●',recording:'●',playing:'Ⅱ',paused:'▶'};
  $('loopLabel').textContent=labels[state];$('loopIcon').textContent=icons[state];
  $('loop').classList.toggle('recording',state==='armed'||state==='recording');$('loop').classList.toggle('playing',state==='playing');
  $('loop').setAttribute('aria-label',labels[state]+': two-bar loop');$('clearLoop').disabled=state==='empty';
  $('bpm').disabled=state==='recording';$('tap').disabled=state==='recording';
  $('loopStatus').textContent={empty:'2 BARS · CROSSINGS + NOTES',armed:'PLAY TO RECORD',recording:'RECORDING · 2 BARS',playing:'LOOPING · CROSSINGS + NOTES',paused:'PAUSED'}[state];
  if(state!=='playing'&&state!=='recording'){
    resonance.stopSource('loop');
    for(let i=visualQueue.length-1;i>=0;i--)if(visualQueue[i].fromLoop)visualQueue.splice(i,1);
  }
}
function record(event,when=audio.time){
  if(loop.state==='armed'){
    loop.events=[];loop.startStep=clock.step;loop.startTime=clock.timer===null?when+.035:clock.next;setLoopState('recording');
  }
  if(loop.state!=='recording'||when>=loop.startTime+LOOP_STEPS*stepSeconds(config.bpm)||loop.events.length>=512)return null;
  const item={...event,step:loopStep(when,loop.startTime,config.bpm)};
  loop.events.push(item);return item;
}
function emit(id,velocity=.65,brightness=.6,when=audio.time,source='live',interval=0,y=geometry.height*.5){
  id=((id%WARP_COUNT)+WARP_COUNT)%WARP_COUNT;if(!audio.context)return;
  if(source==='live')record({type:'pluck',id,velocity,brightness,interval,y:(y-geometry.top)/(geometry.bottom-geometry.top)},when);
  audio.play(midi(id)+interval,{voice:source==='flow'?'velvet':config.voice,velocity,brightness,when,pan:(id/(WARP_COUNT-1)-.5)*1.1});
  const visual={time:when,id,strength:velocity,fromLoop:source==='loop',row:null,y};
  if(when>audio.time+.015)visualQueue.push(visual);else visualize(id,velocity,source==='loop',null,y);
}
function pluck(id,velocity,brightness,y){
  const now=performance.now()/1000;if(now-strings[id].last<.035)return;
  strings[id].last=now;emit(id,velocity,brightness,audio.time,'live',0,y);
}
function couple(finger,when=audio.time){
  if(finger.id===null||finger.row===null||finger.handle)return;
  finger.coupled=true;finger.joined=when;
  finger.handle=resonance.start(resonanceNotes(finger.id,finger.row,config),finger.row,{id:finger.id,level:finger.velocity,pan:(finger.id/13-.5)*.9});
  finger.record=record({type:'weave',id:finger.id,row:finger.row,velocity:finger.velocity,duration:1},when);
  visualize(finger.id,.75,false,finger.row);
}
function uncouple(finger){
  if(finger.record){
    const d=stepSeconds(config.bpm),end=loop.startTime+LOOP_STEPS*d;
    finger.record.duration=clamp((Math.min(audio.time,end)-finger.joined)/d,.12,LOOP_STEPS-finger.record.step);
    finger.record=null;
  }
  if(finger.handle)resonance.stop(finger.handle);finger.handle=null;
}
function releaseAll(){for(const f of fingers.values())uncouple(f);fingers.clear();pressedKeys.clear();}
function updateFingers(){
  for(const f of fingers.values()){
    if(f.id===null)continue;
    if(!f.coupled&&audio.time-f.started>=HOLD_SECONDS)couple(f);
    if(f.handle){
      const peers=[...fingers.values()].filter(other=>other.handle&&other.row===f.row).length;
      const pull=Number.isFinite(f.x)?Math.abs(f.x-warpX(f.id,geometry))/geometry.dx:0;
      if(audio.time-f.joined>.85)resonance.pressure(f.handle,1+pull*.3+Math.min(2,peers-1)*.12);
    }
  }
}
function schedule(){
  if(!audio.context||audio.context.state!=='running')return;
  const now=audio.time,duration=stepSeconds(config.bpm);
  updateFingers();resonance.tick();
  if(loop.state==='recording'&&now>=loop.startTime+LOOP_STEPS*duration){
    for(const f of fingers.values())if(f.record){f.record.duration=clamp((loop.startTime+LOOP_STEPS*duration-f.joined)/duration,.12,LOOP_STEPS-f.record.step);f.record=null;}
    setLoopState(loop.events.length?'playing':'empty');
  }
  if(clock.next<now-.15){const skipped=Math.ceil((now-clock.next)/duration);clock.step+=skipped;clock.next+=skipped*duration;}
  while(clock.next<now+.09){
    const step=clock.step,when=clock.next+(step%2?duration*config.swing:0);
    const click=recordingClick(step,loop,config.metronome);if(click)audio.click(when,click.accent);
    if(flow.enabled&&step>=flow.startStep){
      const relative=step-flow.startStep,cycle=Math.floor(relative/LOOP_STEPS);
      if(cycle!==flow.cycle){if(cycle%2===0||!flow.phrase.length)flow.phrase=accompanimentPhrase(config.scale);flow.cycle=cycle;}
      for(const n of flow.phrase)if(n.step===relative%LOOP_STEPS)emit(n.id,n.velocity,.38,when,'flow',n.bass?-12:0);
    }
    if(loop.state==='playing'||(loop.state==='recording'&&step>=loop.startStep+LOOP_STEPS)){
      const slot=((step-loop.startStep)%LOOP_STEPS+LOOP_STEPS)%LOOP_STEPS;
      for(const e of loop.events)if(e.step===slot){
        if(e.type==='weave'){
          let length=e.duration;
          // A contact still down at the recording boundary is clipped to the seam.
          if(loop.state==='recording' && [...fingers.values()].some(f=>f.record===e))length=Math.max(.12,LOOP_STEPS-e.step);
          resonance.start(resonanceNotes(e.id,e.row,config),e.row,{id:e.id,when,level:e.velocity*.8,duration:length*duration,source:'loop',pan:(e.id/13-.5)*.9});
          visualQueue.push({time:when,id:e.id,strength:.65,row:e.row,y:weftY(e.row,geometry),fromLoop:true});
        }else emit(e.id,e.velocity*.8,e.brightness,when,'loop',e.interval||0,geometry.top+e.y*(geometry.bottom-geometry.top));
      }
    }
    clock.step++;clock.next+=duration;
  }
  if(visualQueue.length>256)visualQueue.splice(0,visualQueue.length-256);
}
function eventPoint(e){const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top,time:e.timeStamp};}
const brightnessAt=p=>clamp(.85-(p.y-geometry.top)/(geometry.bottom-geometry.top)*.5,.25,.9);
canvas.addEventListener('pointerdown',e=>{
  if(e.pointerType==='mouse'&&e.button!==0)return;e.preventDefault();
  const p=eventPoint(e),hit=intersection(p,geometry);if(!hit||fingers.size>=10)return;
  startAudio();canvas.setPointerCapture(e.pointerId);canvas.focus({preventScroll:true});
  const f={...p,...hit,velocity:.67,brightness:brightnessAt(p),started:audio.time,coupled:false};
  fingers.set(e.pointerId,f);pluck(f.id,f.velocity,f.brightness,p.y);
});
canvas.addEventListener('pointermove',e=>{
  const f=fingers.get(e.pointerId);if(!f)return;e.preventDefault();
  const samples=e.getCoalescedEvents?.();
  for(const sample of samples?.length?samples:[e]){
    const p=eventPoint(sample),hit=intersection(p,geometry,f.id===null?null:f);
    const speed=Math.hypot(p.x-f.x,p.y-f.y)/Math.max(8,p.time-f.time),velocity=clamp(.42+speed*.25,.42,.95);
    if(!hit){uncouple(f);Object.assign(f,p,{id:null,row:null,started:audio.time});continue;}
    const changed=hit.id!==f.id||hit.row!==f.row;
    if(!f.coupled){for(const crossing of crossedWarps(f,p,geometry))pluck(crossing.id,velocity,brightnessAt(p),crossing.y);}
    if(changed&&f.coupled){uncouple(f);if(hit.id!==f.id)pluck(hit.id,velocity*.75,brightnessAt(p),p.y);}
    Object.assign(f,p,hit,{velocity,brightness:brightnessAt(p)});
    if(changed&&f.coupled)couple(f);
  }
});
function release(e){const f=fingers.get(e.pointerId);if(f)uncouple(f);fingers.delete(e.pointerId);}
for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,release);
canvas.addEventListener('contextmenu',e=>e.preventDefault());
const keyboard=['KeyA','KeyS','KeyD','KeyF','KeyG','KeyH','KeyJ','KeyQ','KeyW','KeyE','KeyR','KeyT','KeyY','KeyU'];
let keyboardRow=2;
canvas.addEventListener('keydown',e=>{
  const id=keyboard.indexOf(e.code);
  if(/^Digit[1-6]$/.test(e.code)){keyboardRow=Number(e.code.slice(-1))-1;hint('Hold a note key × '+WEFTS[keyboardRow].name);}
  else if(id>=0){e.preventDefault();if(e.repeat||pressedKeys.has(e.code))return;pressedKeys.add(e.code);startAudio();
    fingers.set(e.code,{id,row:keyboardRow,velocity:.7,started:audio.time,coupled:false});pluck(id,.7,.6,weftY(keyboardRow,geometry));
  }else if(e.code==='Space'){e.preventDefault();if(!e.repeat)toggleLoop();}
});
document.addEventListener('keyup',e=>{pressedKeys.delete(e.code);const f=fingers.get(e.code);if(f)uncouple(f);fingers.delete(e.code);});
document.addEventListener('keydown',e=>{if(e.code==='Escape'&&!$('settings').open){pause();hint('Stopped. Touch a string to resume.');}});
function toggleLoop(){
  startAudio();
  if(loop.state==='empty')setLoopState('armed');
  else if(loop.state==='armed')setLoopState('empty');
  else if(loop.state==='recording'){for(const f of fingers.values())f.record=null;loop.events=[];setLoopState('empty');}
  else if(loop.state==='playing')setLoopState('paused');
  else{loop.startStep=clock.step;loop.startTime=clock.timer===null?audio.time+.035:clock.next;setLoopState('playing');}
}
function toggleFlow() {
  flow.enabled = !flow.enabled;
  $('flow').setAttribute('aria-pressed', String(flow.enabled));
  if (flow.enabled) {
    flow.startStep = clock.timer === null ? 0 : clock.step;
    if (loop.state === 'playing') flow.startStep = loop.startStep + Math.ceil((flow.startStep - loop.startStep) / 16) * 16;
    flow.cycle = -1; flow.phrase = accompanimentPhrase(config.scale); startAudio();
  }
}
$('flow').addEventListener('click', toggleFlow);
$('loop').addEventListener('click', toggleLoop);
$('clearLoop').addEventListener('click', () => { for (const f of fingers.values()) f.record=null; loop.events = []; setLoopState('empty'); $('loopProgress').style.width = '0%'; });
function changeTempo(value) {
  if (loop.state === 'recording') return;
  config.bpm = clamp(Number.isFinite(Number(value)) && Number(value) > 0 ? Math.round(Number(value)) : 92, 40, 200);
  $('bpm').value = config.bpm; audio.configure({ bpm: config.bpm });
}
$('bpm').addEventListener('change', event => changeTempo(event.target.value));
$('tap').addEventListener('click', () => {
  const now = performance.now(); if (taps.length && now - taps.at(-1) > 2200) taps = [];
  taps.push(now); taps = taps.slice(-5);
  const bpm = bpmFromTaps(taps); if (bpm !== null) changeTempo(bpm);
  $('beatDot').classList.add('on'); startAudio();
});
$('randomize').addEventListener('click', () => {
  releaseAll(); Object.assign(config, randomPatch(config));
  if (flow.enabled) flow.phrase = accompanimentPhrase(config.scale);
  for (const id of ['root', 'scale', 'voice', 'palette']) $(id).value = String(config[id]);
  tuningReadout();
  hint(`${NOTES[config.root]}, ${SCALES[config.scale].name}, ${config.voice}`);
});
for (const id of ['root', 'scale', 'voice', 'octave', 'palette', 'swing']) $(id).addEventListener('change', event => {
  if (['root', 'scale', 'octave'].includes(id)) releaseAll();
  config[id] = ['root', 'octave', 'swing'].includes(id) ? Number(event.target.value) : event.target.value;
  if (['root', 'scale', 'octave'].includes(id)) tuningReadout();
  if (id === 'scale' && flow.enabled) flow.phrase = accompanimentPhrase(config.scale);
});
for (const id of ['volume', 'echo', 'hall', 'decay', 'glow']) $(id).addEventListener('input', event => {
  const value = Number(event.target.value); $(id + 'Value').value = value;
  if (id === 'glow') config.glow = value; else audio.configure({ [id]: value });
});
for (const id of ['showNotes', 'calm', 'metronome']) $(id).addEventListener('change', event => {
  config[id] = event.target.checked;
  if (id === 'metronome' && config.metronome) startAudio();
});
$('mute').addEventListener('click', () => {
  muted = !muted; audio.configure({ muted }); $('mute').textContent = muted ? 'MUTED' : 'SOUND';
  $('mute').setAttribute('aria-pressed', String(muted));
});
$('settingsOpen').addEventListener('click', () => { releaseAll(); $('settings').showModal(); });
$('settingsClose').addEventListener('click', () => $('settings').close());
$('settings').addEventListener('click', event => { if (event.target === $('settings')) { const r = event.target.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) event.target.close(); } });
function pause() {
  flow.enabled = false; $('flow').setAttribute('aria-pressed', 'false');
  generation++; releaseAll(); visualQueue.length = 0;
  if (clock.timer !== null) clearInterval(clock.timer); clock.timer = null;
  if (loop.state === 'recording') { loop.events = []; setLoopState('empty'); }
  else if (loop.state === 'armed') setLoopState('empty');
  else if (loop.state === 'playing') setLoopState('paused');
  config.metronome = false; $('metronome').checked = false;
  resonance.clear(); audio.dispose();
}
audio.onInterrupted = () => { pause(); hint('Audio paused. Touch a string to resume.'); };
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
addEventListener('pagehide', pause);
// Native selectors may briefly blur the window; only an actual hidden page stops it.
addEventListener('blur', () => { releaseAll(); });


function draw(ms){
  const dt=Math.min(.05,(ms-lastFrame)/1000||.016);lastFrame=ms;frameTime=ms/1000;
  const g=geometry,isCalm=calm(),glow=config.glow/100;
  ctx.clearRect(0,0,g.width,g.height);
  for(let i=visualQueue.length-1;i>=0;i--){const e=visualQueue[i];if(e.time<=audio.time){visualize(e.id,e.strength,e.fromLoop,e.row,e.y);visualQueue.splice(i,1);}}
  for(const s of strings)s.energy*=Math.exp(-dt*2.7);
  for(const r of rows)r.energy*=Math.exp(-dt*1.8);
  for(let i=pulses.length-1;i>=0;i--){pulses[i].age+=dt;if(pulses[i].age>2.4)pulses.splice(i,1);}
  const active=[...resonance.active].filter(h=>h.t<=audio.time&&audio.time<h.end);
  const strength=h=>Math.min(1,(audio.time-h.t)/.85)*.65;
  for(const h of active){strings[h.id].energy=Math.max(strings[h.id].energy,strength(h));rows[h.row].energy=Math.max(rows[h.row].energy,strength(h));}
  const line=(x1,y1,x2,y2)=>{ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();};
  // Two understated bridges anchor real continuous filaments, not a pad grid.
  ctx.strokeStyle='#96b4bd2b';ctx.lineWidth=1;
  line(g.left-12,g.top-7,g.right+12,g.top-7);line(g.left-12,g.bottom+7,g.right+12,g.bottom+7);
  ctx.font='10px ui-monospace,monospace';ctx.textAlign='left';ctx.fillStyle='#8192a8';
  ctx.fillText('WARP / 14',g.left,19);
  ctx.textAlign='right';ctx.fillText('WEFT / 06',g.right,19);
  // The wave packet expands from the touched crossing in both directions.
  function displacement(axis,index,pos){
    if(isCalm)return 0;
    let v=0;
    for(const p of pulses){
      if(axis==='v'?p.id!==index:p.row!==index)continue;
      const origin=axis==='v'?p.y:warpX(p.id,g),d=Math.abs(pos-origin),front=p.age*470;
      const packet=Math.exp(-(((d-front)/55)**2))*Math.exp(-p.age*1.4);
      v+=Math.sin(d*.085-p.age*47)*packet*p.strength*6;
    }
    for(const h of active){if(axis==='v'?h.id!==index:h.row!==index)continue;
      v+=Math.sin(pos*.07-frameTime*(axis==='v'?30:24)+h.serial)*strength(h)*1.6;
    }
    return clamp(v,-8,8);
  }
  for(const s of strings){
    const x=warpX(s.id,g),e=s.energy;
    ctx.strokeStyle=colorFor(s.id,70,.35+e*.6);ctx.lineWidth=.8+e*.7;
    ctx.shadowColor=colorFor(s.id);ctx.shadowBlur=e*glow*8;
    ctx.beginPath();ctx.moveTo(x,g.top);
    for(let y=g.top;y<=g.bottom;y+=4){const envelope=Math.sin(Math.PI*(y-g.top)/(g.bottom-g.top));ctx.lineTo(x+displacement('v',s.id,y)*envelope,y);}ctx.lineTo(x,g.bottom);ctx.stroke();ctx.shadowBlur=0;
    for(const y of [g.top-7,g.bottom+7]){ctx.fillStyle=colorFor(s.id,75,.6);ctx.beginPath();ctx.arc(x,y,1.6,0,Math.PI*2);ctx.fill();}
    if(config.showNotes){ctx.font=`${g.width<500?9:11}px ui-monospace,monospace`;ctx.textAlign='center';ctx.fillStyle=e>.12?colorFor(s.id,84):'#96a3b5';
      ctx.fillText(noteName(midi(s.id)),x,g.bottom+25+(g.width<420&&s.id%2?10:0));}
  }
  for(let row=0;row<WEFTS.length;row++){
    const y=weftY(row,g),e=rows[row].energy,start=g.left-18,end=g.right+10;
    // Draw the weft as a double filament; the slight over/under deflection makes
    // the crossing legible without boxes, filled cells or button hit regions.
    for(let ply=0;ply<2;ply++){
      ctx.strokeStyle=rowColor(row,(ply?.16:.35)+e*(ply?.22:.55));ctx.lineWidth=ply?.55:.8+e*.65;
      ctx.shadowColor=rowColor(row);ctx.shadowBlur=e*glow*7;
      ctx.beginPath();ctx.moveTo(start,y+ply*2);
      for(let x=start;x<=end;x+=3){const envelope=Math.sin(Math.PI*(x-start)/(end-start));const weave=Math.sin((x-g.left)/g.dx*Math.PI)*.6;
        ctx.lineTo(x,y+ply*2+weave+displacement('h',row,x)*envelope);}ctx.stroke();ctx.shadowBlur=0;
    }
    ctx.fillStyle=rowColor(row,e>.1?.95:.66);ctx.textAlign='left';ctx.font='9px ui-monospace,monospace';ctx.fillText(WEFTS[row].name,5,y-8);
    for(const x of [start,end]){ctx.strokeStyle=rowColor(row,.45);ctx.lineWidth=1;line(x,y-3,x,y+4);}
  }
  // Contact knots: white = current fingers; a fine colored ring = recorded hand.
  for(const h of active){
    const x=warpX(h.id,g),y=weftY(h.row,g),a=strength(h);
    ctx.strokeStyle=h.source==='loop'?rowColor(h.row,.65):`rgba(224,255,245,${.3+a})`;
    ctx.lineWidth=h.source==='loop'?.8:1.2;ctx.beginPath();ctx.arc(x,y,4+a*3,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle=rowColor(h.row,.4+a*.5);ctx.beginPath();ctx.arc(x,y,1.7,0,Math.PI*2);ctx.fill();
  }
  for(const f of fingers.values())if(f.id!==null){
    const x=warpX(f.id,g),y=weftY(f.row,g),progress=Math.min(1,(audio.time-f.started)/HOLD_SECONDS);
    if(!f.coupled){ctx.strokeStyle='#dafff6a0';ctx.lineWidth=1;ctx.beginPath();ctx.arc(x,y,7,-Math.PI/2,-Math.PI/2+Math.PI*2*progress);ctx.stroke();}
    if(Number.isFinite(f.x)&&!isCalm){ctx.strokeStyle='#dffff73a';ctx.lineWidth=.7;line(x,y,f.x,f.y);}
  }
  const live=active.filter(h=>h.source==='live');
  $('touchState').textContent=live.length?`${live.length} ${live.length===1?'CROSSING':'CROSSINGS'} · ${[...new Set(live.map(h=>WEFTS[h.row].name))].join(' / ')}`:'HOLD A CROSSING TO RESONATE';
  if(audio.context&&clock.timer!==null){
    const duration=stepSeconds(config.bpm),visibleStep=clock.step-(clock.next-audio.time)/duration;
    $('beatDot').classList.toggle('on',((visibleStep%4)+4)%4<.55);
    if(loop.state==='recording'||loop.state==='playing'){
      loop.visibleStep=Math.max(0,visibleStep-loop.startStep)%LOOP_STEPS;$('loopProgress').style.width=`${loop.visibleStep/LOOP_STEPS*100}%`;
    }
  }else $('beatDot').classList.remove('on');
  if(frameTime-lastNoteTime>3)$('noteReadout').textContent='';
  requestAnimationFrame(draw);
}
tuningReadout();requestAnimationFrame(draw);
