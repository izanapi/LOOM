import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as music from '../music.mjs';
import * as loom from '../loom.mjs';
import { LoomResonance } from '../resonance.mjs';
import { VOICES } from '../voices.mjs';
import { InstrumentAudio, hallImpulse } from '../audio.mjs';

class Param {
  constructor() { this.value = 0; }
  setValueAtTime(value, time) { assert.ok(Number.isFinite(value) && time >= 0); this.value = value; }
  linearRampToValueAtTime(value, time) { assert.ok(Number.isFinite(value) && time >= 0); this.value = value; this.attackTime = time; }
  exponentialRampToValueAtTime(value, time) { assert.ok(value > 0 && Number.isFinite(value) && time >= 0); this.value = value; }
  setTargetAtTime(value, time, constant) { assert.ok(Number.isFinite(value) && time >= 0 && constant > 0); this.value = value; }
  cancelScheduledValues() {}
}
class Node {
  constructor(ac) { this.ac = ac; for (const key of ['detune','gain','frequency','pan','threshold','knee','ratio','attack','release','delayTime']) this[key] = new Param(); }
  connect(target) { (this.connections ??= []).push(target); } disconnect() { this.disconnected = true; }
  start(time) { assert.ok(time >= 0); this.startTime = time; }
  stop(time) { assert.ok(time >= 0); this.stopTime = time; }
}
class FakeAudioContext {
  constructor(options) { assert.equal(options.latencyHint, 'interactive'); this.currentTime = 0; this.state = 'suspended'; this.sampleRate = 1000; this.destination = new Node(this); this.nodes = []; }
  node() { const node = new Node(this); this.nodes.push(node); return node; }
  createGain() { return this.node(); } createBiquadFilter() { return this.node(); } createStereoPanner() { return this.node(); }
  createOscillator() { return this.node(); } createBufferSource() { return this.node(); } createDelay() { return this.node(); }
  createAnalyser() { const node = this.node(); node.frequencyBinCount = 512; node.getByteFrequencyData = array => array.fill(0); return node; }
  createDynamicsCompressor() { return this.node(); } createConvolver() { return this.node(); }
  createBuffer(channels, length) { const data = Array.from({length: channels}, () => new Float32Array(length)); return { length, numberOfChannels: channels, getChannelData: channel => data[channel] }; }
  resume() { this.state = 'running'; return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
  advance(seconds) { this.currentTime += seconds; for (const node of this.nodes) if (!node.ended && node.stopTime <= this.currentTime) { node.ended = true; node.onended?.(); } }
}
globalThis.AudioContext = FakeAudioContext;
class TracedAudio extends InstrumentAudio {
  constructor() { super(); this.calls = []; this.clicks = []; }
  click(when, accent) { this.clicks.push({when, accent}); super.click(when, accent); }
  play(midi, options) { this.calls.push({ midi, ...options }); super.play(midi, options); }
}
class Element {
  constructor(id = '') { this.id = id; this.listeners = {}; this.style = {setProperty() {}}; this.dataset = {}; this.value = ''; this.classList = { toggle() {}, add() {}, remove() {} }; }
  addEventListener(type, callback) { (this.listeners[type] ??= []).push(callback); }
  dispatch(type, data = {}) { const event = { target: this, preventDefault() {}, ...data }; for (const callback of this.listeners[type] || []) callback(event); }
  append(child) { (this.children ??= []).push(child); } setAttribute() {} setPointerCapture() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 390, height: 420 }; }
  focus() {}
  showModal() { this.open = true; } close() { this.open = false; }
}
function harness() {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(match => [match[1], new Element(match[1])]));
  const drawing = new Proxy({}, { get: (_, name) => name === 'createRadialGradient' || name === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {} });
  elements.get('canvas').getContext = () => drawing;
  const modes = ['pluck', 'chord', 'arp'].map(mode => { const element = new Element(); element.dataset.mode = mode; return element; });
  const document = new Element(); document.hidden = false; document.documentElement = new Element();
  document.getElementById = id => { assert.ok(elements.has(id), `Missing HTML id: ${id}`); return elements.get(id); };
  document.createElement = () => new Element(); document.querySelectorAll = () => modes;
  let now = 1000, frame;
  const globalEvents = new Element();
  const sandbox = { ...music, ...loom, LoomResonance, VOICES, InstrumentAudio: TracedAudio, document, console, performance: { now: () => now },
    devicePixelRatio: 2, matchMedia: () => ({ matches: false }), ResizeObserver: class { observe() {} },
    setInterval: () => 1, clearInterval() {}, requestAnimationFrame: callback => { frame = callback; },
    addEventListener: (...args) => globalEvents.addEventListener(...args) };
  vm.createContext(sandbox);
  const source = fs.readFileSync(new URL('../app.mjs', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
  vm.runInContext(source + '\nglobalThis.testAPI = { audio, clock, loop, flow, config, fingers, geometry, schedule, pause, emit, setLoopState, changeTempo, draw, resonance, releaseAll, visualQueue };', sandbox);
  const api = sandbox.testAPI;
  return { ...api, elements, document, modes, globalEvents,
    async flush() { await Promise.resolve(); await Promise.resolve(); },
    advance(seconds) { for (let time = 0; time < seconds; time += .025) { now += 25; api.audio.context?.advance(.025); api.schedule(); frame(now); } },
    pointer(type, id, string, row = 2) {
      const g=api.geometry;
      elements.get('canvas').dispatch(type, { pointerId: id, clientX: string===null?(g.weftLeft+g.left)/2:loom.warpX(string,g), clientY: row===null?g.top+10:loom.weftY(row,g), timeStamp: now, pointerType: 'touch' });
    },
  };
}
test('initial draw, two independent fingers, swipes, release, cancellation and keyboard', async () => {
  const h = harness(); h.draw(0); assert.equal(h.audio.context, null);
  h.pointer('pointerdown', 1, 3); h.pointer('pointerdown', 2, 11); await h.flush();
  assert.equal(h.fingers.size, 2); assert.equal(h.audio.calls.length, 4);
  assert.equal(h.audio.calls[1].midi-h.audio.calls[0].midi,7);
  h.advance(.1); h.pointer('pointermove', 1, 7); assert.ok(h.audio.calls.length >= 6);
  h.pointer('pointerup', 1, 7); assert.equal(h.fingers.size, 1);
  h.pointer('pointercancel', 2, 11); assert.equal(h.fingers.size, 0);
  h.elements.get('canvas').dispatch('keydown', { code: 'KeyA' });
  assert.equal(h.fingers.size, 1); h.document.dispatch('keyup', { code: 'KeyA' }); assert.equal(h.fingers.size, 0);
  h.pause();
});


test('two-bar loop records, repeats, transposes, pauses, resumes and clears', async () => {
  const h = harness(); h.elements.get('loop').dispatch('click'); await h.flush();
  assert.equal(h.loop.state, 'armed'); h.pointer('pointerdown', 1, 2); h.pointer('pointerup', 1, 2);
  assert.equal(h.loop.state, 'recording'); h.advance(.5); h.pointer('pointerdown', 2, 10); h.pointer('pointerup', 2, 10);
  assert.equal(h.loop.events.length, 4);
  const bpm = h.config.bpm; h.changeTempo(180); assert.equal(h.config.bpm, bpm);
  h.advance(5.3); assert.equal(h.loop.state, 'playing'); assert.ok(h.audio.calls.length > 2);
  h.elements.get('root').value = '2'; h.elements.get('root').dispatch('change');
  const count = h.audio.calls.length; h.advance(5.4);
  assert.ok(h.audio.calls.slice(count).some(call => call.midi === music.midiForString(2, 2, 'hijaz')));
  h.elements.get('loop').dispatch('click'); assert.equal(h.loop.state, 'paused'); const stopped = h.audio.calls.length;
  h.advance(2); assert.equal(h.audio.calls.length, stopped);
  h.elements.get('loop').dispatch('click'); h.advance(.5); assert.equal(h.loop.state, 'playing');
  h.elements.get('clearLoop').dispatch('click'); assert.equal(h.loop.events.length, 0); assert.equal(h.loop.state, 'empty');
  h.pause();
});
test('backgrounding cancels recording, clears fingers, stops audio and can unlock again', async () => {
  const h = harness(); h.elements.get('loop').dispatch('click'); h.pointer('pointerdown', 1, 0); await h.flush();
  const oldContext = h.audio.context; h.document.hidden = true; h.document.dispatch('visibilitychange');
  assert.equal(oldContext.state, 'closed'); assert.equal(h.audio.context, null); assert.equal(h.fingers.size, 0); assert.equal(h.loop.state, 'empty');
  h.document.hidden = false; h.pointer('pointerdown', 2, 8); await h.flush();
  assert.equal(h.audio.context.state, 'running'); assert.notEqual(h.audio.context, oldContext); h.pause();
});
test('every timbre has valid envelopes and heavy strumming stays within 32 active voices', async () => {
  const audio = new InstrumentAudio(); await audio.unlock();
  for (const voice of Object.keys(VOICES)) for (let i = 0; i < 40; i++) {
    audio.play(48 + i, { voice, when: audio.time, velocity: .8 }); assert.ok(audio.voices.length <= 32);
  }
  audio.context.advance(8); assert.equal(audio.voices.length, 0);
  audio.configure({ muted: true }); assert.equal(audio.master.gain.value, 0); audio.dispose();
});
test('look-ahead scheduling does not cut off the final fraction of the recording bar', async () => {
  const h = harness(); h.elements.get('loop').dispatch('click'); await h.flush();
  h.pointer('pointerdown', 1, 1); h.pointer('pointerup', 1, 1);
  const end = h.loop.startTime + music.stepSeconds(h.config.bpm) * 32;
  h.audio.context.currentTime = end - .04; h.schedule();
  assert.equal(h.loop.state, 'recording');
  h.pointer('pointerdown', 2, 12); assert.ok(h.loop.events.some(event => event.id === 12 && event.step === 31));
  h.audio.context.currentTime = end + .01; h.schedule(); assert.equal(h.loop.state, 'playing'); h.pause();
});

test('Hijaz is the actual initial tuning and UI selection', () => {
  const h = harness(); assert.equal(h.config.scale, 'hijaz'); assert.equal(h.elements.get('scale').value, 'hijaz');
  assert.equal(h.config.voice,'qanun');
});
test('harmony brushes and holds use the selected vertical voice',async()=>{
 const h=harness();h.elements.get('voice').value='glass';h.elements.get('voice').dispatch('change');
 h.pointer('pointerdown',1,null,3);await h.flush();h.advance(1.6);
 assert.ok(h.audio.calls.length>=4);assert.ok(h.audio.calls.every(n=>n.voice==='glass'));
 assert.ok(h.audio.calls.every(n=>n.output));
 h.pointer('pointerup',1,null,3);h.pause();
});
test('drone stays in the deep register and textures keep their release tails',async()=>{
 const h=harness();
 for(const id of [0,7,13])for(const octave of [-1,0,1]){
   const notes=loom.resonanceNotes(id,11,{...h.config,octave});assert.ok(notes[0]>=24&&notes[0]<36);
 }
 h.pointer('pointerdown',1,null,11);await h.flush();h.advance(.5);
 const drone=h.fingers.get(1).handle;h.pointer('pointerup',1,null,11);h.advance(2);
 assert.ok(h.resonance.active.has(drone));assert.equal(drone.release,7);
 h.pointer('pointerdown',2,null,2);h.advance(.5);const dust=h.fingers.get(2).handle;
 h.pointer('pointerup',2,null,2);h.advance(1);assert.ok(h.resonance.active.has(dust));assert.equal(dust.release,3.5);
 h.advance(8);assert.equal(h.resonance.active.size,0);h.pause();
});
test('drone root ignores vertical notes; frets ascend in scale and are recorded',async()=>{
 const h=harness(),g=h.geometry,canvas=h.elements.get('canvas');
 h.elements.get('root').value='2';h.elements.get('root').dispatch('change');
 const point=fret=>({pointerId:41,clientX:loom.droneX(fret,g,h.config.scale),clientY:loom.weftY(11,g),timeStamp:performance.now(),pointerType:'touch'});
 h.elements.get('loop').dispatch('click');canvas.dispatch('pointerdown',point(0));await h.flush();h.advance(.5);
 const original=h.fingers.get(41).handle;assert.deepEqual(original.notes,[26,38]);
 h.pointer('pointerdown',42,12,null);h.advance(.2);h.pointer('pointerup',42,12,null);
 assert.equal(h.fingers.get(41).handle,original,'playing a warp does not retune the drone');
 const plucks=h.loop.events.filter(e=>e.type==='pluck').length;
 canvas.dispatch('pointermove',point(3));h.advance(.2);
 assert.equal(h.fingers.get(41).handle.notes[0],31);assert.equal(original.release,.3);
 canvas.dispatch('pointermove',point(7));h.advance(.2);
 assert.equal(h.fingers.get(41).handle.notes[0],38);
 assert.equal(h.loop.events.filter(e=>e.type==='pluck').length,plucks,'bass frets never pluck crossing warps');
 assert.ok(h.loop.events.some(e=>e.type==='weave'&&e.row===11&&e.fret===7));
 canvas.dispatch('pointerup',point(7));h.advance(5.5);assert.equal(h.loop.state,'playing');
 assert.ok([...h.resonance.active].some(e=>e.source==='loop'&&e.row===11&&e.fret===7));h.pause();
});

test('lower-only harmonies remember the last vertical note and retune while held',async()=>{
  const h=harness();h.pointer('pointerdown',1,7,null);await h.flush();h.pointer('pointerup',1,7,null);
  h.advance(9);h.pointer('pointerdown',2,null,5);h.advance(.5);
  const f=h.fingers.get(2);assert.equal(f.handle.id,7);
  assert.deepEqual(f.handle.notes,loom.resonanceNotes(7,5,h.config));
  const old=f.handle;h.pointer('pointerdown',3,10,null);h.advance(.05);
  assert.equal(old.stopping,true);assert.equal(f.handle.id,10);
  h.pointer('pointerup',3,10,null);h.pointer('pointerup',2,null,5);h.advance(1);
  assert.equal(h.resonance.active.size,0);h.pause();
});
test('horizontal-only arpeggios use the row pitches, record their identity and replay',async()=>{
  const h=harness();h.pointer('pointerdown',1,4,null);await h.flush();h.pointer('pointerup',1,4,null);
  h.modes[2].dispatch('click');h.elements.get('loop').dispatch('click');h.pointer('pointerdown',2,null,3);
  h.advance(1.4);h.pointer('pointerup',2,null,3);
  const events=h.loop.events.filter(e=>e.type==='threadNote');assert.ok(events.length>=4);
  assert.ok(events.every(e=>e.id===4&&e.row===3));
  const pitches=loom.resonanceNotes(4,3,h.config);
  assert.ok(pitches.every(p=>h.audio.calls.some(n=>n.midi===p)));
  h.advance(5);assert.equal(h.loop.state,'playing');
  assert.ok(h.visualQueue.some(e=>e.row===3&&e.fromLoop)||h.audio.calls.filter(n=>pitches.includes(n.midi)).length>events.length);
  h.elements.get('clearLoop').dispatch('click');const count=h.audio.calls.length;h.advance(1);
  assert.equal(h.audio.calls.length,count);h.pause();
});
test('sliding down one string adds a fifth then an octave and records both intervals',async()=>{
  const h=harness(),g=h.geometry,canvas=h.elements.get('canvas');h.elements.get('loop').dispatch('click');await h.flush();
  const point=depth=>({pointerId:9,clientX:loom.warpX(2,g),clientY:g.top+depth*(g.bottom-g.top),timeStamp:performance.now(),pointerType:'touch'});
  canvas.dispatch('pointerdown',point(.1));assert.deepEqual(h.audio.calls.map(n=>n.midi),[52]);
  h.advance(.1);canvas.dispatch('pointermove',point(.6));assert.deepEqual(h.audio.calls.filter(n=>!n.output).slice(-2).map(n=>n.midi),[52,59]);
  h.advance(.1);canvas.dispatch('pointermove',point(.9));assert.deepEqual(h.audio.calls.filter(n=>!n.output).slice(-3).map(n=>n.midi),[52,59,64]);
  assert.ok(h.loop.events.some(e=>e.interval===12));canvas.dispatch('pointerup',point(.9));h.pause();
});

test('chord mode records three scale strings including quarter tones and replays once',async()=>{
  const h=harness();h.modes[1].dispatch('click');
  h.elements.get('scale').value='rast';h.elements.get('scale').dispatch('change');
  h.elements.get('loop').dispatch('click');h.pointer('pointerdown',1,0,null);await h.flush();h.pointer('pointerup',1,0,null);
  assert.deepEqual(h.audio.calls.map(n=>n.midi),[48,51.5,55]);
  assert.equal(h.loop.events.length,3);h.advance(5.5);
  assert.equal(h.loop.state,'playing');assert.equal(h.loop.events.length,3);h.pause();
});
test('held arpeggios follow the clock, record, weave and stop on release',async()=>{
  const h=harness();h.modes[2].dispatch('click');h.elements.get('loop').dispatch('click');
  h.pointer('pointerdown',1,2,10);await h.flush();h.advance(1.4);
  assert.ok(new Set(h.audio.calls.map(n=>n.midi)).size>=3);
  assert.ok(h.loop.events.filter(e=>e.type==='threadNote').length>=4);
  assert.equal(h.fingers.get(1).handle.row,10);
  h.pointer('pointerup',1,2,10);h.advance(.15);const count=h.audio.calls.length;h.advance(.8);
  assert.equal(h.audio.calls.length,count);h.modes[0].dispatch('click');assert.equal(h.config.mode,'pluck');h.pause();
});


test('dice updates all corresponding controls and preserves recorded loop and mix', async () => {
  const h = harness(); h.elements.get('loop').dispatch('click'); await h.flush(); h.pointer('pointerdown', 1, 2);
  const events = JSON.stringify(h.loop.events), bpm = h.config.bpm, volume = h.audio.settings.volume;
  h.elements.get('randomize').dispatch('click');
  assert.notEqual(h.config.scale, 'hijaz'); assert.notEqual(h.config.root, 0);
  for (const key of ['root','scale','voice','palette']) assert.equal(h.elements.get(key).value, String(h.config[key]));
  assert.equal(h.config.bpm, bpm); assert.equal(h.audio.settings.volume, volume); assert.equal(JSON.stringify(h.loop.events), events);
  for (const id of ['echo','hall','volume']) { h.elements.get(id).value = '42'; h.elements.get(id).dispatch('input'); assert.equal(h.audio.settings[id], 42); }
  h.pause();
});
test('interface is English-only and the three mix sliders live on the main surface', () => {
  for (const file of ['index.html','app.mjs','audio.mjs','music.mjs']) {
    const text = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'); assert.equal(/[ぁ-んァ-ン一-龯]/u.test(text), false, file);
  }
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const main = html.split('<dialog')[0];
  for (const id of ['echo','hall','volume','randomize']) assert.ok(main.includes(`id="${id}"`));
});


test('Desert is selected both in the config and settings control', () => {
  const h = harness(); assert.equal(h.config.palette, 'desert'); assert.equal(h.elements.get('palette').value, 'desert');
});
test('recording automatically clicks for eight beats and stops without changing manual preference', async () => {
  const h = harness(); h.elements.get('loop').dispatch('click'); h.pointer('pointerdown', 1, 2); h.pointer('pointerup', 1, 2); await h.flush();
  h.advance(5.5); assert.equal(h.loop.state, 'playing'); assert.equal(h.audio.clicks.length, 8);
  const count = h.audio.clicks.length; h.advance(1); assert.equal(h.audio.clicks.length, count); assert.equal(h.config.metronome, false);
  h.config.metronome = true; h.advance(1); assert.ok(h.audio.clicks.length > count); h.pause();
});
test('FLOW plays without fingers, follows key changes, avoids recording itself and stops', async () => {
  const h = harness(); h.elements.get('flow').dispatch('click'); await h.flush(); h.advance(1);
  assert.equal(h.flow.enabled, true); assert.ok(h.audio.calls.length > 1); assert.equal(h.fingers.size, 0);
  assert.ok(h.audio.calls.every(call => call.voice === 'velvet'));
  h.elements.get('loop').dispatch('click'); h.advance(1); assert.equal(h.loop.state, 'armed'); assert.equal(h.loop.events.length, 0);
  h.pointer('pointerdown', 1, 11); h.pointer('pointerup', 1, 11); h.advance(1); assert.equal(h.loop.events.length, 2);
  h.elements.get('root').value = '2'; h.elements.get('root').dispatch('change');
  h.elements.get('scale').value = 'ritusen'; h.elements.get('scale').dispatch('change');
  const count = h.audio.calls.length; h.advance(2);
  const calls = h.audio.calls.slice(count).filter(call => call.voice === 'velvet'); assert.ok(calls.length);
  for (const call of calls) assert.ok(music.SCALES.ritusen.intervals.includes((call.midi - 2) % 12));
  h.elements.get('flow').dispatch('click'); const stopped = h.audio.calls.length; h.advance(.5); assert.equal(h.audio.calls.length, stopped);
  h.elements.get('flow').dispatch('click'); h.pause(); assert.equal(h.flow.enabled, false);
});
test('space effects use cross-feedback below unity, matched beat delays and a stereo hall', async () => {
  const audio = new InstrumentAudio(); await audio.unlock(); audio.configure({echo:100,hall:100,bpm:120});
  assert.ok(audio.feedback.gain.value < .7); assert.equal(audio.feedback.gain.value, audio.feedbackRight.gain.value);
  assert.equal(audio.delay.delayTime.value, .375); assert.equal(audio.delayRight.delayTime.value, .375);
  assert.ok(audio.feedback.connections.includes(audio.delay)); assert.ok(audio.feedbackRight.connections.includes(audio.delayRight));
  assert.ok(audio.hall.gain.value >= 1); assert.equal(audio.readSpectrum().length, 512);
  const impulse = hallImpulse(audio.context); assert.equal(impulse.numberOfChannels, 2); assert.equal(impulse.length, 5500);
  const left = impulse.getChannelData(0), right = impulse.getChannelData(1);
  assert.notDeepEqual(left, right);
  const energy = data => data.reduce((sum, n) => sum + n*n,0)/data.length;
  assert.ok(energy(left.slice(3000,4000)) > 1e-6, 'audible long tail');
  assert.ok(energy(left.slice(4500)) < energy(left.slice(1000,2000))*.01, 'tail decays');
  audio.dispose(); assert.equal(audio.readSpectrum(),null);
});

test('voice picker uses the complete synthesis catalog', () => {
  const h = harness();
  assert.deepEqual(h.elements.get('voice').children.map(option=>option.value), Object.keys(VOICES));
});
test('new voices use different source families and the plucked-string cache stays bounded', async () => {
  const audio = new InstrumentAudio(); await audio.unlock();
  audio.context.sampleRate = 44100;
  const graphs = {};
  for (const voice of ['koto','bamboo','orbit','chip']) {
    const before = audio.context.nodes.length; audio.play(60,{voice});
    graphs[voice] = audio.context.nodes.slice(before);
  }
  assert.ok(graphs.koto.some(node=>node.buffer && !node.loop));
  assert.ok(graphs.bamboo.some(node=>node.loop));
  assert.ok(graphs.orbit.some(node=>node.type==='sawtooth'));
  assert.ok(graphs.chip.some(node=>node.type==='square'));
  for (let midi=48;midi<78;midi++) audio.play(midi,{voice:'koto'});
  assert.ok(audio.pluckCache.size <= 24);
  const size=audio.pluckCache.size;audio.play(77,{voice:'koto'});assert.equal(audio.pluckCache.size,size);
  audio.dispose();assert.equal(audio.pluckCache.size,0);
});


test('short taps pluck only; holding a crossing grows its own resonance', async () => {
  const h=harness(); h.pointer('pointerdown',1,4,0);await h.flush();h.advance(.15);
  assert.equal(h.resonance.active.size,0);h.pointer('pointerup',1,4,0);h.advance(.4);assert.equal(h.resonance.active.size,0);
  h.pointer('pointerdown',2,5,1);h.advance(.4);assert.equal(h.resonance.active.size,1);
  const handle=[...h.resonance.active][0];assert.equal(handle.row,1);assert.equal(handle.id,5);
  h.pointer('pointerup',2,5,1);h.advance(.8);assert.equal(h.resonance.active.size,0);h.pause();
});
test('weaving and multitouch preserve independent contacts and release tails', async () => {
  const h=harness();h.pointer('pointerdown',1,2,0);h.pointer('pointerdown',2,9,5);await h.flush();h.advance(.6);
  assert.equal([...h.resonance.active].filter(h=>!h.stopping).length,2);
  h.pointer('pointermove',1,6,3);h.advance(.1);
  assert.equal(h.fingers.get(1).handle.row,3);assert.equal(h.fingers.get(2).handle.row,5);
  h.pointer('pointercancel',1,6,3);assert.equal(h.fingers.size,1);assert.equal(h.fingers.get(2).handle.stopping,false);
  h.globalEvents.dispatch('blur');h.advance(.8);assert.equal(h.resonance.active.size,0);assert.equal(h.fingers.size,0);h.pause();
});
test('loop records crossing identity and duration, replays it, and clears its voices', async () => {
  const h=harness();h.elements.get('loop').dispatch('click');await h.flush();h.pointer('pointerdown',1,3,1);h.advance(.9);
  h.pointer('pointermove',1,5,5);h.advance(.6);h.pointer('pointerup',1,5,5);
  const woven=h.loop.events.filter(e=>e.type==='weave'&&e.gesture!=='brush');assert.equal(woven.length,2);
  assert.equal(woven[0].row,1);assert.equal(woven[1].row,5);assert.ok(woven.every(e=>e.duration>1));
  h.advance(4.2);assert.equal(h.loop.state,'playing');assert.ok([...h.resonance.active].some(h=>h.source==='loop'));
  h.elements.get('clearLoop').dispatch('click');assert.equal(h.resonance.active.size,0);assert.equal(h.loop.events.length,0);h.pause();
});
test('held recording seam is bounded and settings release contacts', async () => {
  const h=harness();h.elements.get('loop').dispatch('click');await h.flush();h.pointer('pointerdown',1,3,2);h.advance(5.5);
  const event=h.loop.events.find(e=>e.type==='weave');assert.ok(event.step+event.duration<=32);
  h.elements.get('settingsOpen').dispatch('click');assert.equal(h.fingers.size,0);h.pause();assert.equal(h.resonance.active.size,0);
});
test('keyboard holds couple to the chosen weft and all twelve timbres release', async () => {
  const h=harness(),canvas=h.elements.get('canvas');
  for(let row=0;row<12;row++){
    canvas.dispatch('keydown',{code:['Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9','Digit0','Minus','Equal'][row]});canvas.dispatch('keydown',{code:'KeyD'});await h.flush();h.advance(.5);
    assert.equal(h.fingers.get('KeyD').handle.row,row);h.document.dispatch('keyup',{code:'KeyD'});h.advance(loom.weftRelease(row)+.2);
    assert.equal(h.resonance.active.size,0);
  }h.pause();
});

test('rapid reweaving bounds resonance groups without stealing a resting live finger', async () => {
  const h=harness();h.pointer('pointerdown',1,1,4);h.pointer('pointerdown',2,2,1);await h.flush();h.advance(.5);
  const anchor=h.fingers.get(1).handle;
  for(let i=0;i<80;i++){
    h.audio.context.advance(.005);h.pointer('pointermove',2,2+i%10,i%6);h.schedule();
    assert.ok(h.resonance.active.size<=24);assert.equal(h.resonance.active.has(anchor),true);
  }
  h.releaseAll();h.advance(4);assert.equal(h.resonance.active.size,0);h.pause();
});

test('empty space stays silent, but a sweep starting there can catch the string bank', async () => {
  const h=harness();h.pointer('pointerdown',1,null,null);await h.flush();h.advance(.5);
  assert.equal(h.audio.context,null);assert.equal(h.resonance.active.size,0);
  h.pointer('pointermove',1,10,null);await h.flush();assert.ok(h.audio.calls.length>=10);
  h.advance(.5);assert.equal(h.resonance.active.size,0,'upper strings do not select an invisible horizontal string');h.pause();
});
test('sweeping the lower strings catches the recent melody and records the brush', async () => {
  const h=harness();h.pointer('pointerdown',1,8,null);await h.flush();h.pointer('pointerup',1,8,null);
  h.elements.get('loop').dispatch('click');await h.flush();
  h.pointer('pointerdown',2,null,0);h.advance(.08);h.pointer('pointermove',2,null,5);h.pointer('pointerup',2,null,5);
  const brush=h.loop.events.filter(e=>e.gesture==='brush');
  assert.equal(new Set(brush.map(e=>e.row)).size,6);assert.ok(brush.every(e=>e.id===8));
  assert.ok(brush.every(e=>e.attack===.055&&e.duration>0));assert.equal(h.loop.state,'recording');
  h.advance(6);assert.equal(h.loop.state,'playing');assert.ok([...h.resonance.active].some(h=>h.source==='loop'&&h.attack===.055));
  h.elements.get('clearLoop').dispatch('click');assert.equal(h.resonance.active.size,0);h.pause();
});
test('a fast diagonal stroke excites notes and short resonances without a hold', async () => {
  const h=harness();h.elements.get('loop').dispatch('click');await h.flush();
  h.pointer('pointerdown',1,0,0);h.pointer('pointermove',1,13,5);h.pointer('pointerup',1,13,5);
  assert.ok(h.audio.calls.length>=14);assert.ok(h.loop.events.filter(e=>e.gesture==='brush').length>=6);
  assert.equal([...h.resonance.active].filter(h=>h.source==='live').length,0);h.advance(2);
  assert.ok(h.resonance.active.size>0,'texture tails remain after the sweep');
  h.elements.get('loop').dispatch('click');h.advance(4);
  assert.equal(h.resonance.active.size,0);h.pause();
});
