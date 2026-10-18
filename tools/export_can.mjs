/* 导出罐子模型：OBJ + MTL + can.png（单位厘米，罐底在 y=0，正面朝 +Z），瓶盖是单独的对象 cap
   再用 assimp 转 FBX：assimp export hyper-clean-can.obj hyper-clean-can.fbx -f fbx
   用法：node tools/export_can.mjs <输出目录>                                                    */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] || join(ROOT, 'export');
const SEG = 128, NAME = 'hyper-clean-can';
mkdirSync(OUT, { recursive: true });

// 轮廓数据直接从 app.js 里读，保证和网页里的罐子完全一致
const src = readFileSync(join(ROOT, 'app.js'), 'utf8');
const CAN_PROFILE = JSON.parse(src.match(/const CAN_PROFILE = (\[.*?\]);/)[1]);
const ROWS = Function(`return ${src.match(/const CAN_ROWS = (\{.*?\});/)[1]}`)();
const PX = 6.5 / 459;                                     // 厘米 / 像素（罐身直径 459px = 6.5cm）

const desc = [...CAN_PROFILE].reverse();
const parts = {
  body: [[ROWS.bot, 0], ...desc.filter(([r]) => r > ROWS.cap + 1), [ROWS.cap + 1, 105.5], [ROWS.cap + 1, 0]],
  cap:  [[ROWS.cap + 1, 100], ...desc.filter(([r]) => r <= ROWS.cap + 1), [ROWS.top, 0]],
};

let obj = `# HYPER CLEAN Drain Cleaner 400ml — 6.5 x 22 cm, units: cm\nmtllib ${NAME}.mtl\n`;
let nv = 0, nt = 0, nn = 0;
for (const [name, pts] of Object.entries(parts)) {
  const P = pts.map(([row, r]) => ({ r: r * PX, h: (ROWS.bot - row) * PX, v: (ROWS.bot - row) / (ROWS.bot - ROWS.top) }));
  // 每段轮廓的外法线 (nr, nh)；相邻两段夹角 < 35° 就平滑，否则保留硬边
  const segN = [];
  for (let k = 0; k < P.length - 1; k++) {
    const dr = P[k + 1].r - P[k].r, dh = P[k + 1].h - P[k].h, l = Math.hypot(dr, dh) || 1;
    segN.push([dh / l, -dr / l]);
  }
  const endN = (k, end) => {                                // 第 k 段在 end(0 下端 / 1 上端) 处的法线
    const a = segN[k], j = end ? k + 1 : k - 1, b = segN[j];
    if (!b || a[0] * b[0] + a[1] * b[1] < Math.cos(35 * Math.PI / 180)) return a;
    const x = a[0] + b[0], y = a[1] + b[1], l = Math.hypot(x, y);
    return [x / l, y / l];
  };
  obj += `o ${name}\nusemtl can\ns 1\n`;
  for (let i = 0; i <= SEG; i++) {
    const phi = -Math.PI + i / SEG * Math.PI * 2, s = Math.sin(phi), c = Math.cos(phi);
    for (const p of P) obj += `v ${(p.r * s).toFixed(5)} ${p.h.toFixed(5)} ${(p.r * c).toFixed(5)}\nvt ${(i / SEG).toFixed(5)} ${p.v.toFixed(5)}\n`;
    for (let k = 0; k < segN.length; k++) for (const e of [0, 1]) {
      const [r, h] = endN(k, e);
      obj += `vn ${(r * s).toFixed(5)} ${h.toFixed(5)} ${(r * c).toFixed(5)}\n`;
    }
  }
  const V = (i, j) => nv + i * P.length + j + 1, T = (i, j) => nt + i * P.length + j + 1;
  const N = (i, k, e) => nn + i * segN.length * 2 + k * 2 + e + 1;
  for (let i = 0; i < SEG; i++) for (let k = 0; k < segN.length; k++) {
    if (P[k].r === 0 && P[k + 1].r === 0) continue;
    const f = [[i, k, 0], [i + 1, k, 0], [i + 1, k + 1, 1], [i, k + 1, 1]].map(([a, j, e]) => `${V(a, j)}/${T(a, j)}/${N(a, k, e)}`);
    obj += `f ${f.join(' ')}\n`;
  }
  nv += (SEG + 1) * P.length; nt += (SEG + 1) * P.length; nn += (SEG + 1) * segN.length * 2;
}
writeFileSync(join(OUT, `${NAME}.obj`), obj);
writeFileSync(join(OUT, `${NAME}.mtl`), `newmtl can\nKa 0 0 0\nKd 1 1 1\nKs 0.25 0.25 0.25\nNs 60\nillum 2\nmap_Kd can.png\n`);
copyFileSync(join(ROOT, 'can.png'), join(OUT, 'can.png'));
console.log('导出：', OUT);
