import { NOTES, SCALES, LOOM_SCALES, PALETTES, paletteColor, LOOP_STEPS, clamp, noteName, stepSeconds, loopStep, bpmFromTaps, randomPatch, accompanimentPhrase, recordingClick } from './music.mjs?v=dunes-5';
import { InstrumentAudio } from './audio.mjs?v=dunes-5';
import { VOICES } from './voices.mjs?v=dunes-5';
import { WARP_COUNT, WEFTS, HOLD_SECONDS, loomGeometry, warpX, weftY, intersection, crossedWarps, crossedWefts, degreeMidi, resonanceNotes, wovenChord, isHarmony, warpLayer, warpIntervals } from './loom.mjs?v=dunes-5';
import { LoomResonance } from './resonance.mjs?v=dunes-5';

const $=id=>document.getElementById(id);
const canvas=$('canvas'),ctx=canvas.getContext('2d'),audio=new InstrumentAudio();
const config={root:0,scale:'hijaz',voice:'qanun',octave:0,mode:'pluck',palette:'desert',bpm:92,swing:0,glow:55,showNotes:true,calm:false,metronome:false};
const fingers=new Map(),pressedKeys=new Set(),pulses=[],visualQueue=[];
const strings=Array.from({length:WARP_COUNT},(_,id)=>({id,energy:0,last:-10}));
const rows=WEFTS.map(()=>({energy:0}));
let lastVertical=0;
const memory=[],brushAt=WEFTS.map(()=>-10);
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
selectOptions($('scale'),LOOM_SCALES.map(k=>[k,SCALES[k].name]));
selectOptions($('voice'),Object.entries(VOICES).map(([k,v])=>[k,v.name]));
selectOptions($('palette'),Object.entries(PALETTES).map(([k,p])=>[k,p.name]));
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
function colorFor(id,light=70,alpha=1){return paletteColor(config.palette,id/(WARP_COUNT-1),light,alpha);}
function rowColor(row,alpha=1){return paletteColor(config.palette,row/(WEFTS.length-1),72,alpha);}
function stringGradient(axis,index,alpha){
  const g=geometry,vertical=axis==='v';
  const gradient=ctx.createLinearGradient(vertical?0:g.weftLeft,vertical?g.top:0,vertical?0:g.right,vertical?g.bottom:0);
  const bank=index/(vertical?WARP_COUNT-1:WEFTS.length-1);
  for(let i=0;i<=4;i++)gradient.addColorStop(i/4,paletteColor(config.palette,bank*.4+i/4*.6,70,alpha));
  return gradient;
}
function visualize(id,strength=.7,fromLoop=false,row=null,y=geometry.height*.5,x=null){
  strings[id].energy=Math.max(strings[id].energy,strength);
  if(row!==null) rows[row].energy=Math.max(rows[row].energy,strength);
  pulses.push({id,row,y:row!==null?weftY(row,geometry):y,x,age:0,strength,fromLoop});if(pulses.length>140)pulses.shift();
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
  if(source==='live')hint('BRUSH THE CORNER · HOLD TO WEAVE');
  if(source==='live'||source==='arp')record({type:'pluck',id,velocity,brightness,interval,y:(y-geometry.top)/(geometry.bottom-geometry.top)},when);
  audio.play(midi(id)+interval,{voice:source==='flow'?'velvet':config.voice,velocity,brightness,when,pan:(id/(WARP_COUNT-1)-.5)*1.1});
  const visual={time:when,id,strength:velocity,fromLoop:source==='loop',row:null,y};
  if(when>audio.time+.015)visualQueue.push(visual);else visualize(id,velocity,source==='loop',null,y);
}
function pluck(id,velocity,brightness,y,when=audio.time,layer=warpLayer(y,geometry)){
  if(id===null)return;
  lastVertical=id;
  const now=performance.now()/1000;if(now-strings[id].last<.035)return;
  strings[id].last=now;
  const notes=config.mode==='chord'?wovenChord(id):[id];
  notes.forEach((note,i)=>verticalNote(note,velocity/Math.sqrt(notes.length),brightness,when+i*.009,'live',y,layer));
  const old=memory.findIndex(n=>n.id===id);if(old>=0)memory.splice(old,1);
  memory.push({id,time:audio.time});if(memory.length>5)memory.shift();
}
function verticalNote(id,velocity,brightness,when,source,y,layer=warpLayer(y,geometry)){
  const intervals=warpIntervals(layer);
  const levels=[1,.42,.32],normal=Math.sqrt(intervals.reduce((sum,_,i)=>sum+levels[i]**2,0));
  intervals.forEach((interval,i)=>emit(id,velocity*levels[i]/normal,brightness,when,source,interval,y));
}
function anchorFor(f){return isHarmony(f.row)?lastVertical:(f.id??lastVertical);}
function threadNote(id,row,index,velocity,when,source='arp'){
  const notes=resonanceNotes(id,row,config),note=notes[index%notes.length];
  audio.play(note,{voice:config.voice,velocity,brightness:.55,when,pan:(id/13-.5)*.9});
  if(source==='arp')record({type:'threadNote',id,row,index,velocity},when);
  visualQueue.push({time:when,id,row,strength:velocity+.15,y:weftY(row,geometry),fromLoop:source==='loop'});
}
function brushWeft(row,velocity,primary=null,offset=0,originX=null){
  if(row===null||!audio.context||audio.time-brushAt[row]<.12)return;
  hint('BRUSH THE CORNER · HOLD TO WEAVE');
  brushAt[row]=audio.time;
  const held=[...fingers.values()].filter(f=>f.id!==null&&f.handle).map(f=>f.id);
  const recent=memory.filter(n=>audio.time-n.time<8).map(n=>n.id).reverse();
  const seeds=[...new Set([primary,...held,...recent].filter(id=>id!==null))];
  if(!seeds.length)seeds.push(0,4);
  const chosen=isHarmony(row)?[lastVertical]:seeds.slice(0,['dust','mirage','echo'].includes(WEFTS[row].kind)?1:2);
  chosen.forEach((id,i)=>{
    const when=audio.time+offset+i*.035,duration=WEFTS[row].kind==='echo'?.95:.52+velocity*.38,level=velocity*.52;
    resonance.start(resonanceNotes(id,row,config),row,{id,when,level,duration,attack:.055,source:'brush',pan:(id/13-.5)*.9});
    const event=record({type:'weave',gesture:'brush',id,row,velocity:level,duration:duration/stepSeconds(config.bpm),attack:.055,x:originX===null?null:originX/geometry.width},when);
    if(event)event.duration=Math.min(event.duration,LOOP_STEPS-event.step);
    visualQueue.push({time:when,id,strength:.38+velocity*.2,row,y:weftY(row,geometry),x:originX,fromLoop:false,brush:true});
  });
}
function couple(finger,when=audio.time){
  if(finger.row===null||finger.handle)return;
  const id=anchorFor(finger);
  finger.coupled=true;finger.joined=when;
  finger.handle=resonance.start(resonanceNotes(id,finger.row,config),finger.row,{id,level:finger.velocity,pan:(id/13-.5)*.9});
  finger.record=record({type:'weave',id,row:finger.row,velocity:finger.velocity,duration:1},when);
  visualize(id,.75,false,finger.row);
}
function uncouple(finger){
  if(finger.record){
    const d=stepSeconds(config.bpm),end=loop.startTime+LOOP_STEPS*d;
    finger.record.duration=clamp((Math.min(audio.time,end)-finger.joined)/d,.12,LOOP_STEPS-finger.record.step);
    finger.record=null;
  }
  if(finger.handle)resonance.stop(finger.handle);finger.handle=null;
}
function releaseAll(){
  for(const f of fingers.values())uncouple(f);fingers.clear();pressedKeys.clear();
  resonance.stopSource('brush');
  for(let i=visualQueue.length-1;i>=0;i--)if(visualQueue[i].brush)visualQueue.splice(i,1);
}
function updateFingers(){
  for(const f of fingers.values()){
    if(f.id===null&&f.row===null)continue;
    if(f.handle&&f.handle.id!==anchorFor(f)){uncouple(f);couple(f);}
    if(!f.coupled&&audio.time-f.started>=HOLD_SECONDS)couple(f);
    if(f.handle){
      const peers=[...fingers.values()].filter(other=>other.handle&&other.row===f.row).length;
      const pull=f.id!==null&&Number.isFinite(f.x)?Math.abs(f.x-warpX(f.id,geometry))/geometry.dx:0;
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
    if(config.mode==='arp'&&step%2===0){
      for(const f of fingers.values())if(f.id!==null||f.row!==null){
        const index=[0,1,2,1][Math.floor(step/2)%4];
        if(f.row!==null)threadNote(anchorFor(f),f.row,index,f.velocity*.55,when);
        else verticalNote(wovenChord(f.id)[index],f.velocity*.65,f.brightness??.6,when,'arp',f.y??geometry.top,f.layer??0);
      }
    }
    if(flow.enabled&&step>=flow.startStep){
      const relative=step-flow.startStep,cycle=Math.floor(relative/LOOP_STEPS);
      if(cycle!==flow.cycle){if(cycle%2===0||!flow.phrase.length)flow.phrase=accompanimentPhrase(config.scale);flow.cycle=cycle;}
      for(const n of flow.phrase)if(n.step===relative%LOOP_STEPS)emit(n.id,n.velocity,.38,when,'flow',n.bass?-12:0);
    }
    if(loop.state==='playing'||(loop.state==='recording'&&step>=loop.startStep+LOOP_STEPS)){
      const slot=((step-loop.startStep)%LOOP_STEPS+LOOP_STEPS)%LOOP_STEPS;
      for(const e of loop.events)if(e.step===slot){
        if(e.type==='threadNote')threadNote(e.id,e.row,e.index,e.velocity*.8,when,'loop');
        else if(e.type==='weave'){
          let length=e.duration;
          // A contact still down at the recording boundary is clipped to the seam.
          if(loop.state==='recording' && [...fingers.values()].some(f=>f.record===e))length=Math.max(.12,LOOP_STEPS-e.step);
          resonance.start(resonanceNotes(e.id,e.row,config),e.row,{id:e.id,when,level:e.velocity*.8,duration:length*duration,attack:e.attack??.85,source:'loop',pan:(e.id/13-.5)*.9});
          visualQueue.push({time:when,id:e.id,strength:.65,row:e.row,y:weftY(e.row,geometry),x:e.x==null?null:e.x*geometry.width,fromLoop:true});
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
  const p=eventPoint(e),hit=intersection(p,geometry);if(fingers.size>=10)return;
  canvas.classList.add('pointer-playing');
  if(hit)startAudio();canvas.setPointerCapture(e.pointerId);canvas.focus({preventScroll:true});
  const f={...p,id:null,row:null,...hit,layer:warpLayer(p.y,geometry),velocity:.67,brightness:brightnessAt(p),started:audio.time,coupled:false};
  fingers.set(e.pointerId,f);
  if(f.id!==null)pluck(f.id,f.velocity,f.brightness,p.y);
  else if(f.row!==null)brushWeft(f.row,f.velocity,null,0,p.x);
});
canvas.addEventListener('pointermove',e=>{
  const f=fingers.get(e.pointerId);if(!f)return;e.preventDefault();
  const samples=e.getCoalescedEvents?.();
  for(const sample of samples?.length?samples:[e]){
    const p=eventPoint(sample),hit=intersection(p,geometry,f);
    const speed=Math.hypot(p.x-f.x,p.y-f.y)/Math.max(8,p.time-f.time),velocity=clamp(.42+speed*.25,.42,.95);
    const warps=crossedWarps(f,p,geometry),wefts=crossedWefts(f,p,geometry);
    if((hit||warps.length||wefts.length)&&!audio.context)startAudio();
    const layer=warpLayer(p.y,geometry,f.layer??0);
    if(hit?.id!=null&&hit.id===f.id&&layer!==f.layer){
      pluck(hit.id,velocity,brightnessAt(p),p.y,audio.time,layer);
    }
    // A broad sweep catches every crossed filament, including a fast move that
    // ends back in the quiet space. Spread bundled events into a tiny cascade.
    if(!f.coupled){
      warps.forEach((crossing,i)=>{
        pluck(crossing.id,velocity/Math.sqrt(1+warps.length*.08),brightnessAt(p),crossing.y,audio.time+i*.008);
        if(crossing.row!==null)brushWeft(crossing.row,velocity,crossing.id,i*.008);
      });
      wefts.forEach((crossing,i)=>brushWeft(crossing.row,velocity,crossing.id,i*.022,crossing.x));
    }
    if(!hit){uncouple(f);Object.assign(f,p,{id:null,row:null,started:audio.time,coupled:false});continue;}
    const changed=hit.id!==f.id||hit.row!==f.row;
    if(changed&&f.coupled){
      uncouple(f);
      warps.forEach((crossing,i)=>pluck(crossing.id,velocity*.65,brightnessAt(p),crossing.y,audio.time+i*.008));
      wefts.forEach((crossing,i)=>{if(crossing.row!==hit.row)brushWeft(crossing.row,velocity*.65,crossing.id,i*.022,crossing.x);});
    }
    if(f.id===null&&f.row===null)f.started=audio.time;
    Object.assign(f,p,hit,{velocity,layer,brightness:brightnessAt(p)});
    if(changed&&f.coupled)couple(f);
  }
});
function release(e){const f=fingers.get(e.pointerId);if(f)uncouple(f);fingers.delete(e.pointerId);}
for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,release);
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('blur',()=>canvas.classList.remove('pointer-playing'));
const keyboard=['KeyA','KeyS','KeyD','KeyF','KeyG','KeyH','KeyJ','KeyQ','KeyW','KeyE','KeyR','KeyT','KeyY','KeyU'];
let keyboardRow=2;
canvas.addEventListener('keydown',e=>{
  canvas.classList.remove('pointer-playing');
  const id=keyboard.indexOf(e.code);
  const rowKey=['Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9','Digit0','Minus','Equal'].indexOf(e.code);
  if(rowKey>=0){keyboardRow=rowKey;hint('Hold a note key × '+WEFTS[keyboardRow].name);}
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
for(const element of document.querySelectorAll('[data-mode]'))element.addEventListener('click',()=>{
  releaseAll();config.mode=element.dataset.mode;
  for(const button of document.querySelectorAll('[data-mode]'))button.setAttribute('aria-pressed',String(button.dataset.mode===config.mode));
  hint({pluck:'PLUCK · SLIDE DOWN FOR FIFTH + OCTAVE',chord:'CHORD · THREE STRINGS TOGETHER',arp:'ARP · HOLD EITHER THREAD TO CIRCLE'}[config.mode]);
});
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
  generation++; releaseAll(); visualQueue.length = 0; memory.length=0; brushAt.fill(-10);
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
  for(let i=visualQueue.length-1;i>=0;i--){const e=visualQueue[i];if(e.time<=audio.time){visualize(e.id,e.strength,e.fromLoop,e.row,e.y,e.x??null);visualQueue.splice(i,1);}}
  for(const s of strings)s.energy*=Math.exp(-dt*2.7);
  for(const r of rows)r.energy*=Math.exp(-dt*1.8);
  for(let i=pulses.length-1;i>=0;i--){pulses[i].age+=dt;if(pulses[i].age>2.4)pulses.splice(i,1);}
  const active=[...resonance.active].filter(h=>h.t<=audio.time&&audio.time<h.end);
  const strength=h=>Math.min(1,(audio.time-h.t)/h.attack)*.65;
  for(const h of active){strings[h.id].energy=Math.max(strings[h.id].energy,strength(h));rows[h.row].energy=Math.max(rows[h.row].energy,strength(h));}
  const line=(x1,y1,x2,y2)=>{ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();};
  // Two understated bridges anchor real continuous filaments, not a pad grid.
  ctx.strokeStyle='#96b4bd2b';ctx.lineWidth=1;
  line(g.left-12,g.top-7,g.right+12,g.top-7);line(g.left-12,g.bottom+7,g.right+12,g.bottom+7);
  // The wave packet expands from the touched crossing in both directions.
  function displacement(axis,index,pos){
    if(isCalm)return 0;
    let v=0;
    for(const p of pulses){
      if(axis==='v'?p.id!==index:p.row!==index)continue;
      const origin=axis==='v'?p.y:(p.x??warpX(p.id,g)),d=Math.abs(pos-origin),front=p.age*470;
      const packet=Math.exp(-(((d-front)/55)**2))*Math.exp(-p.age*1.4);
      v+=Math.sin(d*.085-p.age*47)*packet*p.strength*6;
    }
    for(const h of active){if(axis==='v'?h.id!==index:h.row!==index)continue;
      v+=Math.sin(pos*.07-frameTime*(axis==='v'?30:24)+h.serial)*strength(h)*1.6;
    }
    const limit=axis==='h'?Math.min(8,g.dy*.35):8;return clamp(v,-limit,limit);
  }
  for(const s of strings){
    const x=warpX(s.id,g),e=s.energy;
    ctx.strokeStyle=stringGradient('v',s.id,.4+e*.55);ctx.lineWidth=.8+e*.7;
    ctx.shadowColor=colorFor(s.id);ctx.shadowBlur=e*glow*8;
    ctx.beginPath();ctx.moveTo(x,g.top);
    for(let y=g.top;y<=g.bottom;y+=4){const envelope=Math.sin(Math.PI*(y-g.top)/(g.bottom-g.top));ctx.lineTo(x+displacement('v',s.id,y)*envelope,y);}ctx.lineTo(x,g.bottom);ctx.stroke();ctx.shadowBlur=0;
    for(const y of [g.top-7,g.bottom+7]){ctx.fillStyle=paletteColor(config.palette,s.id/13*.4+(y>g.bottom?.6:0),75,.6);ctx.beginPath();ctx.arc(x,y,1.6,0,Math.PI*2);ctx.fill();}
    if(config.showNotes){ctx.font=`${g.width<500?9:11}px ui-monospace,monospace`;ctx.textAlign='center';ctx.fillStyle=e>.12?colorFor(s.id,84):'#96a3b5';
      ctx.fillText(noteName(midi(s.id)).replace('↓50','↓'),x,g.bottom+24+(g.dx<24&&s.id%2?12:0));}
  }
  for(let row=0;row<WEFTS.length;row++){
    const y=weftY(row,g),e=rows[row].energy,start=g.weftLeft,end=g.right+10;
    // Draw the weft as a double filament; the slight over/under deflection makes
    // the crossing legible without boxes, filled cells or button hit regions.
    for(let ply=0;ply<2;ply++){
      ctx.strokeStyle=stringGradient('h',row,(ply?.16:.4)+e*(ply?.22:.5));ctx.lineWidth=ply?.55:.8+e*.65;
      ctx.shadowColor=rowColor(row);ctx.shadowBlur=e*glow*7;
      ctx.beginPath();ctx.moveTo(start,y+ply*2);
      for(let x=start;x<=end;x+=3){const envelope=Math.sin(Math.PI*(x-start)/(end-start));const weave=Math.sin((x-g.left)/g.dx*Math.PI)*.6;
        ctx.lineTo(x,y+ply*2+weave+displacement('h',row,x)*envelope);}ctx.stroke();ctx.shadowBlur=0;
    }
    ctx.fillStyle=rowColor(row,e>.1?.95:.75);ctx.textAlign='left';ctx.font=`${Math.min(9,g.dy*.85)}px ui-monospace,monospace`;ctx.fillText(WEFTS[row].name,7,y+3);
    for(const x of [start,end]){ctx.strokeStyle=rowColor(row,.45);ctx.lineWidth=1;line(x,y-3,x,y+4);}
  }
  // Contact knots: white = current fingers; a fine colored ring = recorded hand.
  for(const h of active){
    const x=warpX(h.id,g),y=weftY(h.row,g),a=strength(h);
    ctx.strokeStyle=h.source==='loop'?rowColor(h.row,.65):`rgba(224,255,245,${.3+a})`;
    ctx.lineWidth=h.source==='loop'?.8:1.2;ctx.beginPath();ctx.arc(x,y,4+a*3,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle=rowColor(h.row,.4+a*.5);ctx.beginPath();ctx.arc(x,y,1.7,0,Math.PI*2);ctx.fill();
  }
  for(const f of fingers.values())if(f.id!==null&&f.row!==null){
    const x=warpX(f.id,g),y=weftY(f.row,g),progress=Math.min(1,(audio.time-f.started)/HOLD_SECONDS);
    if(!f.coupled){ctx.strokeStyle='#dafff6a0';ctx.lineWidth=1;ctx.beginPath();ctx.arc(x,y,7,-Math.PI/2,-Math.PI/2+Math.PI*2*progress);ctx.stroke();}
    if(Number.isFinite(f.x)&&!isCalm){ctx.strokeStyle='#dffff73a';ctx.lineWidth=.7;line(x,y,f.x,f.y);}
  }
  const live=active.filter(h=>h.source==='live');
  const brushing=active.filter(h=>h.source==='brush');
  $('touchState').textContent=live.length?`${live.length} ${live.length===1?'CROSSING':'CROSSINGS'} · ${[...new Set(live.map(h=>WEFTS[h.row].name))].join(' / ')}`:
    brushing.length?'BRUSH · '+new Set(brushing.map(h=>h.row)).size+' THREADS':'SWEEP THROUGH THE STRINGS';
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
