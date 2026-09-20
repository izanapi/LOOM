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
 await page.goto('http://127.0.0.1:8071');await page.waitForTimeout(300);
 fs.mkdirSync('artifacts',{recursive:true});
 await page.screenshot({path:'artifacts/loom-mobile.png'});
 const box=await page.locator('canvas').boundingBox();
 const point=(id,row)=>({x:box.x+54+id*(box.width-76)/13,y:box.y+62+row*(box.height-140)/5});
 const a=point(4,1);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.waitForTimeout(1300);
 assert.match(await page.locator('#touchState').textContent(),/1 CROSSING.*BLOOM/);
 await page.screenshot({path:'artifacts/loom-held.png'});
 const b=point(8,3);await page.mouse.move(b.x,b.y,{steps:12});await page.waitForTimeout(700);
 assert.match(await page.locator('#touchState').textContent(),/DUST/);
 await page.mouse.up();await page.waitForTimeout(750);
 assert.match(await page.locator('#touchState').textContent(),/HOLD A CROSSING/);
 await page.locator('#bpm').fill('200');await page.locator('#bpm').dispatchEvent('change');await page.locator('#loop').click();
 await page.mouse.move(a.x,a.y);await page.mouse.down();await page.waitForTimeout(700);await page.mouse.move(b.x,b.y);await page.waitForTimeout(500);await page.mouse.up();
 await page.waitForTimeout(1600);assert.equal(await page.locator('#loopLabel').textContent(),'PAUSE');
 await page.screenshot({path:'artifacts/loom-loop.png'});await page.locator('#clearLoop').click();
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:a.x,y:a.y,id:1},{x:b.x,y:b.y,id:2}]});
 await page.waitForTimeout(1100);assert.match(await page.locator('#touchState').textContent(),/2 CROSSINGS/);
 await page.screenshot({path:'artifacts/loom-multitouch.png'});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await page.locator('#settingsOpen').click();assert.equal(await page.locator('dialog').evaluate(e=>e.open),true);await page.locator('#settingsClose').click();
 for(const [width,height] of [[320,568],[390,664],[430,932],[844,390],[1280,900]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(100);
  const metrics=await page.evaluate(()=>({w:innerWidth,sw:document.documentElement.scrollWidth,h:innerHeight,sh:document.documentElement.scrollHeight,stage:document.querySelector('canvas').getBoundingClientRect().height}));
  assert.ok(metrics.sw<=width,JSON.stringify(metrics));assert.ok(metrics.sh<=height,JSON.stringify(metrics));assert.ok(metrics.stage>=220);
  await page.screenshot({path:`artifacts/loom-${width}x${height}.png`});
 }
 console.log(JSON.stringify({errors,layouts:'5 sizes',touch:'tap, hold, weave, 2 fingers',loop:'record, replay, clear'}));assert.deepEqual(errors,[]);
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
