/* 导出整个场景（台面/台盆/龙头/管道/泡沫/罐子/细菌/气泡…）：把动画定格在时间 T，导出 GLB，再用 assimp 转 FBX / OBJ
   网页里的自定义 shader（泡沫/玻璃/清水/污垢）换成通用 PBR 材质；泡沫"还没流到"的部分按进度裁掉
   GLB 单位米；FBX / OBJ 单位厘米（和罐子模型一致）
   用法：先在项目目录起服务器 python3 -m http.server 8765，再
        node tools/export_scene.mjs <输出目录> [T 秒，默认 9.9]                                      */
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const [OUT = 'export-scene', T = '9.9'] = process.argv.slice(2);
const NAME = 'hyper-clean-scene';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9334;
mkdirSync(OUT, { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--window-size=1600,900', '--ignore-gpu-blocklist',
  `--user-data-dir=${join(tmpdir(), 'drain-chrome-export')}`, 'http://localhost:8765/?rec=1&ui=0',
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
const evaluate = async expr => {
  const m = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (m.result?.exceptionDetails) throw new Error(m.result.exceptionDetails.exception?.description || 'evaluate failed');
  return m.result?.result?.value;
};

while (!(await evaluate('!!(window.DRAIN && DRAIN.CAN)'))) await sleep(200);
await sleep(2500);                                         // 等罐子贴图加载完

/* ---------- 浏览器里执行：定格 → 拷一份"烘焙"过的场景 → GLTFExporter ---------- */
const BROWSER = /* js */`(async (T, scale) => {
  const { THREE, scene, frame } = DRAIN;
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
  frame(T);                                               // 摆到 T（含自动运镜机位）
  scene.updateMatrixWorld(true);
  const MODEL = scene.children.find(o => o.isGroup);

  // 污垢膜：网页 shader 里的噪声斑块，在 JS 里照算一遍，只留下有污垢的三角形（不靠贴图透明，FBX/OBJ 也能正常显示）
  const fract = x => x - Math.floor(x);
  const hash = (x, y, z) => fract(Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453);
  const vnoise = (x, y, z) => {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    let fx = x - ix, fy = y - iy, fz = z - iz;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
    const h = (a, b, c) => hash(ix + a, iy + b, iz + c), l = (a, b, k) => a + (b - a) * k;
    return l(l(l(h(0, 0, 0), h(1, 0, 0), fx), l(h(0, 1, 0), h(1, 1, 0), fx), fy),
             l(l(h(0, 0, 1), h(1, 0, 1), fx), l(h(0, 1, 1), h(1, 1, 1), fx), fy), fz);
  };
  const sm = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  const GRIME_M = [0x4d3019, 0x8c6640].map((c, i) => new THREE.MeshStandardMaterial({
    name: i ? 'grime_light' : 'grime_dark', color: c, roughness: 0.9, side: THREE.DoubleSide }));
  const grimeMeshes = (o, clean, dirt) => {
    const geo = o.geometry, idx = geo.index, pos = geo.attributes.position, uv = geo.attributes.uv;
    const ids = [[], []], P = new THREE.Vector3(), Q = new THREE.Vector3();
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i + 2 < n; i += 3) {
      const t = [0, 1, 2].map(k => idx ? idx.getX(i + k) : i + k);
      const u = (uv.getX(t[0]) + uv.getX(t[1]) + uv.getX(t[2])) / 3;
      if (u < clean) continue;
      P.set(0, 0, 0);
      for (const k of t) P.add(Q.fromBufferAttribute(pos, k));
      P.divideScalar(3).applyMatrix4(o.matrixWorld);
      const nz = vnoise(P.x * 70, P.y * 70, P.z * 70) * 0.6 + vnoise(P.x * 190, P.y * 190, P.z * 190) * 0.4;
      const m = sm(0.42, 0.72, nz) * sm(0.10, 0.22, u) * sm(0.82, 0.68, u) * 0.8 * dirt;
      if (m < 0.22) continue;
      ids[vnoise(P.x * 400, P.y * 400, P.z * 400) > 0.5 ? 1 : 0].push(...t);
    }
    return ids.map((list, i) => {
      if (!list.length) return null;
      const g = geo.clone(); g.setIndex(list); g.setDrawRange(0, Infinity);
      return { geo: g, mat: GRIME_M[i] };
    }).filter(Boolean);
  };

  // 自定义 shader → 通用材质；返回 { mat, keep(u) 裁剪函数, name }
  const matCache = new Map();
  const bake = m => {
    if (!m.isShaderMaterial) {
      if (!m.name) m.name = (m.map ? 'textured_' : m.metalness > 0.5 ? 'metal_' : 'mat_') + m.color.getHexString();
      return { mat: m, name: m.map ? 'textured' : 'solid' };
    }
    const U = m.uniforms, key = m.uuid;
    if (U.uA) {                                           // 泡沫
      const head = U.uHead.value, tail = U.uTail.value, a = U.uAlpha.value;
      const mat = matCache.get(key) || new THREE.MeshStandardMaterial({
        name: U.uSpeck.value > 0 ? 'foam_dirty' : 'foam', color: U.uSpeck.value > 0 ? 0xe9a9bd : 0xf3b6ca,
        roughness: 0.85, transparent: a < 1, opacity: a, side: THREE.DoubleSide });
      matCache.set(key, mat);
      return { mat, keep: u => u <= head && u >= tail, name: 'foam' };
    }
    if (U.uTint) {                                        // 玻璃管 / 气泡
      const mat = matCache.get(key) || new THREE.MeshPhysicalMaterial({
        name: 'glass', color: 0xd6ecff, roughness: 0.05, metalness: 0, transparent: true,
        opacity: 0.22 * U.uOp.value, depthWrite: false, side: THREE.DoubleSide });
      matCache.set(key, mat);
      return { mat, name: 'glass' };
    }
    if (U.uClean) return { grime: [U.uClean.value, U.uDirt.value], mat: GRIME_M[0], name: 'grime' };   // 污垢膜
    if (U.uHead) {                                        // 清水
      const head = U.uHead.value, tail = U.uTail.value, stream = !!m.defines?.STREAM;
      const mat = matCache.get(key) || new THREE.MeshPhysicalMaterial({
        name: 'water', color: 0x9fd2ff, roughness: 0.05, transparent: true, opacity: 0.55, depthWrite: false });
      matCache.set(key, mat);
      return { mat, keep: stream ? null : (u => u <= head && u >= tail), name: 'water' };
    }
    return null;
  };

  // 按 drawRange 展开成三角形，并按 uv.x 裁掉还没流到/已冲走的部分
  const cutGeo = (geo, keep) => {
    const idx = geo.index, uv = geo.attributes.uv;
    const total = idx ? idx.count : geo.attributes.position.count;
    const s = geo.drawRange.start, e = Math.min(total, s + geo.drawRange.count);
    if (!keep && s === 0 && e === total) return geo;
    const ids = [];
    for (let i = s; i + 2 < e + 0; i += 3) {
      const a = idx ? idx.getX(i) : i, b = idx ? idx.getX(i + 1) : i + 1, c = idx ? idx.getX(i + 2) : i + 2;
      if (keep && !(keep(uv.getX(a)) && keep(uv.getX(b)) && keep(uv.getX(c)))) continue;
      ids.push(a, b, c);
    }
    if (!ids.length) return null;
    const g = geo.clone(); g.setIndex(ids); g.setDrawRange(0, Infinity);
    return g;
  };

  const shown = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  const root = new THREE.Group(); root.name = 'HYPER_CLEAN_scene';
  const counts = {};
  MODEL.traverse(o => {
    if (!o.isMesh || !shown(o)) return;
    const b = bake(o.material); if (!b) return;
    if (b.mat.transparent && b.mat.opacity < 0.02) return;            // 已淡出的（爆掉的细菌圈等）
    const parts = b.grime ? grimeMeshes(o, ...b.grime) : [{ geo: cutGeo(o.geometry, b.keep), mat: b.mat }];
    for (const { geo, mat } of parts) {
      if (!geo) continue;
      const n = o.name || b.name;
      counts[n] = (counts[n] || 0) + 1;
      const m = new THREE.Mesh(geo, mat);
      m.name = n + '_' + counts[n];
      o.matrixWorld.decompose(m.position, m.quaternion, m.scale);
      root.add(m);
    }
  });

  // 背景板：网页背景是屏幕上的渐变（#f6fcff → #94c8ec），模型格式没有"背景"，这里在场景后方立一块贴同款渐变的不受光板子
  {
    const bg = scene.background;
    const mat = new THREE.MeshBasicMaterial({ name: 'background', map: bg.isTexture ? bg : null, color: bg.isColor ? bg : 0xffffff });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), mat);
    m.name = 'background';
    m.position.set(0, -0.2, -1.2);
    root.add(m);
  }

  // 材质名去重（OBJ/FBX 按名字认材质）
  const seen = {};
  new Set(root.children.map(m => m.material)).forEach(mt => {
    seen[mt.name] = (seen[mt.name] || 0) + 1;
    if (seen[mt.name] > 1) mt.name += '_' + seen[mt.name];
  });

  // 两台全景相机：横屏 16:9 用网页「全景」机位；竖屏 9:16 视角放宽到 50° 并沿视线拉远（和录竖屏视频一致）
  {
    const v = DRAIN.VIEWS.full, P = new THREE.Vector3(...v.p), Tg = new THREE.Vector3(...v.t);
    const tan = d => Math.tan(d * Math.PI / 360);
    const add = (name, fov, aspect, pos) => {
      const c = new THREE.PerspectiveCamera(fov, aspect, 0.01, 50);
      c.name = name; c.position.copy(pos); c.lookAt(Tg); root.add(c);
    };
    add('cam_16x9', 35, 16 / 9, P);
    const k = tan(35) * 16 / 9 * 0.7 / (tan(50) * 9 / 16);
    add('cam_9x16', 50, 9 / 16, P.clone().sub(Tg).multiplyScalar(k).add(Tg));
  }

  root.scale.setScalar(scale);
  const buf = await new GLTFExporter().parseAsync(root, { binary: true, maxTextureSize: 4096 });
  let bin = ''; const u8 = new Uint8Array(buf);
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return { glb: btoa(bin), meshes: root.children.length - 1, counts };
})`;

const r = await evaluate(`${BROWSER}(${+T}, 1)`);
writeFileSync(join(OUT, `${NAME}.glb`), Buffer.from(r.glb, 'base64'));
console.log(`GLB：${r.meshes} 个网格`, r.counts);

// FBX / OBJ：导一份厘米单位的 GLB，拆成 glTF + 独立贴图 PNG（贴图按文件名引用，不内嵌），再交给 assimp 转
const glb = Buffer.from((await evaluate(`${BROWSER}(${+T}, 100)`)).glb, 'base64');
ws.close(); chrome.kill();
const jsonLen = glb.readUInt32LE(12);
const gltf = JSON.parse(glb.subarray(20, 20 + jsonLen).toString());
const bin = glb.subarray(20 + jsonLen + 8);
const TMP = join(tmpdir(), `${NAME}-gltf`);
rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP);
gltf.images.forEach((img, i) => {
  const bv = gltf.bufferViews[img.bufferView];
  const file = `tex_${i}.png`;
  const png = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
  writeFileSync(join(TMP, file), png); writeFileSync(join(OUT, file), png);
  delete img.bufferView; delete img.mimeType; img.uri = file;
});
gltf.buffers[0].uri = `${NAME}.bin`;
writeFileSync(join(TMP, `${NAME}.bin`), bin);
writeFileSync(join(TMP, `${NAME}.gltf`), JSON.stringify(gltf));
for (const ext of ['fbx', 'obj']) {
  execFileSync('assimp', ['export', join(TMP, `${NAME}.gltf`), join(OUT, `${NAME}.${ext}`), '-f', ext], { stdio: 'ignore' });
}
rmSync(TMP, { recursive: true });
console.log('完成：', OUT);
