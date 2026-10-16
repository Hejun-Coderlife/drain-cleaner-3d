/* ============================================================
   罐身标签 / 瓶盖文字 —— 用 Canvas 按视频截图重画的示意稿
   以后拿到真实设计稿：把展开图存成 label.png（宽:高 ≈ 1.41:1，
   画面中心 = 罐子正面）放到本目录，app.js 会自动换上。
   ============================================================ */

const NAVY = '#22357f', RED = '#e43a2f', PINKT = '#e2589a';
const BLACK = '900 {s}px "Arial Black","Helvetica Neue",Arial,sans-serif';
const BOLD  = '800 {s}px "Helvetica Neue",Arial,sans-serif';
const ROUND = '700 {s}px "Arial Rounded MT Bold","Helvetica Neue",Arial,sans-serif';
const F = (tpl, s) => tpl.replace('{s}', s);

let _seed = 7;
const rnd = () => (_seed = (_seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

function txt(g, s, x, y, font, fill, strokes = [], align = 'center', rot = 0) {
  g.save();
  g.translate(x, y); g.rotate(rot);
  g.font = font; g.textAlign = align; g.textBaseline = 'middle'; g.lineJoin = 'round';
  for (const [w, c] of strokes) { g.lineWidth = w; g.strokeStyle = c; g.strokeText(s, 0, 0); }
  if (fill) { g.fillStyle = fill; g.fillText(s, 0, 0); }
  g.restore();
}
function circle(g, x, y, r, fill, stroke, lw = 3) {
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.lineWidth = lw; g.strokeStyle = stroke; g.stroke(); }
}
function star(g, x, y, r, a) {
  g.save(); g.translate(x, y); g.fillStyle = `rgba(255,255,255,${a})`;
  g.beginPath();
  g.moveTo(0, -r); g.quadraticCurveTo(0, 0, r, 0); g.quadraticCurveTo(0, 0, 0, r);
  g.quadraticCurveTo(0, 0, -r, 0); g.quadraticCurveTo(0, 0, 0, -r);
  g.fill(); g.restore();
}

/* 罐身展开图：u = 0.5 是正面（朝镜头） */
export function paintLabel(W = 2048, H = 1440) {
  _seed = 7;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const cx = W / 2;

  /* 底色：淡粉渐变 + 泡泡云 + 星光 */
  let gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#fad9e5'); gr.addColorStop(0.55, '#f7c7d8'); gr.addColorStop(1, '#f2b2ca');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 90; i++) {
    circle(g, rnd() * W, H * (0.70 + 0.32 * rnd()), 30 + 70 * rnd(), `rgba(255,255,255,${0.15 + 0.25 * rnd()})`);
  }
  for (let i = 0; i < 60; i++) star(g, rnd() * W, 120 + rnd() * (H - 160), 6 + 10 * rnd(), 0.5 + 0.4 * rnd());

  /* 顶部米金色腰带 */
  gr = g.createLinearGradient(0, 0, 0, 100);
  gr.addColorStop(0, '#f5ead0'); gr.addColorStop(1, '#e4cf9f');
  g.fillStyle = gr; g.fillRect(0, 0, W, 100);
  g.fillStyle = '#c9a65f'; g.fillRect(0, 100, W, 5);
  txt(g, 'THE TOTAL CLEANING SPECIALIST', cx, 52, F(BLACK, 46), NAVY);
  txt(g, 'THE TOTAL CLEANING SPECIALIST', 0, 52, F(BLACK, 46), NAVY);
  txt(g, 'THE TOTAL CLEANING SPECIALIST', W, 52, F(BLACK, 46), NAVY);

  /* HYPER CLEAN 标志牌 */
  g.save(); g.translate(1010, 335); g.rotate(-0.07);
  g.beginPath(); g.roundRect(-280, -168, 560, 336, 48); g.fillStyle = '#1f3a93'; g.fill();
  g.beginPath(); g.roundRect(-266, -154, 532, 308, 40); g.fillStyle = '#fff'; g.fill();
  g.lineCap = 'round';
  g.strokeStyle = '#2c5bd8'; g.lineWidth = 24;
  g.beginPath(); g.moveTo(-226, 112); g.quadraticCurveTo(0, 50, 236, 78); g.stroke();
  g.strokeStyle = RED; g.lineWidth = 14;
  g.beginPath(); g.moveTo(-196, 136); g.quadraticCurveTo(10, 88, 232, 106); g.stroke();
  txt(g, 'HYPER', 0, -80, F(BLACK, 116), RED, [[16, NAVY]]);
  txt(g, 'CLEAN', 0, 30, F(BLACK, 116), RED, [[16, NAVY]]);
  g.restore();

  /* DRAIN CLEANER 主标题 */
  g.save(); g.translate(935, 650); g.rotate(-0.05);
  txt(g, 'DRAIN', -40, -64, F(BLACK, 112), NAVY, [[42, PINKT], [20, '#fff']]);
  txt(g, 'CLEANER', 0, 62, F(BLACK, 112), NAVY, [[42, PINKT], [20, '#fff']]);
  g.restore();

  /* 右侧小插画：倒扣的罐子 + 台盆 + 粉色存水弯 */
  g.save(); g.translate(1335, 600);
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = '#c9ced8'; g.lineWidth = 22;
  g.beginPath(); g.moveTo(0, 30); g.lineTo(0, 120); g.arc(32, 120, 32, Math.PI, 0, true); g.lineTo(64, 95); g.stroke();
  g.strokeStyle = '#ef5f9f'; g.lineWidth = 9; g.stroke();
  g.beginPath(); g.ellipse(0, 18, 120, 44, 0, 0, Math.PI); g.fillStyle = '#fff'; g.fill();
  g.beginPath(); g.ellipse(0, 18, 120, 18, 0, 0, Math.PI * 2); g.fillStyle = '#f2f4f8'; g.fill();
  for (let i = 0; i < 9; i++) circle(g, -40 + i * 10, 8 - (i % 2) * 8, 16, '#fbd2e2');
  g.fillStyle = '#f48cbf'; g.beginPath(); g.roundRect(-20, -120, 40, 100, 8); g.fill();
  g.fillStyle = '#f9c6dc'; g.fillRect(-20, -120, 40, 60);
  g.restore();
  circle(g, 1405, 560, 50, '#ffe34d', '#ef5f9f', 5);
  txt(g, 'POWER', 1405, 536, F(BLACK, 21), RED);
  txt(g, 'FLUSH', 1405, 560, F(BLACK, 21), RED);
  txt(g, 'FOAM', 1405, 586, F(BLACK, 23), RED);

  /* 三个卖点图标 */
  const icons = [[800, ['ELIMINATES', 'ODORS']], [1010, ['FOAMING', 'CLEANING']], [1220, ['GENTLE', '& SAFE']]];
  icons.forEach(([x, lines], k) => {
    const y = 905;
    g.lineWidth = 4; g.strokeStyle = '#7d86a8';
    if (k === 0) {
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; circle(g, x + 20 * Math.cos(a), y + 20 * Math.sin(a), 13, null, '#7d86a8', 4); }
      circle(g, x, y, 8, '#fff', '#7d86a8', 4);
    } else if (k === 1) {
      circle(g, x - 16, y + 8, 20, 'rgba(255,255,255,.6)', '#5b6a9e', 4);
      circle(g, x + 18, y - 6, 15, 'rgba(255,255,255,.6)', '#5b6a9e', 4);
      circle(g, x + 4, y - 26, 9, 'rgba(255,255,255,.6)', '#5b6a9e', 4);
    } else {
      g.beginPath(); g.moveTo(x - 34, y + 14); g.quadraticCurveTo(x, y + 36, x + 34, y + 6); g.stroke();
      circle(g, x - 8, y - 12, 10, null, '#5b6a9e', 4);
      circle(g, x + 14, y - 24, 7, null, '#5b6a9e', 4);
    }
    txt(g, lines[0], x, 978, F(BOLD, 33), PINKT, [[6, '#fff']]);
    txt(g, lines[1], x, 1014, F(BOLD, 33), PINKT, [[6, '#fff']]);
  });

  /* 温和配方胶囊条 + 盾牌 */
  g.beginPath(); g.roundRect(812, 1060, 520, 90, 45); g.fillStyle = 'rgba(255,255,255,.92)'; g.fill();
  txt(g, 'MILD FORMULA', 1072, 1088, F(BOLD, 34), NAVY);
  txt(g, 'NO DAMAGE TO PIPES', 1072, 1126, F(BOLD, 34), NAVY);
  g.save(); g.translate(735, 1100);
  const shield = () => { g.beginPath(); g.moveTo(0, -60); g.lineTo(48, -42); g.quadraticCurveTo(48, 30, 0, 62); g.quadraticCurveTo(-48, 30, -48, -42); g.closePath(); };
  shield(); g.fillStyle = '#e2589a'; g.fill();
  g.scale(0.78, 0.78); shield(); g.fillStyle = '#fff'; g.fill();
  g.lineCap = 'round'; g.strokeStyle = '#9aa3bd'; g.lineWidth = 14;
  g.beginPath(); g.moveTo(-18, -34); g.lineTo(-18, 10); g.arc(0, 10, 18, Math.PI, 0, true); g.lineTo(18, -10); g.stroke();
  g.restore();

  /* 底部：Floral scent · 污垢小虫插画 · 口号 · 净含量 */
  txt(g, 'Floral', 628, 1238, F(ROUND, 66), PINKT, [[12, '#fff']], 'left');
  txt(g, 'scent', 648, 1304, F(ROUND, 66), PINKT, [[12, '#fff']], 'left');
  for (let i = 0; i < 14; i++) circle(g, 900 + rnd() * 230, 1225 + rnd() * 110, 28 + rnd() * 26, '#fde4ee');
  for (let i = 0; i < 7; i++) {
    const x = 930 + rnd() * 170, y = 1240 + rnd() * 80, r = 18 + rnd() * 26;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, 'rgba(70,40,20,.85)'); rg.addColorStop(1, 'rgba(70,40,20,0)');
    g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  g.save(); g.translate(1060, 1275); g.rotate(-0.35);
  g.strokeStyle = '#2b1a10'; g.lineWidth = 5; g.lineCap = 'round';
  for (const s of [-1, 1]) for (const k of [-1, 0, 1]) {
    g.beginPath(); g.moveTo(k * 22, 0); g.lineTo(k * 22 + k * 10, s * 44); g.stroke();
  }
  g.beginPath(); g.moveTo(52, -8); g.quadraticCurveTo(90, -50, 120, -40); g.stroke();
  g.beginPath(); g.moveTo(52, 8); g.quadraticCurveTo(95, -10, 128, -4); g.stroke();
  g.beginPath(); g.ellipse(0, 0, 50, 26, 0, 0, Math.PI * 2); g.fillStyle = '#4a2a14'; g.fill();
  circle(g, 50, 0, 18, '#3a200f');
  circle(g, 56, -8, 7, '#fff'); circle(g, 58, -8, 3, '#000');
  g.restore();
  txt(g, 'Grease, Gunk, Bugs,', 1268, 1240, F(BOLD, 38), PINKT, [[8, '#fff']], 'center', -0.5);
  txt(g, 'Flush Away!', 1300, 1290, F(BOLD, 40), PINKT, [[8, '#fff']], 'center', -0.5);
  txt(g, '400ml', 1400, 1350, F(BOLD, 34), NAVY);

  /* 背面：使用说明 + 注意事项 + 条形码 */
  const dir = ['DIRECTIONS', '1. Shake well (10 times).', '2. Twist cap to OPEN.', '3. Turn upside down and press',
    '    firmly onto the drain.', '4. Wait 30 minutes.', '5. Flush with warm water.'];
  dir.forEach((s, i) => txt(g, s, 1590, 230 + i * 56, i ? F(BOLD, 30) : F(BLACK, 40), i ? '#34407a' : NAVY, [], 'left'));
  txt(g, 'CAUTION', 140, 230, F(BLACK, 40), NAVY, [], 'left');
  for (let i = 0; i < 12; i++) {
    g.fillStyle = 'rgba(52,64,122,.45)';
    g.fillRect(140, 285 + i * 40, 280 + rnd() * 100, 12);
  }
  g.fillStyle = '#fff'; g.fillRect(150, 1150, 290, 200);
  let bx = 170;
  while (bx < 420) { const w = 2 + Math.floor(rnd() * 6); g.fillStyle = '#111'; g.fillRect(bx, 1170, w, 130); bx += w + 2 + Math.floor(rnd() * 5); }
  txt(g, '6 901234 567892', 295, 1325, F(BOLD, 24), '#111');
  for (let i = 0; i < 8; i++) {
    g.fillStyle = 'rgba(52,64,122,.4)';
    g.fillRect(1590, 640 + i * 40, 260 + rnd() * 90, 12);
  }
  return c;
}

/* 喇叭口瓶盖侧面：浅压的 OPEN / LOCK 字样（u=0.5 正面 = LOCK，u=0.25 = OPEN） */
export function paintCapRing(color = '#f48cbf', W = 1024, H = 256) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, W, H);
  const ink = 'rgba(160,40,95,.55)', hi = 'rgba(255,255,255,.35)';
  for (const [u, s] of [[0.5, 'LOCK'], [0.25, 'OPEN']]) {
    const x = u * W;
    txt(g, s, x + 1.5, H * 0.52 + 1.5, F(BLACK, 46), hi);
    txt(g, s, x, H * 0.52, F(BLACK, 46), ink);
    g.fillStyle = ink;
    g.beginPath(); g.moveTo(x - 11, H * 0.86); g.lineTo(x + 11, H * 0.86); g.lineTo(x, H * 0.72); g.fill();
  }
  return c;
}
