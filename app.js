/* ============================================================
   HYPER CLEAN 管道疏通泡沫 · 三维原理演示
   罐子按视频实拍比例程序化建模；台盆 + 透明存水弯剖面参照电商原理图。
   单位：米。可调尺寸集中在 DIM，动画时间轴集中在 TL。
   整个场景是时间 T 的纯函数（evaluate），所以能随意拖进度条。
   ============================================================ */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ---------- 尺寸表 ---------- */
export const DIM = {
  basin:   { R: 0.20, D: 0.13, t: 0.012, sx: 1.35, drain: 0.021 },   // 椭圆台盆：长轴 = R × sx
  counter: { w: 1.30, d: 0.44, t: 0.03 },
  pipe:    { r: 0.022, rIn: 0.0185, top: -0.20 },                  // 透明下水管（40mm 管）
  home:    [-0.46, 0, -0.17],                                      // 罐子平时站在台面左侧
};
/* P 形存水弯：U 弯圆心高度 yU、半径 R，上升到 yE 后 90° 转弯（半径 rE）水平穿进后墙（zEnd） */
const TRAP = { R: 0.075, x: 0.15, yU: -0.36, yE: -0.27, rE: 0.06, zEnd: -0.36 };
TRAP.yOut = TRAP.yE + TRAP.rE;

/* 罐子：产品图里罐身直径 459px = 6.5cm，罐高 1533px ≈ 21.7cm（官方标 22cm） */
const CANPX = 0.065 / 459;
const CAN_ROWS = { top: 557, bot: 2090, cap: 739.5 };       // 罐顶 / 罐底 / 瓶盖与瓶颈分界所在的行
const CAN_PROFILE = [[557, 94.5], [561, 151.5], [567, 184.5], [572, 188.5], [603, 188.5], [610, 224.5], [612, 227.5], [617, 228.5], [623, 233.5], [626, 233.5], [633, 228.5], [642, 229.5], [646, 227.5], [739, 152.5], [740, 116.5], [742, 105.5], [773, 105.5], [777, 151.5], [897, 229.5], [2033, 229.5], [2038, 227.5], [2056, 229.5], [2065, 223.5], [2069, 215.5], [2077, 183.5], [2086, 109.5], [2090, 39.5]];
const CAN_H = (CAN_ROWS.bot - CAN_ROWS.top) * CANPX;
const PINK = 0xf27fab;            // 罐肩 / 瓶盖的粉（贴图加载前的底色）

/* ---------- 动画时间轴（秒） ---------- */
export const TL = {
  twist: [0, 1.2], lift: [1.2, 1.6], shake: [1.5, 2.6], move: [2.6, 4.0], press: [4.0, 4.6],
  basin: [4.6, 6.8], foam: [5.2, 10.5], chan: [5.1, 5.9], over: [5.8, 7.6],
  back: [10.5, 12.0], unTwist: [12.0, 12.5], soak: [12.1, 13.9],
  stream: [14.0, 17.0], basinOut: [14.3, 16.1], water: [14.5, 17.3], waterTail: [16.3, 18.7],
  shine: [18.0, 19.5], end: 19.7,
};
const STEPS = [
  [0,    '① 扭到 OPEN 档'],
  [1.2,  '② 摇匀 10 次'],
  [2.6,  '③ 倒扣，按住下水口'],
  [4.6,  '④ 泡沫灌满存水弯，顺溢水通道从侧面小口冒出'],
  [10.5, '⑤ 静置 30 分钟，分解油污 · 杀菌'],
  [14.0, '⑥ 打开水龙头冲净'],
  [18.0, '✨ 管道通畅 · 洁净无味'],
];

/* ---------- 小工具 ---------- */
const V3 = THREE.Vector3;
const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
const seg = (t, [a, b]) => clamp01((t - a) / (b - a));
const sstep = x => x * x * (3 - 2 * x);
const ease = x => x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
const lerp = (a, b, k) => a + (b - a) * k;
let _seed = 20261016;
const rnd = () => (_seed = (_seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const rand = (a, b) => a + (b - a) * rnd();

function cvs(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function texOf(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/* ---------- 渲染器 / 场景 / 相机 ---------- */
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

function bgTex(inner, outer) {
  return cvs(512, 512, (g, w, h) => {
    const gr = g.createRadialGradient(w * 0.45, h * 0.35, 10, w / 2, h / 2, w * 0.78);
    gr.addColorStop(0, inner); gr.addColorStop(1, outer);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}
const BG = { light: bgTex('#f6fcff', '#94c8ec'), dark: bgTex('#2b2b33', '#0f0f12') };
scene.background = BG.light;

scene.add(new THREE.HemisphereLight(0xffffff, 0xb9d3e8, 0.9));
const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(-1, 2, 1.6); scene.add(key);
const fill = new THREE.DirectionalLight(0xe2f0ff, 0.5); fill.position.set(1.3, 0.2, 1.0); scene.add(fill);

const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.01, 50);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.12;
controls.maxDistance = 4;

const MODEL = new THREE.Group();
scene.add(MODEL);

/* ---------- 材质 ---------- */
const M = {
  chrome:  new THREE.MeshStandardMaterial({ color: 0xe8eaee, metalness: 1, roughness: 0.14 }),
  brass:   new THREE.MeshStandardMaterial({ color: 0xd8b679, metalness: 1, roughness: 0.25 }),
  ceramic: new THREE.MeshPhysicalMaterial({ color: 0xfbfbfb, roughness: 0.18, clearcoat: 0.7, clearcoatRoughness: 0.2, side: THREE.DoubleSide }),
  cut:     new THREE.MeshStandardMaterial({ color: 0xc4c8cf, roughness: 0.7, side: THREE.DoubleSide }),
};

/* ---------- 共享 shader 片段 ---------- */
const VS_COMMON = /* glsl */`
  varying vec2 vUv; varying vec3 vW; varying vec3 vN;
  void main(){
    vec4 p = vec4(position, 1.0);
    vec3 n = normal;
    #ifdef USE_INSTANCING
      p = instanceMatrix * p;
      n = mat3(instanceMatrix) * n;
    #endif
    vec4 w = modelMatrix * p;
    vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * n);
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const GLSL_NOISE = /* glsl */`
  vec3 hash3(vec3 p){
    p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
    return fract(sin(p) * 43758.5453);
  }
  vec2 worley(vec3 p){                 // x = 到最近泡泡中心距离, y = 泡泡壁距离
    vec3 i = floor(p), f = fract(p);
    float d1 = 9.0, d2 = 9.0;
    for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
      vec3 o = vec3(x, y, z);
      vec3 r = o + hash3(i + o) - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    return vec2(sqrt(d1), sqrt(d2) - sqrt(d1));
  }
  float vnoise(vec3 p){
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    float a = hash3(i).x, b = hash3(i + vec3(1,0,0)).x, c = hash3(i + vec3(0,1,0)).x, d = hash3(i + vec3(1,1,0)).x;
    float e = hash3(i + vec3(0,0,1)).x, f1 = hash3(i + vec3(1,0,1)).x, g = hash3(i + vec3(0,1,1)).x, h = hash3(i + vec3(1,1,1)).x;
    return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, f1, f.x), mix(g, h, f.x), f.y), f.z);
  }`;
const uTime = { value: 0 };

/* 泡沫：视频里那种浓稠顺滑的粉色慕斯（奶油质感 + 极细微孔），uv.x 超出 [uTail, uHead] 的部分裁掉 = 泡沫前沿
   speck > 0 时带出褐色脏点（溢水口挤出来的泡沫）；alpha < 1 = 透视画法 */
function foamMat(head = 9, tail = -9, speck = 0, alpha = 1) {
  return new THREE.ShaderMaterial({
    transparent: alpha < 1,
    uniforms: {
      uTime, uHead: { value: head }, uTail: { value: tail }, uSpeck: { value: speck }, uAlpha: { value: alpha },
      uA: { value: new THREE.Color('#fcdbe6') }, uB: { value: new THREE.Color('#df86a6') },
    },
    vertexShader: VS_COMMON,
    fragmentShader: GLSL_NOISE + /* glsl */`
      uniform float uHead, uTail, uTime, uSpeck, uAlpha; uniform vec3 uA, uB;
      varying vec2 vUv; varying vec3 vW; varying vec3 vN;
      void main(){
        if (vUv.x > uHead || vUv.x < uTail) discard;
        vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
        if (!gl_FrontFacing) N = -N;
        // 细腻微孔：高频噪声轻推法线
        vec3 q = vW * 700.0;
        float n0 = vnoise(q);
        vec3 g = vec3(vnoise(q + vec3(0.35, 0.0, 0.0)), vnoise(q + vec3(0.0, 0.35, 0.0)), vnoise(q + vec3(0.0, 0.0, 0.35))) - n0;
        N = normalize(N - g * 0.5);
        vec3 L = normalize(vec3(-0.4, 0.9, 0.5));
        float wrap = clamp((dot(N, L) + 0.45) / 1.45, 0.0, 1.0);
        vec3 col = mix(uB, uA, smoothstep(0.05, 0.95, wrap));   // 暗部偏深粉，像奶油的次表面透光
        col *= 0.72 + 0.32 * wrap + 0.06 * (vnoise(vW * 55.0) - 0.5);
        col += pow(max(dot(N, normalize(L + V)), 0.0), 28.0) * 0.20;
        col += pow(1.0 - abs(dot(N, V)), 3.0) * 0.16;
        float sk = smoothstep(0.83, 0.88, vnoise(vW * 480.0)) * smoothstep(0.50, 0.72, vnoise(vW * 60.0 + 3.0));
        col = mix(col, vec3(0.33, 0.25, 0.18), sk * uSpeck);
        gl_FragColor = vec4(col, uAlpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

/* 玻璃：边缘亮、中间透（电商原理图那种干净的玻璃管），uSweep = 冲净后的扫光 */
function glassMat(op = 1) {
  return new THREE.ShaderMaterial({
    uniforms: { uSweep: { value: -9 }, uOp: { value: op }, uTint: { value: new THREE.Color('#cfe9ff') } },
    vertexShader: VS_COMMON,
    fragmentShader: /* glsl */`
      uniform float uSweep, uOp; uniform vec3 uTint;
      varying vec2 vUv; varying vec3 vW; varying vec3 vN;
      void main(){
        vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
        if (!gl_FrontFacing) N = -N;
        float f = pow(1.0 - abs(dot(N, V)), 2.2);
        float spec = pow(max(dot(reflect(-V, N), normalize(vec3(-0.3, 0.8, 0.6))), 0.0), 40.0);
        float band = exp(-pow((vUv.x - uSweep) * 22.0, 2.0));
        float a = (0.05 + 0.55 * f + spec * 0.8 + band * 0.45) * uOp;
        vec3 col = mix(uTint, vec3(1.0), 0.45 + 0.55 * f) + spec + band * 0.6;
        gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
}

/* 清水：淡蓝半透明 + 流动水纹 */
function waterMat(stream = false) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime, uHead: { value: 9 }, uTail: { value: -9 } },
    defines: stream ? { STREAM: 1 } : {},
    vertexShader: VS_COMMON,
    fragmentShader: /* glsl */`
      uniform float uHead, uTail, uTime;
      varying vec2 vUv; varying vec3 vW; varying vec3 vN;
      void main(){
        #ifdef STREAM
          float s = 0.5 + 0.5 * sin(vW.y * 320.0 + uTime * 40.0 + sin(vUv.x * 18.85) * 1.5);
        #else
          if (vUv.x > uHead || vUv.x < uTail) discard;
          float s = 0.5 + 0.5 * sin(vUv.x * 260.0 - uTime * 28.0 + sin(vUv.y * 18.85) * 2.0);
        #endif
        vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
        float f = pow(1.0 - abs(dot(N, V)), 2.0);
        vec3 col = mix(vec3(0.50, 0.78, 1.0), vec3(0.92, 0.98, 1.0), s * 0.7) + f * 0.3;
        gl_FragColor = vec4(col, 0.5 + 0.35 * f);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false,
  });
}

/* 管壁上的褐色污垢膜：浸泡时变淡，清水冲过的地方消失 */
function grimeMat() {
  return new THREE.ShaderMaterial({
    uniforms: { uClean: { value: -1 }, uDirt: { value: 1 } },
    vertexShader: VS_COMMON,
    fragmentShader: GLSL_NOISE + /* glsl */`
      uniform float uClean, uDirt;
      varying vec2 vUv; varying vec3 vW; varying vec3 vN;
      void main(){
        if (vUv.x < uClean) discard;
        float n = vnoise(vW * 70.0) * 0.6 + vnoise(vW * 190.0) * 0.4;
        float m = smoothstep(0.42, 0.72, n) * smoothstep(0.10, 0.22, vUv.x) * smoothstep(0.82, 0.68, vUv.x);
        float a = m * 0.8 * uDirt;
        if (a < 0.01) discard;
        vec3 col = mix(vec3(0.30, 0.19, 0.10), vec3(0.55, 0.40, 0.24), vnoise(vW * 400.0));
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
}

/* ============================================================
   台面 + 剖开的椭圆台盆
   ============================================================ */
const B = DIM.basin;
function yIn(r)  { const k = clamp01(r / B.R);         return -B.D * Math.pow(1 - Math.pow(k, 2.5), 0.55); }
function yOut(r) { const k = clamp01(r / (B.R + B.t)); return -(B.D + B.t) * Math.pow(1 - Math.pow(k, 2.5), 0.55); }
const DRAIN_Y = yIn(B.drain);

function marbleTex() {
  const t = cvs(1024, 1024, (g, w, h) => {
    g.fillStyle = '#f7f7f5'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) {
      g.strokeStyle = `rgba(150,150,160,${0.08 + rnd() * 0.12})`;
      g.lineWidth = 1 + rnd() * 3;
      g.beginPath(); g.moveTo(rnd() * w, 0);
      g.bezierCurveTo(rnd() * w, h * 0.3, rnd() * w, h * 0.7, rnd() * w, h);
      g.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

{
  const { w, d, t } = DIM.counter;
  const rx = B.R * B.sx, rz = B.R;
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(-rx, 0);
  for (let i = 1; i <= 64; i++) { const a = Math.PI + Math.PI * i / 64; s.lineTo(rx * Math.cos(a), rz * Math.sin(a)); }
  s.lineTo(w / 2, 0); s.lineTo(w / 2, -d); s.lineTo(-w / 2, -d); s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false });
  geo.rotateX(Math.PI / 2);            // 形状 y → 世界 z（向后为负），挤出方向 → 向下
  const mat = new THREE.MeshPhysicalMaterial({ map: marbleTex(), roughness: 0.25, clearcoat: 0.4 });
  MODEL.add(new THREE.Mesh(geo, mat));

  // 台盆：闭合截面（内壁 → 盆沿 → 外壁 → 下水口）车削半圈，只留后半边
  const prof = [], N = 44;
  for (let i = 0; i <= N; i++) { const r = B.drain + (B.R - B.drain) * Math.sin(i / N * Math.PI / 2); prof.push(new THREE.Vector2(r, yIn(r))); }
  for (let i = N; i >= 0; i--) { const r = B.drain + (B.R + B.t - B.drain) * Math.sin(i / N * Math.PI / 2); prof.push(new THREE.Vector2(r, yOut(r))); }
  prof.push(prof[0].clone());
  const bowl = new THREE.LatheGeometry(prof, 120, Math.PI / 2, Math.PI);
  bowl.scale(B.sx, 1, 1);
  bowl.computeVertexNormals();
  MODEL.add(new THREE.Mesh(bowl, M.ceramic));
  // 两个剖切面（灰色截面，和原理图一样）
  for (const sgn of [1, -1]) {
    const sh = new THREE.Shape(prof.map(p => new THREE.Vector2(sgn * p.x * B.sx, p.y)));
    MODEL.add(new THREE.Mesh(new THREE.ShapeGeometry(sh), M.cut));
  }
  // 台面剖切面也上一道灰
  const cutFace = new THREE.Mesh(new THREE.PlaneGeometry(w / 2 - rx, t), M.cut);
  for (const sgn of [1, -1]) {
    const m = cutFace.clone();
    m.position.set(sgn * (rx + (w / 2 - rx) / 2), -t / 2, 0.0005);
    MODEL.add(m);
  }

  // 下水口不锈钢圈（后半圈）
  const ring = new THREE.Mesh(new THREE.RingGeometry(B.drain - 0.002, B.drain + 0.012, 48, 1, 0, Math.PI), M.chrome);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = DRAIN_Y + 0.0015;
  MODEL.add(ring);
  const lip = new THREE.Mesh(new THREE.CylinderGeometry(B.drain, B.drain, 0.014, 40, 1, true, Math.PI / 2, Math.PI), M.chrome);
  lip.position.y = DRAIN_Y - 0.006;
  MODEL.add(lip);

  // 水龙头
  const fz = -0.30;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.05, 40), M.chrome);
  base.position.set(0, 0.025, fz); MODEL.add(base);
  const riser = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.13, 32), M.chrome);
  riser.position.set(0, 0.11, fz); MODEL.add(riser);
  const spoutCurve = new THREE.CatmullRomCurve3([
    new V3(0, 0.165, fz), new V3(0, 0.195, fz + 0.04), new V3(0, 0.19, fz + 0.12), new V3(0, 0.162, fz + 0.17),
  ]);
  MODEL.add(new THREE.Mesh(new THREE.TubeGeometry(spoutCurve, 48, 0.011, 20), M.chrome));
  const tipCap = new THREE.Mesh(new THREE.SphereGeometry(0.0112, 20, 12), M.chrome);
  tipCap.position.set(0, 0.165, fz); MODEL.add(tipCap);
  const aer = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.012, 24), M.chrome);
  aer.position.set(0, 0.158, fz + 0.17); MODEL.add(aer);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.07, 12), M.chrome);
  handle.position.set(0, 0.2, fz - 0.02); handle.rotation.x = -0.7; MODEL.add(handle);
}
const SPOUT_TIP = new V3(0, 0.152, -0.13);

/* ============================================================
   下水管：透明尾管 + P 形存水弯（U 弯后上升、转 90° 穿进后墙）
   ============================================================ */
function pipeCurve(y0) {
  const P = [];
  const add = (x, y, z = 0) => { const l = P[P.length - 1]; if (!l || l.distanceTo(_tmp.set(x, y, z)) > 1e-4) P.push(new V3(x, y, z)); };
  const line = (a, b) => {
    const n = Math.max(2, Math.ceil(a.distanceTo(b) / 0.01));
    for (let i = 0; i <= n; i++) add(lerp(a.x, b.x, i / n), lerp(a.y, b.y, i / n), lerp(a.z, b.z, i / n));
  };
  const { x, R, yU, yE, rE } = TRAP;
  line(new V3(0, y0, 0), new V3(0, yU, 0));
  for (let i = 0; i <= 24; i++) { const a = lerp(Math.PI, 2 * Math.PI, i / 24); add(R + R * Math.cos(a), yU + R * Math.sin(a)); }   // U 弯（存水）
  line(new V3(x, yU, 0), new V3(x, yE, 0));
  for (let i = 0; i <= 16; i++) { const a = i / 16 * Math.PI / 2; add(x, yE + rE * Math.sin(a), -rE + rE * Math.cos(a)); }   // 90° 弯头朝后
  line(new V3(x, yE + rE, -rE), new V3(x, yE + rE, TRAP.zEnd));
  return new THREE.CatmullRomCurve3(P, false, 'centripetal');
}
const _tmp = new V3();
const FLOW  = pipeCurve(DRAIN_Y + 0.004);   // 泡沫/清水走的路线：从下水口一直到墙里
const GLASS = pipeCurve(DIM.pipe.top);
const FLOW_L = FLOW.getLength();
const uAtY = y => (DRAIN_Y + 0.004 - y) / FLOW_L;                 // 左侧竖管上某高度对应的进度
const L_U = DRAIN_Y + 0.004 - TRAP.yU;                            // 下水口到 U 弯起点的长度
const U_BOTTOM = (L_U + TRAP.R * Math.PI / 2) / FLOW_L;          // U 弯最低点

const _p = new V3(), _t = new V3(), _n = new V3(), _b = new V3(), Z = new V3(0, 0, 1);
/* 管内某进度 u、绕管角 a、离轴 r 的位置（a = π/2 朝镜头） */
function inPipe(u, a, r, out) {
  FLOW.getPointAt(clamp01(u), _p);
  FLOW.getTangentAt(clamp01(u), _t);
  _n.crossVectors(Z, _t);
  if (_n.lengthSq() < 0.01) _n.set(-1, 0, 0); else _n.normalize();
  _b.crossVectors(_t, _n);
  return out.copy(_p).addScaledVector(_n, Math.cos(a) * r).addScaledVector(_b, Math.sin(a) * r);
}

{
  const P = DIM.pipe;
  // 镀铬尾管 + 黄铜锁母
  const tailLen = DRAIN_Y - B.t - P.top + 0.006;
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, tailLen, 40), M.chrome);
  tail.position.y = P.top + tailLen / 2 - 0.004;
  MODEL.add(tail);
  const nutTop = new THREE.Mesh(new THREE.CylinderGeometry(0.029, 0.029, 0.012, 40), M.chrome);
  nutTop.position.y = DRAIN_Y - B.t - 0.008;
  MODEL.add(nutTop);
  const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.018, 6), M.brass);
  nut.position.y = P.top + 0.002;
  MODEL.add(nut);
  const outNut = nut.clone();
  outNut.position.set(0.30, P.bottom + 0.012, 0);
  MODEL.add(outNut);
  // 横管穿墙处的装饰圈
  const esc = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.008, 40), M.chrome);
  esc.rotation.x = Math.PI / 2;
  esc.position.set(TRAP.x, TRAP.yOut, TRAP.zEnd);
  MODEL.add(esc);
}

// 透明管（最后渲染）
const glassM = glassMat();
const glassTube = new THREE.Mesh(new THREE.TubeGeometry(GLASS, 420, DIM.pipe.r, 32), glassM);
glassTube.renderOrder = 10;
MODEL.add(glassTube);

// 管壁污垢膜
const grimeM = grimeMat();
const grimeTube = new THREE.Mesh(new THREE.TubeGeometry(FLOW, 500, DIM.pipe.r - 0.0012, 28), grimeM);
grimeTube.renderOrder = 8;
MODEL.add(grimeTube);

// 管内泡沫柱 + 前沿圆头
const foamTubeM = foamMat(0, 0);
const foamTube = new THREE.Mesh(new THREE.TubeGeometry(FLOW, 500, DIM.pipe.rIn, 24), foamTubeM);
MODEL.add(foamTube);
const foamHead = new THREE.Mesh(new THREE.SphereGeometry(DIM.pipe.rIn, 24, 16), foamMat());
MODEL.add(foamHead);

// 管内清水
const waterTubeM = waterMat();
const waterTube = new THREE.Mesh(new THREE.TubeGeometry(FLOW, 500, DIM.pipe.rIn * 0.98, 24), waterTubeM);
waterTube.renderOrder = 9;
MODEL.add(waterTube);

// 水龙头水柱
const STREAM_LEN = SPOUT_TIP.y - yIn(Math.abs(SPOUT_TIP.z));
const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0055, 1, 16, 1, true), waterMat(true));
stream.renderOrder = 9;
MODEL.add(stream);

/* ============================================================
   罐子：轮廓和贴图都取自产品正面图（tools/make_can.py 生成 can.png + CAN_PROFILE）
   枢轴在罐子中心，翻转时绕中心转
   ============================================================ */
const CAN = new THREE.Group();
const CANBODY = new THREE.Group();
CANBODY.position.y = -CAN_H / 2;
CAN.add(CANBODY);
MODEL.add(CAN);
const CAPG = new THREE.Group();
{
  const canM = new THREE.MeshPhysicalMaterial({ color: PINK, roughness: 0.38, clearcoat: 0.55, clearcoatRoughness: 0.22 });
  new THREE.TextureLoader().load('can.png?v=20261019b', t => {
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    canM.map = t; canM.color.set(0xffffff); canM.needsUpdate = true;
  });
  // pts：[照片行号, 半径px]，从下往上；row0 = 该部件局部原点所在行
  const lathe = (pts, row0) => {
    const geo = new THREE.LatheGeometry(pts.map(([row, r]) => new THREE.Vector2(r * CANPX, (row0 - row) * CANPX)), 160, -Math.PI, Math.PI * 2);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, (CAN_ROWS.bot - pts[i % pts.length][0]) / (CAN_ROWS.bot - CAN_ROWS.top));
    return new THREE.Mesh(geo, canM);
  };
  const desc = [...CAN_PROFILE].reverse();                       // 从罐底往上
  const body = [[CAN_ROWS.bot, 0], ...desc.filter(([row]) => row > CAN_ROWS.cap + 1), [CAN_ROWS.cap + 1, 105.5], [CAN_ROWS.cap + 1, 0]];
  const cap = [[CAN_ROWS.cap + 1, 100], ...desc.filter(([row]) => row <= CAN_ROWS.cap + 1), [CAN_ROWS.top, 0]];
  CANBODY.add(lathe(body, CAN_ROWS.bot));
  CAPG.position.y = (CAN_ROWS.bot - CAN_ROWS.cap) * CANPX;
  CAPG.add(lathe(cap, CAN_ROWS.cap));
  CANBODY.add(CAPG);
  CAN.traverse(o => { o.renderOrder = 3; });      // 画在透视的溢水通道之后
}

// 台面上的柔和接触阴影
const shadowTex = cvs(128, 128, (g, w) => {
  const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  gr.addColorStop(0, 'rgba(40,50,70,.55)'); gr.addColorStop(0.55, 'rgba(40,50,70,.22)'); gr.addColorStop(1, 'rgba(40,50,70,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, w);
});
const canShadow = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.13),
  new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
canShadow.rotation.x = -Math.PI / 2;
canShadow.position.set(DIM.home[0], 0.0008, DIM.home[2]);
MODEL.add(canShadow);

/* ============================================================
   蛾蚋（drain fly）：毛茸茸的心形翅膀，管里和溢水口泡沫里都有
   ============================================================ */
const flyWingTex = cvs(128, 64, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w, 0);
  gr.addColorStop(0, 'rgba(62,55,50,0.97)'); gr.addColorStop(1, 'rgba(118,110,102,0.9)');
  g.fillStyle = gr;
  g.beginPath(); g.ellipse(w * 0.5, h * 0.5, w * 0.46, h * 0.40, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(35,30,26,0.55)'; g.lineWidth = 1.2;
  for (let i = 0; i < 7; i++) {
    const a = (i / 6 - 0.5) * 1.6;
    g.beginPath(); g.moveTo(w * 0.06, h * 0.5);
    g.quadraticCurveTo(w * 0.5, h * 0.5 + Math.sin(a) * h * 0.25, w * 0.5 + Math.cos(a) * w * 0.44, h * 0.5 + Math.sin(a) * h * 0.38);
    g.stroke();
  }
  g.strokeStyle = 'rgba(190,184,176,0.8)'; g.lineWidth = 1.4;          // 一圈绒毛
  for (let i = 0; i < 90; i++) {
    const a = i / 90 * Math.PI * 2, x = w * 0.5 + Math.cos(a) * w * 0.46, y = h * 0.5 + Math.sin(a) * h * 0.40;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 5, y + Math.sin(a) * 5); g.stroke();
  }
});
const FLY_M = {
  wing: new THREE.MeshStandardMaterial({ map: flyWingTex, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.9 }),
  body: new THREE.MeshStandardMaterial({ color: 0x3e3631, roughness: 0.85 }),
  leg:  new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.8 }),
};
const FLY_WING_GEO = new THREE.PlaneGeometry(1.6, 0.8).translate(0.8, 0, 0).rotateX(-Math.PI / 2);
/* 局部坐标：x 朝前、y 朝上；翅膀向后张开成心形 */
function makeFly() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), FLY_M.body);
  body.scale.set(0.55, 0.26, 0.26); g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), FLY_M.body);
  head.position.set(0.58, 0.04, 0); g.add(head);
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(FLY_WING_GEO, FLY_M.wing);
    wing.position.set(0.15, 0.2, 0);
    wing.rotation.set(s * 0.25, s * (Math.PI - 0.55), 0);
    g.add(wing);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.8, 5), FLY_M.leg);
    ant.position.set(0.85, 0.25, s * 0.18); ant.rotation.set(s * 0.5, 0, -0.9); g.add(ant);
    for (const k of [-0.25, 0.05, 0.35]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 5), FLY_M.leg);
      leg.position.set(k, -0.22, s * 0.3); leg.rotation.set(s * 1.1, 0, k); g.add(leg);
    }
  }
  return g;
}

/* ============================================================
   台盆里的泡沫：瓶盖周围摊开的一层慕斯（花瓣状边缘）
   ============================================================ */
const bowlY = (x, z) => yIn(Math.hypot(x / B.sx, z));
function bowlN(x, z, out) {
  const e = 1e-3;
  const dx = (bowlY(x + e, z) - bowlY(x - e, z)) / (2 * e), dz = (bowlY(x, z + e) - bowlY(x, z - e)) / (2 * e);
  return out.set(-dx, 1, -dz).normalize();
}

const PUD = { nt: 72, nr: 18, a0: Math.PI, a1: 2 * Math.PI, rin: 0.024 };   // 只铺后半盆（前半盆是剖开的）
const puddleGeo = new THREE.BufferGeometry();
{
  const { nt, nr } = PUD, top = (nt + 1) * (nr + 1), side = 2 * (nr + 1) * 2;
  puddleGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((top + side) * 3), 3));
  puddleGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((top + side) * 2), 2));
  const idx = [];
  for (let j = 0; j < nt; j++) for (let i = 0; i < nr; i++) {
    const a = j * (nr + 1) + i, b = a + nr + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  for (let e = 0; e < 2; e++) {            // 两端的剖切面：泡沫顶面 ↔ 盆面
    const o = top + e * 2 * (nr + 1);
    for (let i = 0; i < nr; i++) { const a = o + i * 2; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
  }
  puddleGeo.setIndex(idx);
}
const basinFoam = new THREE.Mesh(puddleGeo, foamMat());
basinFoam.material.side = THREE.DoubleSide;
basinFoam.frustumCulled = false;
MODEL.add(basinFoam);

/* 每帧重摆顶面：k = 铺开程度 0~1，h = 厚度系数 */
function layPuddle(k, h) {
  const { nt, nr, a0, a1, rin } = PUD, pos = puddleGeo.attributes.position.array;
  const R = rin + 0.095 * Math.sqrt(k);
  const ring = [];
  for (let j = 0; j <= nt; j++) {
    const a = lerp(a0, a1, j / nt);
    const Ra = rin + (R - rin) * (1 + 0.14 * Math.sin(a * 5 + 1) + 0.07 * Math.sin(a * 11 + 2.3));
    for (let i = 0; i <= nr; i++) {
      const t = i / nr, r = lerp(rin, Ra, t);
      const x = r * Math.cos(a) * B.sx, z = r * Math.sin(a);
      // 中间厚、边缘圆润收薄；瓶盖口一圈被挤得更鼓；表面有几道褶
      let th = 0.011 * Math.pow(1 - t * t, 0.4) + 0.016 * Math.exp(-(((r - 0.038) / 0.013) ** 2)) * (1 - t * 0.5);
      th *= h * (1 + 0.28 * Math.sin(a * 7 + r * 140) * Math.sin(r * 260 + a * 3) * (1 - t * 0.6));
      const v = (j * (nr + 1) + i) * 3;
      pos[v] = x; pos[v + 1] = bowlY(x, z) + th + 0.0004; pos[v + 2] = z;
      if (j === 0 || j === nt) ring.push([x, bowlY(x, z) + th + 0.0004, z, bowlY(x, z) - 0.001]);
    }
  }
  let v = (nt + 1) * (nr + 1) * 3;
  for (const [x, yt, z, yb] of ring) { pos.set([x, yt, z, x, yb, z], v); v += 6; }
  puddleGeo.attributes.position.needsUpdate = true;
  puddleGeo.computeVertexNormals();
}

/* ============================================================
   溢水口：台盆内壁上的长圆孔，背后有一条溢水通道接到下水尾管
   按住下水口打泡沫 → 泡沫顺通道倒灌上来 → 从溢水口像牙膏一样挤出、垂下、层层叠起
   ============================================================ */
const OVF_R = 0.186, OVF_A = -Math.PI + 1.07;                  // 左后方内壁、靠近盆沿
const OVF = { p: new V3(OVF_R * Math.cos(OVF_A) * B.sx, 0, OVF_R * Math.sin(OVF_A)), n: new V3() };
OVF.p.y = bowlY(OVF.p.x, OVF.p.z);
bowlN(OVF.p.x, OVF.p.z, OVF.n);
{
  const hole = new THREE.Group();
  hole.position.copy(OVF.p).addScaledVector(OVF.n, 0.0006);
  hole.lookAt(hole.position.clone().add(OVF.n));
  hole.scale.set(2.0, 1, 1);
  hole.add(new THREE.Mesh(new THREE.CircleGeometry(0.0072, 32), new THREE.MeshBasicMaterial({ color: 0x2b2b30 })));
  const rim = new THREE.Mesh(new THREE.RingGeometry(0.0072, 0.0092, 40), M.ceramic);
  rim.position.z = 0.0003;
  hole.add(rim);
  MODEL.add(hole);
}

/* 溢水通道：尾管背面三通 → 台盆底下 → 绕到盆后 → 穿过盆壁到溢水口
   被台盆挡住，所以像原理图一样用"透视"画法：放进不透明队列、不做深度测试，
   画在陶瓷/橱柜之后、罐子和泡沫之前 → 能透过水槽看见，但不会盖住罐子 */
const xray = m => Object.assign(m, { transparent: false, depthTest: false, depthWrite: false, blending: THREE.CustomBlending,
  blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });     // 不改画布 alpha，否则导出视频时会和黑底混成灰色
const CHAN = new THREE.CatmullRomCurve3([
  [0, -0.232, -0.004], [-0.02, -0.226, -0.07], [-0.07, -0.19, -0.17], [-0.11, -0.12, -0.215],
  [-0.125, -0.075, -0.215], [OVF.p.x - 0.002, OVF.p.y - 0.006, OVF.p.z - 0.03], [OVF.p.x, OVF.p.y, OVF.p.z - 0.004],].map(p => new V3(...p)), false, 'centripetal');
const chanGlassM = xray(glassMat(0.7));
const chanGlass = new THREE.Mesh(new THREE.TubeGeometry(CHAN, 120, 0.013, 20), chanGlassM);
chanGlass.renderOrder = 2;
MODEL.add(chanGlass);
const chanFoamM = xray(foamMat(0, 0, 0, 0.6));
const chanFoam = new THREE.Mesh(new THREE.TubeGeometry(CHAN, 120, 0.0105, 16), chanFoamM);
chanFoam.renderOrder = 1;
MODEL.add(chanFoam);
// 尾管上段也透视一下，让通道看得出是接在下水管上的
const STUB_U = uAtY(-0.26);
const STUB = new THREE.CatmullRomCurve3(Array.from({ length: 9 }, (_, i) => FLOW.getPointAt(STUB_U * i / 8)));
const stubGlass = new THREE.Mesh(new THREE.TubeGeometry(STUB, 24, DIM.pipe.r, 24), xray(glassMat(0.7)));
stubGlass.renderOrder = 2;
MODEL.add(stubGlass);
const stubFoamM = xray(foamMat(0, 0, 0, 0.6));
const stubFoam = new THREE.Mesh(new THREE.TubeGeometry(STUB, 24, DIM.pipe.rIn, 20), stubFoamM);
stubFoam.renderOrder = 1;
MODEL.add(stubFoam);

/* 泡沫带的中心线：(离盆心半径, 横向偏移, 离壁高度)，下垂到盆壁后折叠回来再折一次 */
const RIB = { w: 0.015, h: 0.0075, n: 200, seg: 18, M: 400 };
{
  const lat = new V3(-Math.sin(OVF_A) * B.sx, 0, Math.cos(OVF_A)).normalize();
  const pts = [
    [0.190, 0, -0.008], [0.185, 0, 0.006], [0.178, 0, 0.019], [0.168, 0.002, 0.023], [0.155, 0.003, 0.016],
    [0.140, 0.004, 0.0095], [0.122, 0.003, 0.0088], [0.106, 0, 0.0090], [0.096, -0.003, 0.0160],
    [0.103, -0.005, 0.0240], [0.120, -0.003, 0.0245], [0.134, 0, 0.0300], [0.131, 0.003, 0.0385],
    [0.116, 0.005, 0.0395], [0.098, 0.003, 0.0390], [0.087, 0, 0.0410], [0.081, -0.002, 0.0450],
  ].map(([r, l, lift]) => {
    const x = r * Math.cos(OVF_A) * B.sx, z = r * Math.sin(OVF_A);
    const p = new V3(x, bowlY(x, z), z).addScaledVector(lat, l);
    return p.addScaledVector(bowlN(p.x, p.z, new V3()), lift);
  });
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  RIB.len = curve.getLength();
  RIB.P = []; RIB.N = []; RIB.Bn = [];
  const t = new V3();
  for (let i = 0; i <= RIB.M; i++) {
    const u = i / RIB.M;
    RIB.P.push(curve.getPointAt(u));
    curve.getTangentAt(u, t);
    const n = new V3().crossVectors(t, lat).normalize();     // 扁的一面贴着盆壁
    RIB.N.push(n); RIB.Bn.push(new V3().crossVectors(n, t).normalize());
  }
}
const ribbonGeo = new THREE.BufferGeometry();
{
  const { n, seg } = RIB, vc = (n + 1) * (seg + 1);
  ribbonGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vc * 3), 3));
  ribbonGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(vc * 2), 2));
  const idx = [];
  for (let i = 0; i < n; i++) for (let k = 0; k < seg; k++) {
    const a = i * (seg + 1) + k, b = a + seg + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  ribbonGeo.setIndex(idx);
}
const ovfFoamM = foamMat(9, -9, 0.9);
ovfFoamM.side = THREE.DoubleSide;
const ovfFoam = new THREE.Mesh(ribbonGeo, ovfFoamM);
ovfFoam.frustumCulled = false;
ovfFoam.renderOrder = 3;
MODEL.add(ovfFoam);

/* 每帧重建：k = 挤出长度 0~1，m = 粗细系数（静置略塌、冲水时化掉） */
function extrudeRibbon(k, m) {
  const { n, seg, M: SM, w, h } = RIB, pos = ribbonGeo.attributes.position.array;
  const head = Math.max(k * RIB.len, 1e-4), cap = Math.min(0.012, head);
  const p = new V3();
  for (let i = 0; i <= n; i++) {
    const L = head * i / n, f = L / RIB.len * SM, j = Math.min(Math.floor(f), SM - 1);
    p.lerpVectors(RIB.P[j], RIB.P[j + 1], f - j);
    const N = RIB.N[j], Bn = RIB.Bn[j];
    const grow = 0.68 + 0.32 * sstep(clamp01(L / 0.02));             // 刚出孔时细，出来后胀开
    const x = clamp01((L - (head - cap)) / cap), tip = Math.sqrt(1 - x * x);
    const W = w * grow * tip * m * (1 + 0.06 * Math.sin(L * 260)), H = h * (0.75 + 0.25 * grow) * tip * m;
    for (let s = 0; s <= seg; s++) {
      const a = s / seg * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      const cw = Math.sign(c) * Math.abs(c) ** 0.6 * W, ch = Math.sign(sn) * Math.abs(sn) ** 0.6 * H;   // 圆角扁带
      const v = (i * (seg + 1) + s) * 3;
      pos[v]     = p.x + Bn.x * cw + N.x * ch;
      pos[v + 1] = p.y + Bn.y * cw + N.y * ch;
      pos[v + 2] = p.z + Bn.z * cw + N.z * ch;
    }
  }
  ribbonGeo.attributes.position.needsUpdate = true;
  ribbonGeo.computeVertexNormals();
}

/* 溢水口泡沫里裹着的蛾蚋：[沿泡沫带位置, 横向, 朝向] */
const OVF_FLIES = [[0.22, 0.4, 0.5], [0.40, -0.5, 2.0], [0.55, 0.2, 4.0], [0.72, -0.3, 1.0], [0.9, 0.35, 5.2]].map(([f, l, sp]) => {
  const o = makeFly();
  o.traverse(c => { c.renderOrder = 3; });
  MODEL.add(o);
  return { o, f, l, sp };
});
const _up = new V3(0, 1, 0), _ref = new V3(0.3, 0.7, 0.65).normalize(), _oq = new THREE.Quaternion();
function placeOvfFlies(k, m) {
  for (const fl of OVF_FLIES) {
    const L = fl.f * RIB.len, pop = sstep(clamp01((k * RIB.len - L - 0.01) / 0.02)) * m;
    fl.o.visible = pop > 0.02;
    if (!fl.o.visible) continue;
    const j = Math.min(Math.round(fl.f * RIB.M), RIB.M);
    const out = _n.copy(RIB.N[j]);
    if (out.dot(_ref) < 0) out.negate();
    fl.o.position.copy(RIB.P[j]).addScaledVector(out, RIB.h * m * 0.9).addScaledVector(RIB.Bn[j], fl.l * RIB.w * m * 0.6);
    fl.o.quaternion.setFromUnitVectors(_up, out).multiply(_oq.setFromAxisAngle(_up, fl.sp));
    fl.o.scale.setScalar(0.0032 * pop);
  }
}

/* ============================================================
   污垢 / 头发 / 小虫 / 管内细菌（都会被泡沫裹走）
   ============================================================ */
function germGeo() {
  const parts = [new THREE.IcosahedronGeometry(1, 2)];
  const n = 18, up = new V3(0, 1, 0);
  for (let i = 0; i < n; i++) {
    const y = 1 - (i + 0.5) / n * 2, rad = Math.sqrt(1 - y * y), a = i * 2.39996;
    const dir = new V3(Math.cos(a) * rad, y, Math.sin(a) * rad);
    const q = new THREE.Quaternion().setFromUnitVectors(up, dir);
    const stalk = new THREE.CylinderGeometry(0.06, 0.1, 0.42, 6).toNonIndexed(); stalk.translate(0, 1.12, 0);
    const knob = new THREE.SphereGeometry(0.15, 8, 6).toNonIndexed(); knob.translate(0, 1.36, 0);
    stalk.applyQuaternion(q); knob.applyQuaternion(q);
    parts.push(stalk, knob);
  }
  return mergeGeometries(parts);
}
const GERM_GEO = germGeo();
const GERM_COL = { red: 0xe8435f, green: 0x2fb57c, blue: 0x3d7fe0 };
const germMat = c => new THREE.MeshStandardMaterial({ color: GERM_COL[c], roughness: 0.45, emissive: GERM_COL[c], emissiveIntensity: 0.15 });

function makeBug() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0x5a3418, roughness: 0.35, metalness: 0.1 });
  const leg = new THREE.MeshStandardMaterial({ color: 0x3a2210, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), m); body.scale.set(1, 0.42, 0.62); g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 8), m); head.position.x = 1.05; g.add(head);
  for (const s of [-1, 1]) for (const k of [-0.5, 0.1, 0.6]) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 5), leg);
    l.position.set(k, -0.25, s * 0.6); l.rotation.set(s * 1.0, 0, k * 0.6); g.add(l);
  }
  for (const s of [-1, 1]) {
    const a = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.4, 4), leg);
    a.position.set(1.7, 0.15, s * 0.3); a.rotation.set(s * 0.5, 0, -1.2); g.add(a);
  }
  return g;
}

const DIRT = [];
const DIRT_GROUP = new THREE.Group();
MODEL.add(DIRT_GROUP);
const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;
{
  const chunkGeo = new THREE.DodecahedronGeometry(1, 0);
  const chunkMats = [0x4b2e17, 0x6b4a2a, 0x8a6a45, 0x3a2414].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 0.6 });
  const add = (obj, kind, u, a, rad, dissolve) => {
    DIRT_GROUP.add(obj);
    DIRT.push({ obj, kind, u0: u, a, rad0: rad, radIn: DIM.pipe.rIn * rand(0.1, 0.6), push: rand(0.02, 0.09),
                lag: rand(0.0, 0.05), dissolve, spin: rand(-3, 3), s0: obj.scale.clone() });
  };
  for (let i = 0; i < 36; i++) {
    const o = new THREE.Mesh(chunkGeo, chunkMats[i % 4]);
    const s = rand(0.0018, 0.0055);
    o.scale.set(s * rand(0.6, 1.4), s * rand(0.5, 1.0), s * rand(0.6, 1.4));
    o.rotation.set(rnd() * 6, rnd() * 6, rnd() * 6);
    add(o, 'chunk', U_BOTTOM + gauss() * 0.22, rand(-Math.PI, Math.PI), DIM.pipe.rIn - s * 0.6, 0.65);
  }
  for (let i = 0; i < 9; i++) {
    const pts = [];
    for (let k = 0; k < 7; k++) pts.push(new V3(k * 0.005 - 0.015, rand(-0.003, 0.003), rand(-0.003, 0.003)));
    const o = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 0.00035, 4), hairMat);
    o.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    add(o, 'hair', U_BOTTOM + gauss() * 0.16, rand(-Math.PI, Math.PI), DIM.pipe.rIn * 0.8, 0.5);
  }
  for (let i = 0; i < 3; i++) {
    const o = makeBug(); o.scale.setScalar(0.0042);
    add(o, 'bug', [uAtY(TRAP.yU + 0.06), U_BOTTOM + 0.02, U_BOTTOM + 0.09][i], [1.2, 1.4, 1.0][i], DIM.pipe.rIn - 0.003, 0.25);
  }
  for (let i = 0; i < 8; i++) {                       // 蛾蚋
    const o = makeFly(); o.scale.setScalar(0.005);
    o.rotation.set(rnd() * 6, rnd() * 6, rnd() * 6);
    add(o, 'fly', U_BOTTOM + gauss() * 0.3, rand(0.6, 2.5), DIM.pipe.rIn - 0.002, 0.3);
  }
  ['green', 'red', 'blue', 'green', 'red'].forEach((c, i) => {
    const o = new THREE.Mesh(GERM_GEO, germMat(c)); o.scale.setScalar(0.0035);
    add(o, 'germ', U_BOTTOM + (i - 2) * 0.06, rand(-1, 1) + Math.PI / 2, DIM.pipe.rIn * 0.5, 1);
  });
}

/* 管外漂浮的细菌（装饰，静置时一个个爆掉） */
const GERMS = [];
const popRingGeo = new THREE.RingGeometry(0.82, 1, 40);
[
  [-0.10, -0.30, 0.05, 'red', 0.018], [0.25, -0.13, 0.04, 'blue', 0.016], [0.21, -0.40, 0.06, 'green', 0.015],
  [-0.07, -0.45, 0.03, 'blue', 0.012], [0.40, -0.33, 0.02, 'red', 0.013], [0.09, -0.50, 0.05, 'green', 0.011],
  [0.38, -0.52, 0.04, 'blue', 0.014], [-0.15, -0.20, 0.02, 'green', 0.010], [0.075, -0.25, 0.07, 'red', 0.010],
].forEach(([x, y, z, c, s], i) => {
  const o = new THREE.Mesh(GERM_GEO, germMat(c));
  o.position.set(x, y, z);
  const ring = new THREE.Mesh(popRingGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  ring.position.copy(o.position);
  MODEL.add(o, ring);
  GERMS.push({ o, ring, base: new V3(x, y, z), s, ph: i * 1.7, tp: TL.soak[0] + 0.1 + i * 0.17 });
});

/* 装饰气泡 */
const BUBBLES = [];
[[-0.22, -0.35, 0.06, 0.03], [-0.18, -0.52, 0.02, 0.018], [0.48, -0.25, 0.03, 0.022], [0.46, -0.45, 0.08, 0.012],
 [-0.30, -0.10, 0.10, 0.014], [0.17, -0.58, 0.05, 0.016], [0.56, -0.08, 0.00, 0.02], [-0.05, -0.58, 0.08, 0.01]]
.forEach(([x, y, z, r], i) => {
  const o = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), glassMat(0.9));
  o.position.set(x, y, z); o.renderOrder = 11;
  MODEL.add(o);
  BUBBLES.push({ o, base: new V3(x, y, z), ph: i * 2.1 });
});

/* 流向箭头（原理图里的粉色大箭头） */
const ARROWS = [];
{
  const s = new THREE.Shape();
  s.moveTo(-0.03, -0.0075); s.lineTo(0.004, -0.0075); s.lineTo(0.004, -0.018); s.lineTo(0.036, 0);
  s.lineTo(0.004, 0.018); s.lineTo(0.004, 0.0075); s.lineTo(-0.03, 0.0075); s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 2 });
  for (const u of [uAtY(TRAP.yU + 0.12), U_BOTTOM, (L_U + TRAP.R * Math.PI + 0.05) / FLOW_L]) {
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xff5c9d, emissive: 0xa0204e, emissiveIntensity: 0.4, roughness: 0.4, transparent: true }));
    const p = FLOW.getPointAt(u), t = FLOW.getTangentAt(u);
    m.position.set(p.x, p.y, 0.032);
    m.rotation.z = Math.atan2(t.y, t.x);
    m.renderOrder = 12;
    MODEL.add(m);
    ARROWS.push({ m, u, p, t: t.clone() });
  }
}

/* 冲净后的星光 */
const SPARK_N = 60;
const sparkGeo = new THREE.BufferGeometry();
{
  const pos = new Float32Array(SPARK_N * 3), ph = new Float32Array(SPARK_N), v = new V3();
  for (let i = 0; i < SPARK_N; i++) {
    inPipe(rand(0.1, 0.98), rand(-Math.PI, Math.PI), rand(0.024, 0.04), v);
    pos.set([v.x, v.y, v.z], i * 3); ph[i] = rnd() * 6.28;
  }
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sparkGeo.setAttribute('ph', new THREE.BufferAttribute(ph, 1));
}
const sparkM = new THREE.ShaderMaterial({
  uniforms: { uTime, uAmt: { value: 0 }, uScale: { value: innerHeight } },
  vertexShader: /* glsl */`
    attribute float ph; uniform float uTime, uAmt, uScale; varying float vA;
    void main(){
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vA = uAmt * pow(0.5 + 0.5 * sin(uTime * 3.0 + ph * 3.0), 3.0);
      gl_PointSize = 0.03 * uScale / -mv.z * (0.5 + vA);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */`
    varying float vA;
    void main(){
      vec2 p = gl_PointCoord - 0.5;
      float s = exp(-abs(p.x) * 40.0) * exp(-abs(p.y) * 6.0) + exp(-abs(p.y) * 40.0) * exp(-abs(p.x) * 6.0) + exp(-dot(p, p) * 60.0);
      gl_FragColor = vec4(1.0, 1.0, 1.0, s * vA);
    }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
});
const sparks = new THREE.Points(sparkGeo, sparkM);
sparks.renderOrder = 13;
MODEL.add(sparks);

/* ============================================================
   动画：罐子姿态
   ============================================================ */
const HOME  = new V3(DIM.home[0], DIM.home[1] + CAN_H / 2, DIM.home[2]);
const UP    = HOME.clone().add(new V3(0, 0.10, 0));
const PRESS = new V3(0, DRAIN_Y + CAN_H / 2 + 0.001, 0);
const ABOVE = PRESS.clone().add(new V3(0, 0.07, 0));
const RY0 = 0.35;

function canPose(T, out) {
  const p = out.p.copy(HOME);
  let rz = 0, ry = RY0;
  p.lerpVectors(HOME, UP, ease(seg(T, TL.lift)));
  const ks = seg(T, TL.shake);
  if (ks > 0 && ks < 1) {
    const env = Math.sin(ks * Math.PI);
    rz += 0.3 * Math.sin(ks * Math.PI * 10) * env;
    p.y += 0.016 * Math.sin(ks * Math.PI * 20) * env;
  }
  const km = ease(seg(T, TL.move));
  if (km > 0) { p.lerpVectors(UP, ABOVE, km); p.y += Math.sin(km * Math.PI) * 0.08; rz = Math.PI * km; ry = lerp(RY0, 0, km); }
  const kp = seg(T, TL.press);
  if (kp > 0) p.lerpVectors(ABOVE, PRESS, ease(kp));
  if (T > TL.press[1] && T < TL.back[0]) p.y -= 0.0015 * Math.abs(Math.sin((T - TL.press[1]) * 5));
  const kb = seg(T, TL.back);
  if (kb > 0) {
    if (kb < 0.25) { p.lerpVectors(PRESS, ABOVE, ease(kb / 0.25)); rz = Math.PI; ry = 0; }
    else if (kb < 0.8) { const k = ease((kb - 0.25) / 0.55); p.lerpVectors(ABOVE, UP, k); p.y += Math.sin(k * Math.PI) * 0.08; rz = Math.PI * (1 - k); ry = lerp(0, RY0, k); }
    else { p.lerpVectors(UP, HOME, ease((kb - 0.8) / 0.2)); rz = 0; ry = RY0; }
  }
  out.rz = rz; out.ry = ry;
  out.cap = Math.PI / 2 * ease(seg(T, TL.twist)) * (1 - ease(seg(T, TL.unTwist)));
  return out;
}

/* ============================================================
   机位 + 自动运镜
   ============================================================ */
export const VIEWS = {
  full:    { name: '全景',   p: [0.42, 0.10, 1.55], t: [0.05, -0.22, -0.05] },
  product: { name: '产品',   p: [-0.27, 0.20, 0.40], t: [-0.45, 0.14, -0.17] },
  basin:   { name: '台盆',   p: [0.14, 0.17, 0.66], t: [0.0, -0.05, -0.03] },
  pipe:    { name: '存水弯', p: [0.26, -0.30, 0.98], t: [0.15, -0.36, -0.05] },
  ovf:     { name: '溢水口', p: [-0.42, 0.10, 0.62], t: [-0.04, -0.13, -0.10] },
};
const CAM_KEYS = [[0, 'product'], [2.5, 'product'], [3.7, 'basin'], [5.0, 'basin'], [5.9, 'ovf'], [7.6, 'ovf'], [8.5, 'pipe'], [10.5, 'pipe'],
                  [11.7, 'full'], [14.1, 'full'], [15.3, 'pipe'], [17.7, 'pipe'], [18.9, 'full']];
function camAt(T, P, Tg) {
  let i = 0;
  while (i < CAM_KEYS.length - 1 && T >= CAM_KEYS[i + 1][0]) i++;
  const a = VIEWS[CAM_KEYS[i][1]], b = VIEWS[(CAM_KEYS[i + 1] || CAM_KEYS[i])[1]];
  const span = CAM_KEYS[i + 1] ? CAM_KEYS[i + 1][0] - CAM_KEYS[i][0] : 1;
  const k = CAM_KEYS[i + 1] ? ease(clamp01((T - CAM_KEYS[i][0]) / span)) : 0;
  P.set(lerp(a.p[0], b.p[0], k), lerp(a.p[1], b.p[1], k), lerp(a.p[2], b.p[2], k));
  Tg.set(lerp(a.t[0], b.t[0], k), lerp(a.t[1], b.t[1], k), lerp(a.t[2], b.t[2], k));
}

let flyFrom = null, flyTo = null, flyT = 0;
function goView(name) {
  const v = VIEWS[name];
  flyFrom = { p: camera.position.clone(), t: controls.target.clone() };
  flyTo = { p: new V3(...v.p), t: new V3(...v.t) };
  flyT = 0;
  setAutoCam(false);
}
camera.position.set(...VIEWS.full.p);
controls.target.set(...VIEWS.full.t);

/* ============================================================
   evaluate(T)：把整个场景摆到时间 T 的样子
   ============================================================ */
const pose = { p: new V3() };

function evaluate(T, time) {
  uTime.value = time;

  /* 罐子 */
  canPose(T, pose);
  CAN.position.copy(pose.p);
  CAN.rotation.set(0, pose.ry, pose.rz);
  CAPG.rotation.y = pose.cap;
  const lift = CAN.position.y - HOME.y;
  canShadow.visible = Math.abs(CAN.position.x - HOME.x) < 0.05;
  canShadow.material.opacity = clamp01(1 - lift / 0.08);

  /* 进度量 */
  const g      = ease(seg(T, TL.basin));
  const head   = 1 - (1 - seg(T, TL.foam)) ** 1.2;
  const soak   = seg(T, TL.soak);
  const water  = ease(seg(T, TL.water));
  const wTail  = ease(seg(T, TL.waterTail));
  const outB   = seg(T, TL.basinOut);

  /* 管内泡沫 / 清水 / 污垢膜 / 扫光 */
  foamTubeM.uniforms.uHead.value = head;
  foamTubeM.uniforms.uTail.value = water;
  foamTube.visible = head > 0.001 && water < 0.999;
  foamHead.visible = head > 0.001 && head < 0.999 && head > water;
  if (foamHead.visible) FLOW.getPointAt(head, foamHead.position);
  waterTubeM.uniforms.uHead.value = water;
  waterTubeM.uniforms.uTail.value = wTail;
  waterTube.visible = water > 0.001 && wTail < 0.999;
  grimeM.uniforms.uClean.value = water > 0.001 ? water : -1;
  grimeM.uniforms.uDirt.value = 1 - 0.55 * soak;
  glassM.uniforms.uSweep.value = T > TL.shine[0] ? lerp(-0.1, 1.15, seg(T, TL.shine)) : -9;
  sparkM.uniforms.uAmt.value = sstep(seg(T, [17.8, 18.5]));

  /* 水柱 */
  const ksIn = seg(T, [TL.stream[0], TL.stream[0] + 0.3]), ksOut = seg(T, [TL.stream[1] - 0.3, TL.stream[1]]);
  stream.visible = ksIn > 0 && ksOut < 1;
  if (stream.visible) {
    const top = SPOUT_TIP.y - STREAM_LEN * ksOut, len = STREAM_LEN * (ksIn - ksOut);
    stream.scale.set(1, Math.max(len, 1e-4), 1);
    stream.position.set(0, top - len / 2, SPOUT_TIP.z);
  }

  /* 台盆泡沫 + 溢水口泡沫：静置略塌，冲水时化掉 */
  const melt = (1 - 0.15 * soak) * (1 - sstep(outB));
  basinFoam.visible = g > 0.001 && melt > 0.02;
  if (basinFoam.visible) layPuddle(g * (1 - 0.4 * sstep(outB)), sstep(clamp01(g * 1.6)) * melt * (1 + 0.04 * Math.sin(time * 2)));
  const ko = 1 - (1 - seg(T, TL.over)) ** 1.5;
  const meltO = (1 - 0.12 * soak) * (1 - sstep(seg(outB, [0.2, 1])));
  ovfFoam.visible = ko > 0.001 && meltO > 0.02;
  if (ovfFoam.visible) extrudeRibbon(ko, meltO * (1 + 0.03 * Math.sin(time * 2.3)));
  placeOvfFlies(ovfFoam.visible ? ko : 0, meltO);
  // 溢水通道：泡沫从尾管三通倒灌上去，冲水时从下往上退
  chanFoamM.uniforms.uHead.value = sstep(seg(T, TL.chan));
  chanFoamM.uniforms.uTail.value = sstep(seg(outB, [0.1, 0.9]));
  chanFoam.visible = T > TL.chan[0] && outB < 0.9;
  stubFoamM.uniforms.uHead.value = head / STUB_U;
  stubFoamM.uniforms.uTail.value = water / STUB_U;
  stubFoam.visible = head > 0.001 && water < STUB_U;

  /* 管内污垢：泡沫前沿推一下 → 浸泡分解 → 清水冲走 */
  for (const d of DIRT) {
    let u = d.u0, rad = d.rad0, s = 1, spin = 0;
    if (head > d.u0) {
      const k = clamp01((head - d.u0) / 0.08);
      u = d.u0 + d.push * ease(k);
      rad = lerp(d.rad0, d.radIn, k);
      spin = k;
    }
    if (d.kind === 'germ') s *= 1 - sstep(seg(soak, [d.u0 % 0.5, d.u0 % 0.5 + 0.3]));
    else s *= 1 - d.dissolve * soak;
    if (water > u - 0.01 && water > 0.001) { u = Math.max(u, water - d.lag); spin = 2; }
    s *= 1 - sstep(seg(u, [0.88, 0.97]));
    if (wTail > u) s = 0;
    d.obj.visible = s > 0.01;
    if (!d.obj.visible) continue;
    inPipe(u, d.a, rad, d.obj.position);
    d.obj.scale.copy(d.s0).multiplyScalar(s);
    if (spin) d.obj.rotation.y = d.spin * time * spin * 0.5;
  }

  /* 管外细菌：飘 → 静置时爆掉 */
  for (const gm of GERMS) {
    const k = seg(T, [gm.tp, gm.tp + 0.4]);
    const s = k < 0.35 ? 1 + 0.3 * (k / 0.35) : 1.3 * (1 - (k - 0.35) / 0.65);
    gm.o.visible = s > 0.01;
    gm.o.position.copy(gm.base).y += 0.004 * Math.sin(time * 1.3 + gm.ph);
    gm.o.rotation.set(time * 0.3 + gm.ph, time * 0.4, 0);
    gm.o.scale.setScalar(gm.s * Math.max(s, 0.0001));
    const kr = clamp01((k - 0.3) / 0.7);
    gm.ring.visible = kr > 0 && kr < 1;
    gm.ring.quaternion.copy(camera.quaternion);
    gm.ring.scale.setScalar(gm.s * (1 + 2.5 * kr));
    gm.ring.material.opacity = (1 - kr) * 0.9;
  }
  for (const b of BUBBLES) b.o.position.copy(b.base).y += 0.006 * Math.sin(time * 0.8 + b.ph);

  /* 箭头：泡沫阶段粉色，冲水阶段蓝色 */
  for (const a of ARROWS) {
    const foamOn = clamp01((head - a.u) / 0.04) * (1 - seg(T, [TL.back[0], TL.back[0] + 0.6]));
    const waterOn = clamp01((water - a.u) / 0.04) * (1 - clamp01((wTail - a.u) / 0.04));
    const on = Math.max(foamOn, waterOn);
    a.m.visible = on > 0.01;
    if (!a.m.visible) continue;
    const isW = waterOn > foamOn;
    a.m.material.color.setHex(isW ? 0x49a7ff : 0xff5c9d);
    a.m.material.emissive.setHex(isW ? 0x134a8a : 0xa0204e);
    a.m.material.opacity = on;
    const bob = 0.006 * Math.sin(time * 5);
    a.m.position.set(a.p.x + a.t.x * bob, a.p.y + a.t.y * bob, 0.032);
  }

  /* 文字说明 */
  let si = 0;
  while (si < STEPS.length - 1 && T >= STEPS[si + 1][0]) si++;
  let cap = STEPS[si][1];
  if (T >= TL.soak[0] && T < TL.stream[0]) {
    const rem = Math.round(1800 * (1 - soak));
    cap += `　⏱ ${String(Math.floor(rem / 60)).padStart(2, '0')}:${String(rem % 60).padStart(2, '0')}`;
  }
  UI.setStep(si, cap, T);
}

/* ============================================================
   播放控制 + 界面
   ============================================================ */
const state = { T: 0, playing: false, autoCam: true, blend: 1, blendFrom: null };
const UI = window.__DRAIN_UI;
const _cp = new V3(), _ct = new V3();

function play(fromStart) {
  if (fromStart || state.T >= TL.end) state.T = 0;
  state.playing = true;
  state.blend = 0;
  state.blendFrom = { p: camera.position.clone(), t: controls.target.clone() };
  flyTo = null;
  UI.setPlaying(true);
}
function pause() { state.playing = false; UI.setPlaying(false); }
function setT(T) { state.T = Math.max(0, Math.min(TL.end, T)); }
function setAutoCam(v) { state.autoCam = v; UI.setAutoCam(v); }

UI.init({
  steps: STEPS, end: TL.end, views: VIEWS,
  onPlay: () => state.playing ? pause() : play(false),
  onReplay: () => play(true),
  onReset: () => { pause(); setT(0); goView('full'); },
  onScrub: T => { pause(); setT(T); },
  onStep: T => { setT(T); play(false); state.blend = 1; },
  onView: goView,
  onAutoCam: v => { setAutoCam(v); if (v && state.playing) { state.blend = 0; state.blendFrom = { p: camera.position.clone(), t: controls.target.clone() }; } },
  onBg: dark => { scene.background = dark ? BG.dark : BG.light; },
  onExport: () => {
    const save = { p: CAN.position.clone(), r: CAN.rotation.clone() };
    CAN.position.set(0, 0, 0); CAN.rotation.set(0, 0, 0);
    new GLTFExporter().parse(CAN, buf => {
      CAN.position.copy(save.p); CAN.rotation.copy(save.r);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([buf], { type: 'model/gltf-binary' }));
      a.download = 'hyper-clean-drain-cleaner.glb'; a.click();
      UI.exportDone(true);
    }, err => { console.error(err); UI.exportDone(false); }, { binary: true });
  },
});

// 用户一拖视角，就交还手动控制
controls.addEventListener('start', () => { if (state.playing && state.autoCam) setAutoCam(false); flyTo = null; });

// 点罐子 = 播放
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let downXY = null;
const hitCan = e => {
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray.intersectObject(CAN, true).length > 0;
};
renderer.domElement.addEventListener('pointerdown', e => { downXY = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', e => {
  if (!downXY || Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]) > 5) return;
  if (hitCan(e)) { if (!state.playing) { setAutoCam(true); play(false); } else pause(); }
});
let hoverTick = 0;
renderer.domElement.addEventListener('pointermove', e => {
  if (++hoverTick % 3) return;
  renderer.domElement.style.cursor = hitCan(e) ? 'pointer' : '';
});
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') { e.preventDefault(); state.playing ? pause() : play(false); }
});

/* 主循环 */
const clock = new THREE.Clock();
function tick() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const time = clock.elapsedTime;
  if (state.playing) {
    state.T += dt;
    if (state.T >= TL.end) { state.T = TL.end; pause(); }
  }
  if (state.playing && state.autoCam) {
    camAt(state.T, _cp, _ct);
    state.blend = Math.min(1, state.blend + dt / 1.2);
    if (state.blend < 1 && state.blendFrom) {
      const k = ease(state.blend);
      _cp.lerpVectors(state.blendFrom.p, _cp, k);
      _ct.lerpVectors(state.blendFrom.t, _ct, k);
    }
    camera.position.copy(_cp);
    controls.target.copy(_ct);
  } else if (flyTo) {
    flyT = Math.min(1, flyT + dt * 1.4);
    const e = ease(flyT);
    camera.position.lerpVectors(flyFrom.p, flyTo.p, e);
    controls.target.lerpVectors(flyFrom.t, flyTo.t, e);
    if (flyT >= 1) flyTo = null;
  }
  evaluate(state.T, time);
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

/* URL 参数：?t=秒 定格 · ?v=机位 · ?cp/ct=自定机位 · ?ui=0 无界面 · ?play=1 自动播放 · ?rec=1 录制模式（tools/record.mjs 逐帧驱动） */
{
  const q = new URLSearchParams(location.search);
  if (q.has('t')) setT(parseFloat(q.get('t')));
  if (q.get('v') && VIEWS[q.get('v')]) {
    camera.position.set(...VIEWS[q.get('v')].p); controls.target.set(...VIEWS[q.get('v')].t);
  } else if (q.has('t')) { camAt(state.T, camera.position, controls.target); }
  if (q.get('cp')) camera.position.set(...q.get('cp').split(',').map(Number));     // ?cp=x,y,z&ct=x,y,z 自定机位
  if (q.get('ct')) controls.target.set(...q.get('ct').split(',').map(Number));
  if (q.get('ui') === '0') document.body.classList.add('uihide');
  if (q.get('play') === '1') play(true);
}
const REC = new URLSearchParams(location.search).get('rec') === '1';
if (!REC) tick();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  sparkM.uniforms.uScale.value = innerHeight;
});

/* 录制：把场景摆到时间 T（自动运镜机位），渲染一帧并返回 JPEG
   竖屏：机位是按 16:9 设计的，视角放宽到 50° 并沿视线拉远，保住约 70% 的横向范围，上下多出的空间正好装下龙头和管子 */
const PORTRAIT_FOV = 50;
function portraitCam(P, Tg, aspect) {           // 把 16:9 机位改成竖屏机位（P 原地修改）
  const tan = d => Math.tan(d * Math.PI / 360);
  const k = tan(35) * 16 / 9 * 0.7 / (tan(PORTRAIT_FOV) * aspect);
  return P.sub(Tg).multiplyScalar(k).add(Tg);
}
function frame(T) {
  camAt(T, camera.position, controls.target);
  if (camera.aspect < 1) {
    portraitCam(camera.position, controls.target, camera.aspect);
    if (camera.fov !== PORTRAIT_FOV) { camera.fov = PORTRAIT_FOV; camera.updateProjectionMatrix(); }
  }
  camera.lookAt(controls.target);
  evaluate(T, T);
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL('image/jpeg', 0.95);
}

window.DRAIN = { THREE, scene, camera, controls, renderer, DIM, TL, VIEWS, CAN, FLOW, state, setT, play, pause, goView, evaluate, frame, camAt,
  PORTRAIT: { fov: PORTRAIT_FOV, cam: portraitCam }, MORPH: [basinFoam, ovfFoam] };   // MORPH：每帧重算形状的网格（导出动画时用形态键采样）
