import { frequency, clamp } from './music.mjs?v=corner-3';
import { pluckedWave } from './voices.mjs?v=corner-3';

// Coupled strings enter the existing HANABI effects bus. Each contact owns its
// envelope, so releasing one finger never releases another finger's resonance.
export class LoomResonance {
  constructor(audio, onPulse=()=>{}) { this.audio=audio; this.active=new Set(); this.onPulse=onPulse; this.serial=0; }
  start(notes,row,{when=this.audio.time,level=.7,duration=Infinity,pan=0,source='live',id=0,attack=.85}={}) {
    const ac=this.audio.context; if(!ac) return null;
    const t=Math.max(when,ac.currentTime), env=ac.createGain(), stereo=ac.createStereoPanner();
    const filter=ac.createBiquadFilter(); filter.type='lowpass'; filter.frequency.value=row===5?1100:6400;
    stereo.pan.value=pan; env.connect(filter); filter.connect(stereo); stereo.connect(this.audio.input);
    const amp=(row===3?.16:.075)*level/Math.sqrt(notes.length);
    attack=Math.min(attack,duration*.5);
    env.gain.setValueAtTime(.0001,t); env.gain.linearRampToValueAtTime(amp,t+attack);
    const nodes=[env,filter,stereo], sources=[];
    const handle={id,row,source,t,env,amp,attack,notes,nodes,sources,level,end:t+duration,stopping:false,next:t+.08,serial:this.serial++};
    if(row!==4) notes.forEach((note,i)=>{
      const f=frequency(note); if(f>ac.sampleRate*.43) return;
      let osc;
      if(row===3) {
        // A short loop of overlapping, Hann-windowed grains cut from the same
        // Karplus-Strong string used by Koto. No noise-particle audio substitute.
        const length=Math.ceil(ac.sampleRate*1.7), buffer=ac.createBuffer(1,length,ac.sampleRate);
        const data=buffer.getChannelData(0), wave=pluckedWave(ac.sampleRate,f,.65,.8);
        for(let grain=0;grain<11;grain++) {
          const offset=Math.floor((grain*.145+Math.random()*.025)*ac.sampleRate);
          const size=Math.floor((.065+Math.random()*.075)*ac.sampleRate), cut=Math.floor(Math.random()*.16*ac.sampleRate);
          for(let n=0;n<size && offset+n<length;n++) data[offset+n]+=wave[(cut+n)%wave.length]*Math.sin(Math.PI*n/size)**2;
        }
        osc=ac.createBufferSource(); osc.buffer=buffer; osc.loop=true;
      } else {
        osc=ac.createOscillator(); osc.type=row===5?'triangle':'sine'; osc.frequency.value=f;
        osc.detune.value=(i-1)*2.2;
      }
      const gain=ac.createGain();gain.gain.value=i? .6:1;
      osc.connect(gain);gain.connect(env);osc.start(t);sources.push(osc);nodes.push(osc,gain);
    });
    // Slow beating appears when several contacts share a horizontal string.
    this.active.add(handle);
    while(this.active.size>24) {
      const all=[...this.active],now=this.audio.time;
      const victim=all.find(h=>h.stopping&&h.end<=now)||all.find(h=>h.source!=='live')||all[0];
      this.stop(victim,now,.04,true);
    }
    if(Number.isFinite(duration)) this.stop(handle,t+duration,.45);
    return handle;
  }
  pressure(handle,amount) {
    if(!handle || handle.stopping) return;
    handle.env.gain.setTargetAtTime(handle.amp*clamp(amount,.4,1.35),this.audio.time,.2);
  }
  stop(handle,when=this.audio.time,release=.6,force=false) {
    if(!handle || (handle.stopping && !force)) return;
    const t=Math.max(when,this.audio.time), p=handle.env.gain;
    // cancelAndHold preserves the exact envelope level even during the attack.
    if(p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t);
    else { p.cancelScheduledValues(t); p.setValueAtTime(handle.amp,t); }
    p.setTargetAtTime(.0001,t,release/5);
    for(const src of handle.sources) {try{src.stop(t+release);}catch{}}
    handle.end=t;handle.cleanup=t+release;handle.stopping=true;
    if(force) this.clean(handle);
  }
  clean(handle) {
    for(const node of handle.nodes) node.disconnect();this.active.delete(handle);
  }
  tick() {
    const now=this.audio.time;
    for(const h of this.active) {
      if(h.cleanup<=now) {this.clean(h);continue;}
      if(h.row!==4 || now<h.t || now>=h.end) continue;
      if(h.next<now-.1) h.next=now;
      if(h.next<now+.08) {
        const index=Math.round((h.next-h.t)/(60/this.audio.settings.bpm*.75));
        this.audio.play(h.notes[index%h.notes.length],{voice:'koto',velocity:(.2+.24*Math.min(1,(h.next-h.t)/1.2))*h.level,brightness:.48,when:h.next,pan:index%2?.5:-.5});
        this.onPulse(h.id,h.row,h.next,h.source);h.next+=60/this.audio.settings.bpm*.75;
      }
    }
  }
  stopSource(source) { for(const h of this.active) if(h.source===source) this.stop(h,this.audio.time,.15,true); }
  clear() {for(const h of [...this.active]) this.stop(h,this.audio.time,.05,true);}
}
