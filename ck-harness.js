// ck-harness.js — DEV ONLY, never packaged (not in build.files).
// Loads cracktro.html on its own with a stub cracktroAPI, drives each
// word sequence via window.__ck, screenshots the key moments and prints
// the diagnostic state. Run:  xvfb-run -a npx electron ck-harness.js
// Screenshots land in $CK_OUT (default /tmp/ck-shots).
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const OUT = process.env.CK_OUT || '/tmp/ck-shots';
fs.mkdirSync(OUT, { recursive: true });
const stub = path.join(OUT, 'stub-preload.js');
fs.writeFileSync(stub, `
const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('cracktroAPI', {
  getConfig: () => Promise.resolve({ uin: '1337', music: false, volume: 60, everyLaunch: true,
    userText: process.env.CK_USERTEXT || '' }),
  set: () => {}, toggleFullscreen: () => {}, close: () => {}
});`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 640, height: 400, show: true, backgroundColor: '#000',
    webPreferences: { preload: stub, contextIsolation: true, sandbox: false }
  });
  await win.loadFile(path.join(__dirname, 'cracktro.html'));
  const js = (code) => win.webContents.executeJavaScript(code);
  const shot = async (name) => {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG());
  };
  await sleep(1500);
  console.log('boot', JSON.stringify(await js('window.__ck.state()')));

  // ---- SHOOTS ----
  console.log('seek SHOOTS', await js('window.__ck.seek("SHOOTS")'));
  const seen = new Set();
  for (let i = 0; i < 60; i++) {
    await sleep(120);
    const st = await js('window.__ck.state()');
    const ph = st.phases.find((p) => p.startsWith('burst:'));
    if (!seen.has(ph)) { seen.add(ph); console.log('t=' + (i * 120) + 'ms', ph, 'smoke', st.smoke, 'parts', st.parts); await shot('shoots-' + ph.split(':')[1] + '-first'); }
    if (ph === 'burst:popped' && i % 8 === 0) await shot('shoots-popped-' + i);
  }
  const st1 = await js('window.__ck.state()');
  console.log('after SHOOTS', JSON.stringify({ phases: st1.phases, smoke: st1.smoke, parts: st1.parts, sfxPop: st1.sfxPop, ohno: st1.ohnoDuration, ohnoReady: st1.ohnoReady }));

  // ---- TRANSMITS ----
  console.log('seek TRANSMITS', await js('window.__ck.seek("TRANSMITS")'));
  const seen2 = new Set();
  for (let i = 0; i < 50; i++) {
    await sleep(120);
    const st = await js('window.__ck.state()');
    const ph = st.phases.find((p) => p.startsWith('rings:'));
    if (!seen2.has(ph)) { seen2.add(ph); console.log('t=' + (i * 120) + 'ms', ph, 'rings', st.rings); await shot('transmits-' + ph.split(':')[1] + '-first'); }
    if (ph === 'rings:rising' && i % 6 === 3) await shot('transmits-rising-' + i);
    if (ph === 'rings:live' && i % 10 === 5) await shot('transmits-live-' + i);
  }
  const st2 = await js('window.__ck.state()');
  console.log('after TRANSMITS', JSON.stringify({ phases: st2.phases, rings: st2.rings, sfxPing: st2.sfxPing }));

  // ---- in-page render of the synths: same numbers as node? ----
  const chk = await js(`(function(){ var p=window.__ck.renderPop(44100), q=window.__ck.renderPing(44100), mp=0, mq=0;
     for (var i=0;i<p.length;i++) mp=Math.max(mp,Math.abs(p[i])); for (var j=0;j<q.length;j++) mq=Math.max(mq,Math.abs(q[j]));
     return {popLen:p.length, popPeak:mp.toFixed(3), pingLen:q.length, pingPeak:mq.toFixed(3)}; })()`);
  console.log('in-page synths', JSON.stringify(chk));

  // ---- TIER 2+3 ----
  const state = () => js('window.__ck.state()');
  await js('window.__ck.spawn("saturnGiant")'); await js('window.__ck.spawn("iss")'); await js('window.__ck.spawn("voyager")');
  await sleep(9000); let st = await state();
  console.log('giant saturn', JSON.stringify({ planet: st.planet, craft: st.craft })); await shot('t3-giant-saturn');
  await sleep(9000); await shot('t3-giant-saturn-later');
  await js('window.__ck.spawn("sputnik")'); await js('window.__ck.spawn("hubble")'); await js('window.__ck.spawn("rock")'); await js('window.__ck.spawn("cigar")'); await js('window.__ck.spawn("foo")');
  await sleep(3000); await shot('t3-sats-rock-cigar-saucer');
  await js('planet = null; window.__ck.spawn("jupiter")'); await sleep(14000); await shot('t3-jupiter');
  await js('planet = null; window.__ck.spawn("ochre")'); await sleep(6000); await shot('t3-ochre-spin');
  await js('window.__ck.spawn("fight")');
  for (const ms of [2500, 3000, 3000]) { await sleep(ms); st = await state(); console.log('fight', JSON.stringify({ fight: st.fight, craft: st.craft, smoke: st.smoke, zap: st.sfxZap })); await shot('t3-fight-' + st.craft.length); }
  let waited = 0; while (waited < 30000) { st = await state(); if (!st.fight) break; await sleep(1000); waited += 1000; }
  console.log('fight over, foos left:', st.craft.filter((k) => k === 'foo' || k === 'cigar').length, 'smoke hanging:', st.smoke);
  const type = async (w) => { for (const ch of w) await js(`window.dispatchEvent(new KeyboardEvent('keydown', {key: '${ch}'}))`); };
  await type('avid'); await sleep(400); st = await state(); console.log('AVID #1', JSON.stringify({ found: st.found, lane: st.secretLine, scrollLen: st.scrollLen })); await shot('t3-secret-avid');
  await sleep(3000); await type('avid'); await sleep(300); st = await state(); console.log('AVID #2 (repeat)', JSON.stringify({ found: st.found, lane: st.secretLine, scrollLen: st.scrollLen }));
  await sleep(3000); await type('calix'); await sleep(400); st = await state(); console.log('CALIX', JSON.stringify({ found: st.found, lane: st.secretLine, rings: st.rings })); await shot('t3-secret-calix');
  await js('window.__ck.crt(true)'); await sleep(600); await shot('t3-crt'); await js('window.__ck.crt(false)');
  const chk2 = await js(`(function(){ var z=window.__ck.renderZap(44100), m=0; for (var i=0;i<z.length;i++) m=Math.max(m,Math.abs(z[i])); return {zapLen:z.length, zapPeak:m.toFixed(3), zapEnd:z[z.length-1].toFixed(4)}; })()`);
  console.log('zap synth', JSON.stringify(chk2));
  const fps = await js(`new Promise(r => { let n = 0; const t0 = performance.now(); function f(){ n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r((n/2).toFixed(0)); } requestAnimationFrame(f); })`);
  console.log('rAF per second:', fps);
  app.exit(0);
}).catch((e) => { console.error('harness failed', e); app.exit(1); });
