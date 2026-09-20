const {chromium}=require('/Users/gotoda/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:8071');
 const result=await page.evaluate(async()=>{
  const {InstrumentAudio}=await import('./audio.mjs'),{LoomResonance}=await import('./resonance.mjs'),{resonanceNotes}=await import('./loom.mjs');
  const metrics=[],samples=[];const Original=window.AudioContext;
  for(let row=0;row<18;row++){
   const c=new OfflineAudioContext(2,44100*12,44100);window.AudioContext=function(){return c;};
   const a=new InstrumentAudio();a.build();a.configure({echo:0,hall:0,volume:65});
   let time=0;const wrapper={context:c,input:a.input,settings:a.settings,get time(){return time;},play:a.play.bind(a)};
   const r=new LoomResonance(wrapper),config={root:0,scale:'bayati',octave:0};
   if(row<13)r.start(resonanceNotes(4,row,config),row,{id:4,when:.1,duration:2,level:.7});
   else if(row===13)for(let i=0;i<10;i++)r.start(resonanceNotes(i,i%13,config),i%13,{id:i,when:.1,duration:2,level:.7});
   else if(row===14)for(let i=0;i<14;i++){
     for(const interval of [0,7,12])a.play(48+i+interval,{voice:'qanun',velocity:interval?.23:.5,when:.1+i*.008});
     r.start(resonanceNotes(i,i%13,config),i%13,{id:i,when:.1+i*.008,duration:.8,level:.4,attack:.055,source:'brush'});
   }
   else a.play(60.5,{voice:['qanun','santur','oud'][row-15],velocity:.8,when:.1});
   if(row===12)c.suspend(4).then(()=>{time=c.currentTime;r.start(resonanceNotes(4,row,config),row,{id:4,when:time,level:.7,retrigger:true});if(r.active.size!==1)throw Error('drone stacked');return c.resume();});
   // Render the same audio-clock echo scheduler used during live playing.
   for(time=0;time<(row===14?.75:2.3);time+=.025)r.tick();
   const out=await c.startRendering(),pcm=out.getChannelData(0);
   const rms=(start,end)=>Math.sqrt(pcm.slice(start*44100,end*44100).reduce((sum,x)=>sum+x*x,0)/((end-start)*44100));
   let peak=0;for(const x of pcm){if(!Number.isFinite(x))throw Error('non-finite output');peak=Math.max(peak,Math.abs(x));}
   metrics.push({row,peak,attack:rms(.15,.25),body:row>=15?rms(.2,.5):rms(.9,1.5),tail:rms(10.5,11.5),sustain:rms(3,3.5)});
   if(row<13)samples.push(Array.from(pcm));
  }
  window.AudioContext=Original;return {metrics,samples};
 });
 for(const m of result.metrics){assert(m.peak>.002&&m.peak<.95,JSON.stringify(m));assert(m.body>.0003,JSON.stringify(m));if(m.row===12)assert(m.peak>.045&&m.tail>m.body*.95&&m.tail<m.body*1.05,JSON.stringify(m));else if(m.row!==14)assert(m.tail<m.body*.15,JSON.stringify(m));}
 for(const row of [2,4,6,10,12])assert.ok(result.metrics[row].sustain>0.00003,JSON.stringify(result.metrics[row]));
 const data=result.samples.flat(),buf=Buffer.alloc(44+data.length*2);buf.write('RIFF');buf.writeUInt32LE(buf.length-8,4);buf.write('WAVEfmt ',8);buf.writeUInt32LE(16,16);buf.writeUInt16LE(1,20);buf.writeUInt16LE(1,22);buf.writeUInt32LE(44100,24);buf.writeUInt32LE(88200,28);buf.writeUInt16LE(2,32);buf.writeUInt16LE(16,34);buf.write('data',36);buf.writeUInt32LE(data.length*2,40);data.forEach((x,i)=>buf.writeInt16LE(Math.round(Math.max(-1,Math.min(1,x))*32767),44+i*2));fs.writeFileSync('artifacts/resonance-check.wav',buf);
 console.log(JSON.stringify(result.metrics,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
