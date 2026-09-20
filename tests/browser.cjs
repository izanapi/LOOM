const {chromium,webkit}=require('/Users/gotoda/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  const Original=window.AudioContext;
  window.AudioContext=class extends Original{constructor(...args){super(...args);window.__audioContext=this;}};
 });
 await page.goto(process.argv[2]||'http://127.0.0.1:8071');await page.waitForTimeout(300);
 assert.ok(await page.locator('script[type="module"]').getAttribute('src').then(s=>s.includes('?v=drift-10')));
 const geometry=await page.evaluate(async()=>{const m=await import('./loom.mjs?v=drift-10');return m.loomGeometry(390,500)});
 assert.ok(geometry.left>180&&geometry.weftTop>250,'Strings form a mirrored L');
 fs.mkdirSync('artifacts',{recursive:true});
 await page.screenshot({path:'artifacts/loom-mobile.png'});
 const box=await page.locator('canvas').boundingBox();
 const top=44,bottom=box.height-60,left=box.width*.47,right=box.width-22;
 const rowBottom=bottom-18,rowTop=rowBottom-Math.max(100,Math.min(168,(bottom-top)*.34));
 const point=(id,row)=>({x:box.x+left+id*(right-left)/13,y:box.y+rowTop+row*(rowBottom-rowTop)/11});
 assert.equal(await page.locator('h1').textContent(),'LOOM');
 const a=point(4,0);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.waitForTimeout(1300);
 assert.match(await page.locator('#touchState').textContent(),/1 CROSSING.*BLOOM/);
 assert.equal(await page.locator('canvas').evaluate(e=>getComputedStyle(e).outlineStyle),'none');
 await page.screenshot({path:'artifacts/loom-held.png'});
 const b=point(8,2);await page.mouse.move(b.x,b.y,{steps:12});await page.waitForTimeout(700);
 assert.match(await page.locator('#touchState').textContent(),/DUST/);
 await page.mouse.up();await page.waitForTimeout(750);
 assert.match(await page.locator('#touchState').textContent(),/SWEEP THROUGH/);
 await page.locator('#bpm').fill('200');await page.locator('#bpm').dispatchEvent('change');await page.locator('#loop').click();
 await page.mouse.move(a.x,a.y);await page.mouse.down();await page.waitForTimeout(700);await page.mouse.move(b.x,b.y);await page.waitForTimeout(500);await page.mouse.up();
 await page.waitForTimeout(1600);assert.equal(await page.locator('#loopLabel').textContent(),'PAUSE');
 await page.screenshot({path:'artifacts/loom-loop.png'});await page.locator('#clearLoop').click();
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:a.x,y:a.y,id:1},{x:b.x,y:b.y,id:2}]});
 await page.waitForTimeout(1100);assert.match(await page.locator('#touchState').textContent(),/2 CROSSINGS/);
 assert.equal(await page.locator('canvas').evaluate(e=>getComputedStyle(e).outlineStyle),'none');
 assert.equal(await page.locator('canvas').evaluate(e=>getComputedStyle(e).webkitTapHighlightColor),'rgba(0, 0, 0, 0)');
 await page.screenshot({path:'artifacts/loom-multitouch.png'});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await page.keyboard.press('Escape');
 // Start in the silent upper-left and brush diagonally into the tight corner.
 const quiet={x:box.x+box.width*.23,y:box.y+top+35};
 await page.mouse.move(quiet.x,quiet.y);await page.mouse.down();await page.waitForTimeout(400);
 assert.match(await page.locator('#touchState').textContent(),/SWEEP THROUGH/);
 const end=point(12,5);await page.mouse.move(end.x,end.y,{steps:12});await page.mouse.up();await page.waitForTimeout(100);
 assert.match(await page.locator('#touchState').textContent(),/BRUSH/);
 await page.screenshot({path:'artifacts/loom-corner-brush.png'});
 await page.waitForTimeout(1600);assert.match(await page.locator('#touchState').textContent(),/SWEEP THROUGH/);
 // The independent lower arm must sound without touching a vertical string.
 const lowerX=box.x+(54+left)/2;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:lowerX,y:point(0,0).y,id:4}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:lowerX,y:point(0,11).y,id:4}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await page.waitForTimeout(350);assert.match(await page.locator('#touchState').textContent(),/1 CROSSING · DRONE/);
 await page.screenshot({path:'artifacts/loom-lower-brush.png'});await page.locator('#clearLoop').click();
 await page.locator('#settingsOpen').click();assert.equal(await page.locator('dialog').evaluate(e=>e.open),true);await page.locator('#settingsClose').click();
 assert.equal(await page.locator('#scale').inputValue(),'hijaz');
 assert.equal(await page.locator('#voice').inputValue(),'qanun');
 await page.locator('[data-mode="chord"]').click();
 assert.equal(await page.locator('[data-mode="chord"]').getAttribute('aria-pressed'),'true');
 await page.mouse.click(a.x,a.y);
 await page.locator('[data-mode="arp"]').click();
 await page.locator('#scale').selectOption('rast');
 await page.mouse.move(a.x,a.y);await page.mouse.down();await page.waitForTimeout(1100);
 await page.screenshot({path:'artifacts/loom-arpeggio.png'});await page.mouse.up();
 // ARP must also work on the left ends, and follow a second finger's melody.
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:lowerX,y:point(0,3).y,id:15}]});
 await page.waitForTimeout(600);assert.match(await page.locator('#touchState').textContent(),/1 CROSSING.*FIFTH/);
 const anchor={x:point(9,0).x,y:box.y+top+20,id:16};
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:lowerX,y:point(0,3).y,id:15},anchor]});
 await page.waitForTimeout(650);assert.match(await page.locator('#noteReadout').textContent(),/^E4↓50/);
 await page.screenshot({path:'artifacts/loom-horizontal-arp.png'});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await page.locator('[data-mode="pluck"]').click();
 // The independent bass remains at KEY throughout the string.
 await page.keyboard.press('Escape');
 const bassX=fret=>box.x+(fret===0?(54+left)/2:left+(fret-.5)*(right+10-left)/7);
 await page.mouse.move(bassX(0),point(0,11).y);await page.mouse.down();await page.waitForTimeout(550);
 assert.match(await page.locator('#noteReadout').textContent(),/^C1 × DRONE/);
 await page.mouse.move(box.x+left-2,point(0,11).y,{steps:5});await page.waitForTimeout(150);
 assert.match(await page.locator('#noteReadout').textContent(),/^C1 × DRONE/);
 await page.mouse.move(bassX(7),point(0,11).y,{steps:14});await page.waitForTimeout(250);
 assert.match(await page.locator('#noteReadout').textContent(),/^C1 × DRONE/);
 await page.screenshot({path:'artifacts/loom-drone.png'});await page.mouse.up();
 await page.waitForTimeout(250);assert.equal(await page.locator('#clearLoop').isEnabled(),true);
 await page.locator('#clearLoop').click();await page.waitForTimeout(100);assert.equal(await page.locator('#clearLoop').isEnabled(),false);
 for(const scale of ['janHammer','egyptian','lydianDominant','hungarianMinor','wholeTone']){
  await page.locator('#scale').selectOption(scale);await page.mouse.click(point(3,0).x,point(3,0).y);
 }
 await page.locator('#scale').selectOption('rast');
 await page.keyboard.press('Escape');
 const backgrounds=new Set(),panelColors=new Set();
 for(const palette of ['desert','rose','copper','oasis','indigo','ember','aurora','neon','salt','night']){
   await page.locator('#palette').selectOption(palette);
   backgrounds.add(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor));
   panelColors.add(await page.locator('#voice').evaluate(e=>getComputedStyle(e).backgroundColor));
   if(['copper','oasis','neon'].includes(palette)){
     await page.waitForTimeout(100);
     await page.screenshot({path:`artifacts/loom-palette-${palette}.png`});
   }
 }
 assert.equal(backgrounds.size,1);
 assert.equal(panelColors.size,1);assert.ok(backgrounds.has('rgb(9, 11, 24)'));
 await page.locator('#palette').selectOption('desert');
 for(const [width,height] of [[320,568],[390,664],[430,932],[844,390],[1280,900]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(100);
  const metrics=await page.evaluate(()=>({w:innerWidth,sw:document.documentElement.scrollWidth,h:innerHeight,sh:document.documentElement.scrollHeight,stage:document.querySelector('canvas').getBoundingClientRect().height}));
  assert.ok(metrics.sw<=width,JSON.stringify(metrics));assert.ok(metrics.sh<=height,JSON.stringify(metrics));assert.ok(metrics.stage>=220);
  await page.screenshot({path:`artifacts/loom-${width}x${height}.png`});
 }
 console.log(JSON.stringify({errors,layouts:'5 sizes',touch:'tap, hold, weave, 2 fingers, empty corner, diagonal brush, lower-only brush',loop:'record, replay, clear'}));assert.deepEqual(errors,[]);
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
