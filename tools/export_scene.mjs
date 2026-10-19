/* 导出整个场景（台面/台盆/龙头/管道/泡沫/罐子/细菌/气泡…）给 Blender 等软件用
   网页里的自定义 shader（泡沫/玻璃/清水/污垢）换成通用 PBR 材质；背景渐变做成场景后方的一块板子；带横 / 竖两台相机
   两种模式：
     定格：把动画定格在时间 T，导出 GLB + FBX + OBJ（GLB 单位米；FBX / OBJ 单位厘米），泡沫"还没流到"的部分按进度裁掉
     --anim：整段动画按 30fps 逐帧采样成关键帧，导出一个带动画的 GLB（单位米）
       · 会移动的（罐子、细菌、蛾蚋、污垢块、水柱、箭头…）→ 位置 / 旋转 / 缩放关键帧，消失 = 缩放到 0
       · 管内泡沫 / 清水 / 污垢膜 / 溢水通道 → 沿管子切成小段，按进度逐段出现 / 消失
       · 台盆泡沫、溢水口挤出的泡沫带（每帧重算形状）→ 每 8 帧采一个形态键，中间线性过渡
       · 箭头粉 → 蓝 → 拆成粉、蓝两份，按时间切换
       · 相机按网页自动运镜走（cam_16x9 横屏 / cam_9x16 竖屏）
   用法：先在项目目录起服务器 python3 -m http.server 8765，再
        node tools/export_scene.mjs <输出目录> [T 秒，默认 9.9]
        node tools/export_scene.mjs <输出目录> --anim                                                */
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const argv = process.argv.slice(2);
const ANIM = argv.includes('--anim');
const [OUT = 'export-scene', T = '9.9'] = argv.filter(a => a !== '--anim');
const NAME = ANIM ? 'hyper-clean-scene-anim' : 'hyper-clean-scene';
const FPS = 30;
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

/* ---------- 浏览器里执行：两种模式共用的材质烘焙 / 几何切分 / 背景 / 相机 ---------- */
const HELPERS = /* js */`
  const { THREE, scene } = DRAIN;
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
  const MODEL = scene.children.find(o => o.isGroup);

  // 三角形列表（按 drawRange），每个带上 uv.x 平均值 = 沿管子的进度
  const trisOf = geo => {
    const idx = geo.index, uv = geo.attributes.uv;
    const total = idx ? idx.count : geo.attributes.position.count;
    const s = geo.drawRange.start, e = Math.min(total, s + geo.drawRange.count), out = [];
    for (let i = s; i + 2 < e; i += 3) {
      const t = [0, 1, 2].map(k => idx ? idx.getX(i + k) : i + k);
      out.push({ t, u: (uv.getX(t[0]) + uv.getX(t[1]) + uv.getX(t[2])) / 3 });
    }
    return out;
  };
  const geoOf = (geo, tris) => {
    if (!tris.length) return null;
    const g = geo.clone(); g.setIndex(tris.flatMap(x => x.t)); g.setDrawRange(0, Infinity);
    return g;
  };

  // 污垢膜：网页 shader 里的噪声斑块，在 JS 里照算一遍，只留下有污垢的三角形，分深浅两色（不靠贴图透明，FBX/OBJ 也能正常显示）
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
  const grimeTris = (o, dirt) => {                        // → [深色三角形[], 浅色三角形[]]
    const pos = o.geometry.attributes.position, P = new THREE.Vector3(), Q = new THREE.Vector3(), out = [[], []];
    for (const tr of trisOf(o.geometry)) {
      P.set(0, 0, 0);
      for (const k of tr.t) P.add(Q.fromBufferAttribute(pos, k));
      P.divideScalar(3).applyMatrix4(o.matrixWorld);
      const nz = vnoise(P.x * 70, P.y * 70, P.z * 70) * 0.6 + vnoise(P.x * 190, P.y * 190, P.z * 190) * 0.4;
      const m = sm(0.42, 0.72, nz) * sm(0.10, 0.22, tr.u) * sm(0.82, 0.68, tr.u) * 0.8 * dirt;
      if (m >= 0.22) out[vnoise(P.x * 400, P.y * 400, P.z * 400) > 0.5 ? 1 : 0].push(tr);
    }
    return out;
  };

  // 自定义 shader → 通用材质；kind = foam / glass / grime / water / plain
  const matCache = new Map();
  const bake = m => {
    if (!m.isShaderMaterial) {
      if (!m.name) m.name = (m.map ? 'textured_' : m.metalness > 0.5 ? 'metal_' : 'mat_') + m.color.getHexString();
      return { mat: m, kind: 'plain', name: m.map ? 'textured' : 'solid' };
    }
    const U = m.uniforms, cached = matCache.get(m.uuid);
    if (U.uA) {                                           // 泡沫
      const a = U.uAlpha.value;
      const mat = cached || new THREE.MeshStandardMaterial({
        name: U.uSpeck.value > 0 ? 'foam_dirty' : 'foam', color: U.uSpeck.value > 0 ? 0xe9a9bd : 0xf3b6ca,
        roughness: 0.85, transparent: a < 1, opacity: a, side: THREE.DoubleSide });
      matCache.set(m.uuid, mat);
      return { mat, kind: 'foam', name: 'foam' };
    }
    if (U.uTint) {                                        // 玻璃管 / 气泡
      const mat = cached || new THREE.MeshPhysicalMaterial({
        name: 'glass', color: 0xd6ecff, roughness: 0.05, metalness: 0, transparent: true,
        opacity: 0.22 * U.uOp.value, depthWrite: false, side: THREE.DoubleSide });
      matCache.set(m.uuid, mat);
      return { mat, kind: 'glass', name: 'glass' };
    }
    if (U.uClean) return { mat: GRIME_M[0], kind: 'grime', name: 'grime' };                 // 污垢膜
    if (U.uHead) {                                        // 清水（水柱不裁）
      const mat = cached || new THREE.MeshPhysicalMaterial({
        name: 'water', color: 0x9fd2ff, roughness: 0.05, transparent: true, opacity: 0.55, depthWrite: false });
      matCache.set(m.uuid, mat);
      return { mat, kind: m.defines?.STREAM ? 'plain' : 'water', name: 'water' };
    }
    return null;
  };
  // 当前这一刻 shader 显示的 uv.x 范围 [tail, head]（污垢膜：clean 之后）
  const rangeNow = m => {
    const U = m.uniforms;
    if (U.uClean) return [U.uClean.value, 99];
    return [U.uTail.value, U.uHead.value];
  };

  const shown = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  const faded = m => !m.isShaderMaterial && m.transparent && m.opacity < 0.05;            // 已淡出的（爆掉的细菌圈等）

  // 背景板：网页背景是屏幕上的渐变（#f6fcff → #94c8ec），模型格式没有"背景"，这里在场景后方立一块贴同款渐变的不受光板子
  const addBackground = root => {
    const bg = scene.background;
    const mat = new THREE.MeshBasicMaterial({ name: 'background', map: bg.isTexture ? bg : null, color: bg.isColor ? bg : 0xffffff });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), mat);
    m.name = 'background';
    m.position.set(0, -0.2, -1.2);
    root.add(m);
  };
  // 横屏 16:9 相机 + 竖屏 9:16 相机（视角放宽并沿视线拉远，和录竖屏视频一致）
  const CAMS = [['cam_16x9', 35, 16 / 9], ['cam_9x16', DRAIN.PORTRAIT.fov, 9 / 16]];
  const placeCam = (c, P, Tg) => {
    c.position.copy(P);
    if (c.aspect < 1) DRAIN.PORTRAIT.cam(c.position, Tg, c.aspect);
    c.lookAt(Tg);
  };
  // 材质名去重（OBJ/FBX 按名字认材质）
  const dedupe = root => {
    const mats = new Set(), seen = {};
    root.traverse(o => { if (o.material) mats.add(o.material); });
    mats.forEach(mt => { seen[mt.name] = (seen[mt.name] || 0) + 1; if (seen[mt.name] > 1) mt.name += '_' + seen[mt.name]; });
  };
  const b64 = buf => {
    let bin = ''; const u8 = new Uint8Array(buf);
    for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(bin);
  };
`;

/* ---------- 定格模式 ---------- */
const SNAPSHOT = /* js */`(async (T, scale) => {
  ${HELPERS}
  DRAIN.frame(T);                                         // 摆到 T
  scene.updateMatrixWorld(true);
  const root = new THREE.Group(); root.name = 'HYPER_CLEAN_scene';
  const counts = {};
  const put = (o, geo, mat, name) => {
    if (!geo) return;
    counts[name] = (counts[name] || 0) + 1;
    const m = new THREE.Mesh(geo, mat);
    m.name = name + '_' + counts[name];
    o.matrixWorld.decompose(m.position, m.quaternion, m.scale);
    root.add(m);
  };
  MODEL.traverse(o => {
    if (!o.isMesh || !shown(o)) return;
    const b = bake(o.material); if (!b || faded(b.mat)) return;
    const name = o.name || b.name;
    if (b.kind === 'grime') {
      const clean = o.material.uniforms.uClean.value;
      grimeTris(o, o.material.uniforms.uDirt.value).forEach((tris, i) => put(o, geoOf(o.geometry, tris.filter(x => x.u >= clean)), GRIME_M[i], name));
    } else if (b.kind === 'foam' || b.kind === 'water') {
      const [tail, head] = rangeNow(o.material);
      put(o, geoOf(o.geometry, trisOf(o.geometry).filter(x => x.u <= head && x.u >= tail)), b.mat, name);
    } else put(o, geoOf(o.geometry, trisOf(o.geometry)), b.mat, name);
  });
  addBackground(root);
  dedupe(root);
  const v = DRAIN.VIEWS.full, Tg = new THREE.Vector3(...v.t);
  for (const [name, fov, aspect] of CAMS) {
    const c = new THREE.PerspectiveCamera(fov, aspect, 0.01, 50); c.name = name;
    placeCam(c, new THREE.Vector3(...v.p), Tg); root.add(c);
  }
  root.scale.setScalar(scale);
  const buf = await new GLTFExporter().parseAsync(root, { binary: true, maxTextureSize: 4096 });
  return { glb: b64(buf), meshes: root.children.length - CAMS.length, counts };
})`;

/* ---------- 动画模式 ---------- */
const ANIMATE = /* js */`(async FPS => {
  ${HELPERS}
  const { evaluate, camAt, TL, MORPH } = DRAIN;
  const N = Math.round(TL.end * FPS) + 1;
  const times = Float32Array.from({ length: N }, (_, i) => i / FPS);
  const MORPH_EVERY = 8;                                  // 形态键采样间隔（帧）

  /* 1. 逐帧采样：可见性 / 世界矩阵 / 颜色 / 进度 uniform；变形网格另存形状 */
  const recs = [];
  MODEL.traverse(o => {
    if (!o.isMesh) return;
    const b = bake(o.material); if (!b) return;
    recs.push({ o, b, morph: MORPH.includes(o), vis: new Uint8Array(N), mat: new Float32Array(N * 16),
                col: new Uint32Array(N), r0: new Float32Array(N), r1: new Float32Array(N), shapes: [] });
  });
  const P = new THREE.Vector3(), Tg = new THREE.Vector3();
  const camPath = [];
  for (let i = 0; i < N; i++) {
    const T = times[i];
    evaluate(T, T);
    camAt(T, P, Tg); camPath.push([P.clone(), Tg.clone()]);
    scene.updateMatrixWorld(true);
    for (const r of recs) {
      const o = r.o, m = o.material;
      r.vis[i] = shown(o) && !faded(m) ? 1 : 0;
      r.mat.set(o.matrixWorld.elements, i * 16);
      if (m.color) r.col[i] = m.color.getHex();
      if (m.isShaderMaterial && (r.b.kind === 'foam' || r.b.kind === 'water' || r.b.kind === 'grime')) [r.r0[i], r.r1[i]] = rangeNow(m);
      if (r.morph && r.vis[i] && (i % MORPH_EVERY === 0 || i === N - 1)) {
        const g = o.geometry;
        r.shapes.push({ i, pos: g.attributes.position.array.slice(), nrm: g.attributes.normal.array.slice() });
      }
    }
  }

  /* 2. 关键帧工具 */
  const tracks = [], used = {};
  const uname = n => { used[n] = (used[n] || 0) + 1; return n + '_' + used[n]; };
  const HIDE = 1e-5;
  // 去掉和前后都相同的帧；整条不变就不要这条轨道
  const addTrack = (Type, name, vals, stride) => {
    const same = (a, b) => { for (let k = 0; k < stride; k++) if (Math.abs(vals[a * stride + k] - vals[b * stride + k]) > 1e-6) return false; return true; };
    const keep = [];
    for (let i = 0; i < N; i++) if (i === 0 || i === N - 1 || !same(i, i - 1) || !same(i, i + 1)) keep.push(i);
    if (keep.length === 2 && same(0, N - 1)) return;
    const t = new Float32Array(keep.length), v = new Float32Array(keep.length * stride);
    keep.forEach((i, j) => { t[j] = times[i]; for (let k = 0; k < stride; k++) v[j * stride + k] = vals[i * stride + k]; });
    tracks.push(new Type(name, t, v));
  };
  const M4 = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
  // 节点跟着采样到的世界矩阵走；vis[i] = 0 的帧缩放到 0
  const animTRS = (node, r, vis) => {
    const pos = new Float32Array(N * 3), rot = new Float32Array(N * 4), scl = new Float32Array(N * 3);
    let prev = null;
    for (let i = 0; i < N; i++) {
      M4.fromArray(r.mat, i * 16).decompose(_p, _q, _s);
      if (prev && prev.dot(_q) < 0) _q.set(-_q.x, -_q.y, -_q.z, -_q.w);          // 四元数保持连续，避免插值绕远路
      prev = _q.clone();
      if (!vis[i]) _s.setScalar(HIDE);
      _p.toArray(pos, i * 3); _q.toArray(rot, i * 4); _s.toArray(scl, i * 3);
    }
    node.position.fromArray(pos); node.quaternion.fromArray(rot); node.scale.fromArray(scl);
    addTrack(THREE.VectorKeyframeTrack, node.name + '.position', pos, 3);
    addTrack(THREE.QuaternionKeyframeTrack, node.name + '.quaternion', rot, 4);
    addTrack(THREE.VectorKeyframeTrack, node.name + '.scale', scl, 3);
  };

  /* 3. 生成导出节点 */
  const root = new THREE.Group(); root.name = 'HYPER_CLEAN_anim';
  const stats = { moving: 0, chunks: 0, morph: 0 };
  const varies = a => a.some(x => x !== a[0]);
  for (const r of recs) {
    if (!r.vis.some(Boolean)) continue;                                            // 整段都看不见
    const o = r.o, base = o.name || r.b.name;
    const trimmed = r.b.kind === 'grime' || ((r.b.kind === 'foam' || r.b.kind === 'water') && (varies(r.r0) || varies(r.r1) || r.r0[0] > 0 || r.r1[0] < 1));

    if (r.morph) {                                        // 形态键：相邻两个采样形状之间线性过渡
      const S = r.shapes, g = o.geometry.clone();
      g.setAttribute('position', new THREE.BufferAttribute(S[0].pos.slice(), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(S[0].nrm.slice(), 3));
      g.morphAttributes.position = S.map(s => new THREE.BufferAttribute(s.pos, 3));
      g.morphAttributes.normal = S.map(s => new THREE.BufferAttribute(s.nrm, 3));
      g.morphTargetsRelative = false;
      const m = new THREE.Mesh(g, r.b.mat); m.name = uname(base + '_morph');
      m.updateMorphTargets();
      root.add(m);
      animTRS(m, r, r.vis);
      const w = new Float32Array(N * S.length);
      for (let i = 0; i < N; i++) {
        let k = 0;
        while (k < S.length - 1 && S[k + 1].i <= i) k++;
        if (i <= S[0].i) w[i * S.length] = 1;
        else if (k === S.length - 1) w[i * S.length + k] = 1;
        else { const a = (i - S[k].i) / (S[k + 1].i - S[k].i); w[i * S.length + k] = 1 - a; w[i * S.length + k + 1] = a; }
      }
      tracks.push(new THREE.NumberKeyframeTrack(m.name + '.morphTargetInfluences', times, w));
      stats.morph++;
    } else if (trimmed) {                                 // 沿管子切段，按进度逐段显示
      const group = new THREE.Group(); group.name = uname(base + '_segments');
      M4.fromArray(r.mat, 0).decompose(group.position, group.quaternion, group.scale);
      root.add(group);
      const segs = o.geometry.parameters?.tubularSegments || 160;
      const K = Math.max(8, Math.round(segs / 4));
      const sets = r.b.kind === 'grime' ? grimeTris(o, 1).map((tris, i) => [tris, GRIME_M[i]]) : [[trisOf(o.geometry), r.b.mat]];
      for (const [tris, mat] of sets) {
        let lo = Infinity, hi = -Infinity;
        for (const x of tris) { lo = Math.min(lo, x.u); hi = Math.max(hi, x.u); }
        const bins = Array.from({ length: K }, () => []);
        for (const x of tris) bins[Math.min(K - 1, Math.floor((x.u - lo) / (hi - lo + 1e-9) * K))].push(x);
        bins.forEach((bin, j) => {
          if (!bin.length) return;
          const uc = lo + (j + 0.5) / K * (hi - lo);
          const scl = new Float32Array(N * 3);
          let any = false;
          for (let i = 0; i < N; i++) {
            const on = r.vis[i] && uc >= r.r0[i] && uc <= r.r1[i];
            any ||= on;
            scl.fill(on ? 1 : HIDE, i * 3, i * 3 + 3);
          }
          if (!any) return;
          const m = new THREE.Mesh(geoOf(o.geometry, bin), mat);
          m.name = uname(base + '_seg');
          m.scale.fromArray(scl);
          group.add(m);
          addTrack(THREE.VectorKeyframeTrack, m.name + '.scale', scl, 3);
          stats.chunks++;
        });
      }
    } else {                                              // 整体移动；颜色会变的（箭头粉→蓝）按颜色拆成几份
      const cols = [...new Set([...r.col].filter((c, i) => r.vis[i]))];
      const variants = cols.length > 1 && !o.material.isShaderMaterial ? cols : [null];
      for (const c of variants) {
        const mat = c === null ? r.b.mat : Object.assign(r.b.mat.clone(), { name: r.b.mat.name + '_' + c.toString(16).padStart(6, '0') });
        if (c !== null) { mat.color.setHex(c); if (mat.emissive) mat.emissive.copy(mat.color).multiplyScalar(0.35); mat.opacity = 1; mat.transparent = false; }
        const m = new THREE.Mesh(geoOf(o.geometry, trisOf(o.geometry)), mat);
        m.name = uname(base);
        root.add(m);
        animTRS(m, r, c === null ? r.vis : r.vis.map((v, i) => v && r.col[i] === c ? 1 : 0));
        stats.moving++;
      }
    }
  }
  addBackground(root);
  dedupe(root);

  /* 4. 相机跟网页自动运镜 */
  for (const [name, fov, aspect] of CAMS) {
    const c = new THREE.PerspectiveCamera(fov, aspect, 0.01, 50); c.name = name;
    const pos = new Float32Array(N * 3), rot = new Float32Array(N * 4);
    let prev = null;
    camPath.forEach(([p, t], i) => {
      placeCam(c, p.clone(), t);
      if (prev && prev.dot(c.quaternion) < 0) c.quaternion.set(-c.quaternion.x, -c.quaternion.y, -c.quaternion.z, -c.quaternion.w);
      prev = c.quaternion.clone();
      c.position.toArray(pos, i * 3); c.quaternion.toArray(rot, i * 4);
    });
    c.position.fromArray(pos); c.quaternion.fromArray(rot);
    root.add(c);
    addTrack(THREE.VectorKeyframeTrack, name + '.position', pos, 3);
    addTrack(THREE.QuaternionKeyframeTrack, name + '.quaternion', rot, 4);
  }

  const clip = new THREE.AnimationClip('HYPER_CLEAN', TL.end, tracks);
  const buf = await new GLTFExporter().parseAsync(root, { binary: true, maxTextureSize: 4096, animations: [clip] });
  return { glb: b64(buf), frames: N, tracks: tracks.length, ...stats };
})`;

if (ANIM) {
  const r = await evaluate(`${ANIMATE}(${FPS})`);
  ws.close(); chrome.kill();
  writeFileSync(join(OUT, `${NAME}.glb`), Buffer.from(r.glb, 'base64'));
  console.log(`动画 GLB：${r.frames} 帧（${FPS}fps），${r.tracks} 条轨道；移动物体 ${r.moving}、管内分段 ${r.chunks}、形态键网格 ${r.morph}`);
  console.log('完成：', join(OUT, `${NAME}.glb`));
  process.exit(0);
}

const r = await evaluate(`${SNAPSHOT}(${+T}, 1)`);
writeFileSync(join(OUT, `${NAME}.glb`), Buffer.from(r.glb, 'base64'));
console.log(`GLB：${r.meshes} 个网格`, r.counts);

// FBX / OBJ：导一份厘米单位的 GLB，拆成 glTF + 独立贴图 PNG（贴图按文件名引用，不内嵌），再交给 assimp 转
const glb = Buffer.from((await evaluate(`${SNAPSHOT}(${+T}, 100)`)).glb, 'base64');
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
