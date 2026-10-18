/* 逐帧录制演示视频：无界面 Chrome 打开 ?rec=1，按固定帧率调 DRAIN.frame(T) 截帧，最后 ffmpeg 合成 MP4
   用法：先在项目目录起服务器 python3 -m http.server 8765，再
        node tools/record.mjs [输出.mp4] [宽] [高] [帧率]                                         */
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const [OUT = 'hyper-clean.mp4', W = '1920', H = '1080', FPS = '30'] = process.argv.slice(2);
const URL_ = `http://localhost:8765/?rec=1&ui=0`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const DIR = join(tmpdir(), 'drain-frames');
rmSync(DIR, { recursive: true, force: true }); mkdirSync(DIR, { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--window-size=${W},${H}`, '--hide-scrollbars',
  '--force-device-scale-factor=1', '--ignore-gpu-blocklist', `--user-data-dir=${join(tmpdir(), 'drain-chrome')}`, URL_,
], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

let ws;
for (let i = 0; i < 50 && !ws; i++) {
  await sleep(300);
  try {
    const page = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find(t => t.type === 'page');
    if (page) ws = new WebSocket(page.webSocketDebuggerUrl);
  } catch {}
}
await new Promise(r => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); pending.get(m.id)?.(m); pending.delete(m.id); });
const send = (method, params) => new Promise(r => {
  const i = ++id; pending.set(i, r);
  ws.send(JSON.stringify({ id: i, method, params }));
});
const evaluate = expr => send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }).then(m => m.result?.result?.value);
// 视口精确设成 W×H（--window-size 会被浏览器边框吃掉一截）
await send('Emulation.setDeviceMetricsOverride', { width: +W, height: +H, deviceScaleFactor: 1, mobile: false });

while (!(await evaluate('!!(window.DRAIN && DRAIN.CAN)'))) await sleep(200);
await sleep(2500);                                         // 等罐子贴图、CDN 资源加载完
await evaluate(`dispatchEvent(new Event('resize')), DRAIN.renderer.setPixelRatio(1), DRAIN.renderer.setSize(${W}, ${H})`);
const end = await evaluate('DRAIN.TL.end');
const n = Math.ceil(end * FPS);
const t0 = Date.now();
for (let i = 0; i <= n; i++) {
  const url = await evaluate(`DRAIN.frame(${(i / FPS).toFixed(4)})`);
  writeFileSync(join(DIR, `f${String(i).padStart(5, '0')}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
  if (i % 30 === 0) process.stdout.write(`\r帧 ${i}/${n}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
ws.close(); chrome.kill();
console.log('\n合成视频…');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', FPS, '-i', join(DIR, 'f%05d.jpg'),
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '17', '-preset', 'slow', '-movflags', '+faststart', OUT], { stdio: 'inherit' });
console.log('完成：', OUT);
