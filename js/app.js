import { POSES, poseById, poseSVG, LIMBS } from './poses.js';
import { SCENES, sceneFromLabels, sceneFromLight } from './scenes.js';
import { PRESETS, applyPreset } from './color.js';
import { loadVision, detectPose, classify } from './vision.js';
import { placeGhost, toPerson, matchScore, coachMessage } from './coach.js';
import { askPhotographer } from './ai.js';

const $ = (s) => document.querySelector(s);
const video = $('#video'), overlay = $('#overlay'), octx = overlay.getContext('2d');
const stage = $('#stage');
window.__app = { get state() { return state; } }; // 디버그용
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isMobile = isIOS || /Android|Mobi/i.test(navigator.userAgent);

// ---------- 상태 ----------
const RATIOS = { '3:4': [3, 4], '9:16': [9, 16], '4:5': [4, 5], '1:1': [1, 1] };
const GRIDS = [['thirds', '⅓'], ['golden', 'φ'], ['diag', '╳'], ['center', '+'], ['none', '끔']];
const TIMERS = [0, 3, 10];
const COMPS = [['left', '왼쪽⅓'], ['center', '가운데'], ['right', '오른쪽⅓']];

const state = {
  facing: 'environment', stream: null, track: null, visionReady: false,
  ratio: '3:4', grid: 'thirds', timer: 0, auto: false,
  mode: 'solo', poseId: 's-line', poseManual: false, comp: 'right',
  preset: 'auto', presetManual: false,
  scene: 'daily', sceneLockUntil: 0, sceneCandidate: null,
  persons: [], match: { score: 0, parts: [] }, tilt: null, light: {},
  msg: null, holdSince: 0, lastAuto: 0, busy: false, duoSeenSince: 0, duoToastShown: false,
  shots: [], rvIndex: -1,
};
const settings = { autoSave: false, skeleton: true, sound: true, threshold: 82, apiKey: '' };
try { Object.assign(settings, JSON.parse(localStorage.getItem('photoapp.settings') || '{}')); } catch {}
const saveSettings = () => { try { localStorage.setItem('photoapp.settings', JSON.stringify(settings)); } catch {} };

// ---------- 유틸 ----------
let toastTimer;
function toast(text, action, ms = 2600) {
  const t = $('#toast');
  t.innerHTML = '';
  t.append(Object.assign(document.createElement('span'), { textContent: text }));
  if (action) {
    const b = Object.assign(document.createElement('button'), { textContent: action.label });
    b.onclick = () => { action.run(); t.hidden = true; };
    t.append(b);
  }
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), ms);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

let audioCtx;
function shutterSound() {
  if (!settings.sound) return;
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const len = audioCtx.sampleRate * 0.07;
    const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = audioCtx.createBufferSource(); src.buffer = buf;
    const g = audioCtx.createGain(); g.gain.value = 0.35;
    src.connect(g).connect(audioCtx.destination); src.start();
  } catch {}
}

// ---------- 카메라 ----------
async function startCamera() {
  state.stream?.getTracks().forEach((t) => t.stop());
  const base = { facingMode: state.facing };
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { ...base, width: { ideal: 2560 }, height: { ideal: 1440 } } });
  } catch {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: base });
  }
  state.stream = stream;
  state.track = stream.getVideoTracks()[0];
  video.srcObject = stream;
  video.classList.toggle('mirror', state.facing === 'user');
  await video.play().catch(() => {});
  await new Promise((r) => (video.videoWidth ? r() : video.addEventListener('loadedmetadata', r, { once: true })));
  setupZoom();
  layout();
}

function setupZoom() {
  const box = $('#zoomChips'); box.innerHTML = '';
  const caps = state.track?.getCapabilities?.() || {};
  if (!caps.zoom) return;
  const { min, max } = caps.zoom;
  const cur = state.track.getSettings().zoom || 1;
  const vals = [min < 0.95 ? min : null, 1, 2, 3].filter((v) => v != null && v >= min && v <= max);
  for (const v of vals) {
    const b = document.createElement('button');
    b.textContent = (v < 1 ? Number(v.toFixed(1)) : v) + '×';
    b.classList.toggle('on', Math.abs(v - cur) < 0.05);
    b.onclick = async () => {
      try { await state.track.applyConstraints({ advanced: [{ zoom: v }] }); } catch {}
      box.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      if (v < 1) toast('0.5×는 풍경용! 인물은 가장자리에서 늘어나 보여요');
      if (v === 2) toast('2×는 인물에 최고 — 얼굴 왜곡 없고 배경이 예쁘게 압축돼요');
    };
    box.append(b);
  }
}

// 노출 보정 (역광일 때)
let lastExpo = 0, expoState = 0;
function autoExposure() {
  const caps = state.track?.getCapabilities?.() || {};
  if (!caps.exposureCompensation || performance.now() - lastExpo < 3000) return;
  const want = state.light.backlit ? Math.min(caps.exposureCompensation.max, 1) : 0;
  if (want === expoState) return;
  lastExpo = performance.now(); expoState = want;
  state.track.applyConstraints({ advanced: [{ exposureCompensation: want }] }).catch(() => {});
}

// ---------- 레이아웃 & 좌표 변환 ----------
let stageW = 0, stageH = 0, dpr = 1;
function ratioValue() {
  const [a, b] = RATIOS[state.ratio];
  const vp = $('#viewport').getBoundingClientRect();
  const landscape = vp.width > vp.height * 1.1;
  return landscape ? b / a : a / b; // 폭/높이
}
function layout() {
  const vp = $('#viewport').getBoundingClientRect();
  const r = ratioValue();
  let w = vp.width, h = w / r;
  if (h > vp.height) { h = vp.height; w = h * r; }
  stageW = Math.round(w); stageH = Math.round(h);
  stage.style.width = stageW + 'px'; stage.style.height = stageH + 'px';
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  overlay.width = stageW * dpr; overlay.height = stageH * dpr;
  ghostCache = null;
}
window.addEventListener('resize', () => setTimeout(layout, 50));
screen.orientation?.addEventListener?.('change', () => setTimeout(layout, 200));

// 비디오 원본에서 화면(stage)에 보이는 영역
function sourceRect() {
  const vw = video.videoWidth, vh = video.videoHeight;
  const s = Math.max(stageW / vw, stageH / vh);
  const sw = stageW / s, sh = stageH / s;
  return { sx: (vw - sw) / 2, sy: (vh - sh) / 2, sw, sh, s };
}
function mapPoint(x, y) {
  const vw = video.videoWidth, vh = video.videoHeight;
  const { s } = sourceRect();
  const ox = (stageW - vw * s) / 2, oy = (stageH - vh * s) / 2;
  if (state.facing === 'user') x = 1 - x;
  return [(x * vw * s + ox) / stageW, (y * vh * s + oy) / stageH];
}

// ---------- 기울기 센서 ----------
async function requestMotion() {
  try {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      const r = await DeviceMotionEvent.requestPermission();
      if (r !== 'granted') return;
    }
  } catch { return; }
  let roll = null, pitch = 0;
  window.addEventListener('devicemotion', (e) => {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null) return;
    let { x, y, z } = a;
    if (isIOS) { x = -x; y = -y; z = -z; }
    const g = Math.hypot(x, y, z) || 9.8;
    const angle = screen.orientation?.angle ?? window.orientation ?? 0;
    let r = (Math.atan2(x, y) * 180) / Math.PI - angle;
    r = ((r + 540) % 360) - 180;
    const p = (Math.asin(Math.max(-1, Math.min(1, z / g))) * 180) / Math.PI;
    roll = roll == null ? r : roll + (r - roll) * 0.2;
    pitch += (p - pitch) * 0.2;
    // 폰을 거의 눕혔을 때는 수평 의미 없음
    state.tilt = Math.abs(p) > 65 ? null : { roll, pitchDown: state.facing === 'environment' ? pitch : 0 };
  });
}

// ---------- 포즈/장면/프리셋 UI ----------
const currentPose = () => (state.poseId ? poseById(state.poseId) : null);
let ghostCache = null;
function ghost() {
  const pose = currentPose();
  if (!pose || !stageW) return null;
  const key = `${pose.id}|${state.comp}|${stageW}x${stageH}`;
  if (ghostCache?.key !== key) ghostCache = { key, ...placeGhost(pose, state.comp, stageW / stageH) };
  return ghostCache;
}

function renderPoses() {
  const sc = SCENES[state.scene];
  const want = state.mode === 'duo' ? 2 : 1;
  const rec = (state.mode === 'duo' ? sc.duo : sc.solo).concat(state.aiPoses || []);
  const list = POSES.filter((p) => p.people === want)
    .sort((a, b) => (rec.includes(a.id) ? rec.indexOf(a.id) : 99) - (rec.includes(b.id) ? rec.indexOf(b.id) : 99));
  const strip = $('#poseStrip'); strip.innerHTML = '';
  const none = document.createElement('button');
  none.className = 'pose-card none' + (state.poseId ? '' : ' on');
  none.innerHTML = '🚫<span>실루엣 끄기</span>';
  none.onclick = () => selectPose(null, true);
  for (const p of list) {
    const b = document.createElement('button');
    b.className = 'pose-card' + (p.id === state.poseId ? ' on' : '');
    b.innerHTML = `${rec.includes(p.id) ? '<i class="star">⭐</i>' : ''}${poseSVG(p, 44)}<span>${p.name}</span>`;
    b.onclick = () => selectPose(p.id, true);
    strip.append(b);
  }
  strip.append(none);
}
function selectPose(id, manual) {
  state.poseId = id; if (manual) state.poseManual = true;
  const p = currentPose();
  if (p && p.people > 1 && state.comp !== 'center') setComp('center');
  ghostCache = null;
  renderPoses();
  if (p && manual) toast(`${p.name} — ${p.tip}`, null, 3500);
}
function setComp(c) {
  state.comp = c; ghostCache = null;
  $('#btnComp').textContent = '위치 · ' + COMPS.find((x) => x[0] === c)[1];
}
function setMode(m) {
  state.mode = m;
  document.querySelectorAll('#modeToggle button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
  const sc = SCENES[state.scene];
  state.poseManual = false;
  selectPose((m === 'duo' ? sc.duo : sc.solo)[0], false);
  setComp(m === 'duo' ? 'center' : 'right');
  if (m === 'duo') toast('둘이 찍기: 타이머 10초 + 폰 거치를 추천해요', { label: '타이머 10초', run: () => setTimer(10) }, 4000);
}

function renderPresets() {
  const strip = $('#presetStrip'); strip.innerHTML = '';
  for (const [id, p] of Object.entries(PRESETS)) {
    const b = document.createElement('button');
    b.className = 'chip' + (id === state.preset ? ' on' : '');
    b.textContent = p.name;
    b.onclick = () => { state.presetManual = true; setPreset(id); };
    strip.append(b);
  }
}
function setPreset(id) {
  state.preset = id;
  video.style.filter = PRESETS[id].css === 'none' ? '' : PRESETS[id].css;
  renderPresets();
  updateSceneChip();
}

function updateSceneChip() {
  const sc = SCENES[state.scene];
  $('#sceneChip').textContent = `${sc.icon} ${sc.name} · ${PRESETS[state.preset].name}`;
}
function setScene(id, src = 'auto') {
  if (!SCENES[id]) return;
  const changed = id !== state.scene;
  state.scene = id;
  if (src !== 'auto') state.sceneLockUntil = performance.now() + 60000;
  if (changed || src !== 'auto') {
    if (!state.presetManual) setPreset(SCENES[id].preset);
    if (!state.poseManual) {
      const sc = SCENES[id];
      state.poseId = (state.mode === 'duo' ? sc.duo : sc.solo)[0]; ghostCache = null;
    }
    renderPoses();
    if (changed && src === 'auto') toast(`${SCENES[id].icon} ${SCENES[id].name} 감지 — 어울리는 포즈·색감으로 바꿨어요`);
  }
  updateSceneChip();
  renderGuide();
}

// ---------- 오버레이 그리기 ----------
const ghostCanvas = document.createElement('canvas');
function drawOverlay() {
  const W = overlay.width, H = overlay.height;
  octx.clearRect(0, 0, W, H);
  octx.save(); octx.scale(dpr, dpr);
  drawGrid();
  const g = ghost();
  if (g) drawGhost(g);
  if (settings.skeleton) drawSkeletons();
  drawLevel();
  drawArrow();
  octx.restore();
}

function drawGrid() {
  const w = stageW, h = stageH;
  octx.strokeStyle = 'rgba(255,255,255,0.38)'; octx.lineWidth = 1;
  const line = (x1, y1, x2, y2) => { octx.beginPath(); octx.moveTo(x1, y1); octx.lineTo(x2, y2); octx.stroke(); };
  const fr = state.grid === 'golden' ? [0.382, 0.618] : [1 / 3, 2 / 3];
  if (state.grid === 'thirds' || state.grid === 'golden' || state.grid === 'diag') {
    for (const f of fr) { line(w * f, 0, w * f, h); line(0, h * f, w, h * f); }
    octx.fillStyle = 'rgba(255,255,255,0.55)';
    for (const fx of fr) for (const fy of fr) { octx.beginPath(); octx.arc(w * fx, h * fy, 2.5, 0, 7); octx.fill(); }
  }
  if (state.grid === 'diag') { line(0, 0, w, h); line(w, 0, 0, h); }
  if (state.grid === 'center') { line(w / 2 - 14, h / 2, w / 2 + 14, h / 2); line(w / 2, h / 2 - 14, w / 2, h / 2 + 14); }
}

function drawGhost(g) {
  const w = stageW, h = stageH;
  if (ghostCanvas.width !== overlay.width) { ghostCanvas.width = overlay.width; ghostCanvas.height = overlay.height; }
  const c = ghostCanvas.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, ghostCanvas.width, ghostCanvas.height);
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const good = state.match.score >= settings.threshold;
  c.fillStyle = c.strokeStyle = '#fff';
  c.lineCap = c.lineJoin = 'round';
  const bodyH = g.H * h;
  for (const pts of g.people) {
    const P = (k) => pts[k] && [pts[k][0] * w, pts[k][1] * h];
    c.lineWidth = bodyH * 0.075;
    // 몸통
    const torso = ['ls', 'rs', 'rh', 'lh'].map(P);
    c.beginPath();
    if (torso.every(Boolean)) {
      torso.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.closePath(); c.fill(); c.stroke();
    } else {
      // 상반신 포즈: 골반 없으면 아래로 페이드되는 몸통
      const [l, r] = [P('ls'), P('rs')];
      c.moveTo(l[0], l[1]); c.lineTo(r[0], r[1]); c.lineTo(r[0], h * 1.2); c.lineTo(l[0], h * 1.2); c.closePath(); c.fill(); c.stroke();
    }
    // 목
    const h0 = P('h'), ls = P('ls'), rs = P('rs');
    c.lineWidth = bodyH * 0.06;
    c.beginPath(); c.moveTo(h0[0], h0[1]); c.lineTo((ls[0] + rs[0]) / 2, (ls[1] + rs[1]) / 2); c.stroke();
    // 팔다리 (위쪽이 두껍게)
    for (const [a, b] of LIMBS) {
      const A = P(a), B = P(b); if (!A || !B) continue;
      c.lineWidth = bodyH * (a.endsWith('h') || a.endsWith('k') ? 0.07 : 0.05);
      c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.stroke();
    }
    c.beginPath(); c.ellipse(h0[0], h0[1], g.headR * h * 0.85, g.headR * h, 0, 0, 7); c.fill();
  }
  if (good) { // 딱 맞으면 초록 실루엣
    c.globalCompositeOperation = 'source-atop'; c.fillStyle = '#5cf0a0'; c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'source-over';
  }
  // 겹침 없이 한 번에 반투명 합성 = 그림자 실루엣
  octx.save();
  octx.setTransform(1, 0, 0, 1, 0, 0);
  octx.globalAlpha = good ? 0.4 : 0.26;
  octx.drawImage(ghostCanvas, 0, 0);
  octx.restore();
  // 발끝 기준선
  const pose = currentPose();
  if (pose?.frame === 'full') {
    const feet = Math.max(...g.people.flatMap((p) => [p.la?.[1] || 0, p.ra?.[1] || 0])) * h + g.H * h * 0.03;
    octx.setLineDash([6, 6]); octx.strokeStyle = 'rgba(255,213,74,0.8)'; octx.lineWidth = 1.5;
    octx.beginPath(); octx.moveTo(w * 0.2, feet); octx.lineTo(w * 0.8, feet); octx.stroke(); octx.setLineDash([]);
    octx.fillStyle = 'rgba(255,213,74,0.95)'; octx.font = '600 11px sans-serif'; octx.textAlign = 'center';
    octx.fillText('발끝 라인', w / 2, Math.min(h - 4, feet + 14));
  }
}

const SK = [['ls', 'rs'], ['ls', 'lh'], ['rs', 'rh'], ['lh', 'rh'], ...LIMBS];
function drawSkeletons() {
  const w = stageW, h = stageH;
  for (const p of state.persons) {
    octx.strokeStyle = state.match.score >= settings.threshold ? '#5cf0a0' : 'rgba(80,200,255,0.9)';
    octx.lineWidth = 2.5; octx.lineCap = 'round';
    for (const [a, b] of SK) {
      if (p.vis[a] < 0.5 || p.vis[b] < 0.5) continue;
      octx.beginPath(); octx.moveTo(p.raw[a][0] * w, p.raw[a][1] * h); octx.lineTo(p.raw[b][0] * w, p.raw[b][1] * h); octx.stroke();
    }
    octx.fillStyle = '#fff';
    for (const k of Object.keys(p.raw)) {
      if (p.vis[k] < 0.5) continue;
      octx.beginPath(); octx.arc(p.raw[k][0] * w, p.raw[k][1] * h, 3, 0, 7); octx.fill();
    }
  }
}

function drawLevel() {
  if (!state.tilt) return;
  const w = stageW, h = stageH, r = (state.tilt.roll * Math.PI) / 180;
  const ok = Math.abs(state.tilt.roll) < 1.5;
  const len = w * 0.16;
  octx.save(); octx.translate(w / 2, h / 2);
  // 기준 (고정)
  octx.strokeStyle = 'rgba(255,255,255,0.5)'; octx.lineWidth = 1.5;
  octx.beginPath(); octx.moveTo(-len - 14, 0); octx.lineTo(-len - 4, 0); octx.moveTo(len + 4, 0); octx.lineTo(len + 14, 0); octx.stroke();
  octx.rotate(r);
  octx.strokeStyle = ok ? '#5cf0a0' : '#ffd54a'; octx.lineWidth = ok ? 3 : 2;
  octx.beginPath(); octx.moveTo(-len, 0); octx.lineTo(len, 0); octx.stroke();
  octx.restore();
}

function drawArrow() {
  const a = state.msg?.arrow; if (!a || !['left', 'right', 'up', 'down'].includes(a)) return;
  const w = stageW, h = stageH, t = performance.now() / 300;
  const bob = Math.sin(t) * 5;
  const pos = { left: [28 + bob, h / 2, Math.PI], right: [w - 28 - bob, h / 2, 0], up: [w / 2, 110 + bob, -Math.PI / 2], down: [w / 2, h - 70 - bob, Math.PI / 2] }[a];
  octx.save(); octx.translate(pos[0], pos[1]); octx.rotate(pos[2]);
  octx.fillStyle = 'rgba(255,213,74,0.9)';
  octx.beginPath(); octx.moveTo(14, 0); octx.lineTo(-8, -14); octx.lineTo(-8, 14); octx.closePath(); octx.fill();
  octx.restore();
}

// ---------- 분석 루프 ----------
const lightCanvas = Object.assign(document.createElement('canvas'), { width: 36, height: 48 });
const clsCanvas = Object.assign(document.createElement('canvas'), { width: 224, height: 224 });

function measureLight() {
  const { sx, sy, sw, sh } = sourceRect();
  const lw = lightCanvas.width = stageW > stageH ? 48 : 36;
  const lh = lightCanvas.height = stageW > stageH ? 36 : 48;
  const c = lightCanvas.getContext('2d', { willReadFrequently: true });
  c.drawImage(video, sx, sy, sw, sh, 0, 0, lw, lh);
  const d = c.getImageData(0, 0, lw, lh).data;
  let sum = 0, top = 0, topN = 0, tr = 0, tb = 0;
  for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) {
    const i = (y * lw + x) * 4, L = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
    sum += L;
    if (y < lh / 3) { top += L; topN++; tr += d[i]; tb += d[i + 2]; }
  }
  const luma = sum / (lw * lh), topLuma = top / topN, topWarmth = tr / Math.max(1, tb);
  // 얼굴 영역 밝기
  let face = null;
  const p = state.persons[0];
  if (p && p.nose.vis > 0.6) {
    const cx = Math.round(p.nose.u * lw), cy = Math.round(p.nose.v * lh), r = 2;
    let fs = 0, fn = 0;
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      if (x < 0 || y < 0 || x >= lw || y >= lh) continue;
      const xx = state.facing === 'user' ? lw - 1 - x : x; // 캔버스는 미러 전 원본
      const i = (y * lw + xx) * 4; fs += (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255; fn++;
    }
    face = fn ? fs / fn : null;
  }
  state.light = {
    luma, topLuma, topWarmth, face,
    dark: luma < 0.16,
    backlit: face != null && face < luma * 0.62 && topLuma > 0.5,
  };
  autoExposure();
}

function runClassifier() {
  const { sx, sy, sw, sh } = sourceRect();
  const c = clsCanvas.getContext('2d');
  // 인물 위주 크롭 대신 화면 전체를 넣어야 배경(장소)을 인식함
  c.drawImage(video, sx, sy, sw, sh, 0, 0, 224, 224);
  const cats = classify(clsCanvas);
  let { scene } = sceneFromLabels(cats);
  const byLight = sceneFromLight(state.light);
  if (byLight) scene = byLight;
  scene ||= 'daily';
  if (performance.now() < state.sceneLockUntil) return;
  if (scene === state.sceneCandidate) setScene(scene, 'auto');
  state.sceneCandidate = scene;
}

let lastDetect = 0, lastLight = 0, lastCls = 0, lastMsg = 0;
function loop(now) {
  requestAnimationFrame(loop);
  if (!video.videoWidth || !stageW) return;
  if (state.visionReady && now - lastDetect > 66) {
    lastDetect = now;
    try {
      const lms = detectPose(video, now) || [];
      state.persons = lms.map((lm) => toPerson(lm, mapPoint));
    } catch (e) { console.warn(e); }
    const g = ghost();
    state.match = g ? matchScore(state.persons, g, stageW / stageH) : { score: state.persons.length ? 60 : 0, parts: [] };
  }
  if (now - lastLight > 500) { lastLight = now; measureLight(); }
  if (state.visionReady && now - lastCls > 2500) { lastCls = now; try { runClassifier(); } catch (e) { console.warn(e); } }
  if (now - lastMsg > 350) { lastMsg = now; updateCoach(now); }
  drawOverlay();
  autoShutter(now);
}

function updateCoach(now) {
  const pose = currentPose();
  const msg = state.visionReady
    ? coachMessage({ persons: state.persons, pose, match: state.match, tilt: state.tilt, light: state.light, mode: state.mode, scoreGood: settings.threshold })
    : { level: 'info', text: 'AI 준비 중… 먼저 구도선에 맞춰 찍어도 돼요' };
  state.msg = msg;
  const el = $('#coach');
  el.className = msg.level;
  $('#coachText').textContent = msg.text;
  const act = $('#coachAction');
  act.hidden = !(msg.action === 'timer' && state.timer !== 10);
  act.textContent = '타이머 10초';
  act.onclick = () => setTimer(10);

  // 점수 링
  const sc = pose ? Math.round(state.match.score) : 0;
  $('#ringMeter').style.strokeDashoffset = 289 * (1 - sc / 100);
  $('#ringMeter').style.stroke = sc >= settings.threshold ? '#5cf0a0' : sc >= 55 ? '#ffd54a' : '#ff7a59';
  $('#scoreLabel').textContent = pose && state.persons.length ? sc : '';

  // 사람 추가 감지 → 커플 포즈 제안
  if (state.mode === 'solo' && state.persons.length >= 2) {
    state.duoSeenSince ||= now;
    if (!state.duoToastShown && now - state.duoSeenSince > 1500) {
      state.duoToastShown = true;
      toast('👥 두 명이 보여요! 커플 포즈 추천으로 바꿀까요?', { label: '둘이 모드', run: () => setMode('duo') }, 5000);
    }
  } else state.duoSeenSince = 0;
}

function autoShutter(now) {
  if (!state.auto || state.busy || !currentPose()) { state.holdSince = 0; return; }
  if (state.match.score >= settings.threshold && state.msg?.level === 'good') {
    state.holdSince ||= now;
    if (now - state.holdSince > 600 && now - state.lastAuto > 3500) {
      state.lastAuto = now; state.holdSince = 0;
      shoot({ viaAuto: true });
    }
  } else state.holdSince = 0;
}

// ---------- 촬영 ----------
function grabFrame() {
  const { sx, sy, sw, sh } = sourceRect();
  const c = document.createElement('canvas');
  c.width = Math.round(sw); c.height = Math.round(sh);
  const ctx = c.getContext('2d');
  if (state.facing === 'user') { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}

async function countdown(sec) {
  const el = $('#countdown'); el.hidden = false;
  for (let i = sec; i > 0; i--) {
    el.textContent = i;
    if (navigator.vibrate) navigator.vibrate(30);
    await sleep(1000);
  }
  el.hidden = true;
}

async function shoot({ viaAuto = false, burst = 1 } = {}) {
  if (state.busy || !video.videoWidth) return;
  state.busy = true;
  try {
    if (state.timer && !viaAuto) await countdown(state.timer);
    const raws = [];
    for (let i = 0; i < burst; i++) {
      raws.push(grabFrame());
      shutterSound();
      const f = $('#flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
      if (burst > 1) await sleep(180);
    }
    const backlit = !!state.light.backlit;
    await nextFrame();
    let last;
    for (const raw of raws) {
      const shot = { orig: raw, preset: state.preset, strength: 1, backlit, time: new Date() };
      shot.out = applyPreset(raw, shot.preset, { strength: 1, backlit });
      state.shots.push(shot);
      if (state.shots.length > 40) state.shots.shift();
      last = shot;
      if (settings.autoSave && !isIOS) await saveShot(shot, true);
      await nextFrame();
    }
    $('#galleryThumb').src = last.out.toDataURL('image/jpeg', 0.6);
    if (viaAuto) toast('🤖 자동으로 찍었어요! 왼쪽 아래에서 확인');
    else if (burst > 1) { toast(`연사 ${burst}장 완료`); openReview(state.shots.length - 1); }
    else openReview(state.shots.length - 1);
  } catch (e) {
    console.error(e); toast('촬영 실패: ' + e.message);
  } finally { state.busy = false; }
}

// 셔터: 탭=촬영, 길게=연사
(() => {
  const btn = $('#shutter');
  let pressT = 0, longTimer = null, fired = false;
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault(); pressT = performance.now(); fired = false;
    longTimer = setTimeout(() => { fired = true; btn.classList.add('burst'); shoot({ burst: 5 }).finally(() => btn.classList.remove('burst')); }, 450);
  });
  const up = () => {
    clearTimeout(longTimer);
    if (!fired && pressT) shoot();
    pressT = 0;
  };
  btn.addEventListener('pointerup', up);
  btn.addEventListener('pointerleave', () => { clearTimeout(longTimer); pressT = 0; });
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
})();

// ---------- 저장 ----------
function fileName(shot) {
  const t = shot.time, z = (n) => String(n).padStart(2, '0');
  return `IMG_${t.getFullYear()}${z(t.getMonth() + 1)}${z(t.getDate())}_${z(t.getHours())}${z(t.getMinutes())}${z(t.getSeconds())}_${t.getMilliseconds()}.jpg`;
}
async function saveShot(shot, silent = false) {
  const blob = await new Promise((r) => shot.out.toBlob(r, 'image/jpeg', 0.94));
  const file = new File([blob], fileName(shot), { type: 'image/jpeg' });
  // 아이폰: 공유 시트의 "이미지 저장" → 사진 앱에 바로 저장
  if (!silent && isIOS && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); shot.saved = true; return true; }
    catch (e) { if (e.name === 'AbortError') return false; }
  }
  const url = URL.createObjectURL(blob);
  const a = $('#dl'); a.href = url; a.download = file.name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  shot.saved = true;
  if (!silent) toast(isMobile ? '저장 완료! 갤러리(다운로드 폴더)에서 볼 수 있어요' : '저장 완료 (다운로드 폴더)');
  return true;
}
async function shareShot(shot) {
  const blob = await new Promise((r) => shot.out.toBlob(r, 'image/jpeg', 0.94));
  const file = new File([blob], fileName(shot), { type: 'image/jpeg' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); } catch {}
  } else saveShot(shot);
}

// ---------- 리뷰 ----------
function openReview(i) {
  if (!state.shots.length) return toast('아직 찍은 사진이 없어요');
  state.rvIndex = Math.max(0, Math.min(i, state.shots.length - 1));
  $('#review').hidden = false;
  renderReview();
}
function renderReview(showOrig = false) {
  const shot = state.shots[state.rvIndex];
  if (showOrig) shot.origUrl ||= shot.orig.toDataURL('image/jpeg', 0.9);
  else shot.outUrl ||= shot.out.toDataURL('image/jpeg', 0.9);
  $('#rvImg').src = showOrig ? shot.origUrl : shot.outUrl;
  $('#rvBadge').textContent = showOrig ? '원본' : `${PRESETS[shot.preset].name}${shot.backlit ? ' · 역광 보정' : ''}`;
  $('#rvCount').textContent = `${state.rvIndex + 1} / ${state.shots.length}`;
  $('#rvPrev').hidden = state.rvIndex === 0;
  $('#rvNext').hidden = state.rvIndex === state.shots.length - 1;
  $('#rvStrength').value = Math.round(shot.strength * 100);
  $('#rvSave').textContent = shot.saved ? '✓ 저장됨 (다시 저장)' : (isIOS ? '⬇︎ 사진 앱에 저장' : '⬇︎ 사진첩에 저장');
  const strip = $('#rvPresets'); strip.innerHTML = '';
  for (const [id, p] of Object.entries(PRESETS)) {
    const b = document.createElement('button');
    b.className = 'chip' + (id === shot.preset ? ' on' : '');
    b.textContent = p.name;
    b.onclick = () => reprocess({ preset: id });
    strip.append(b);
  }
}
let reprocessTimer;
function reprocess(change) {
  const shot = state.shots[state.rvIndex];
  Object.assign(shot, change); shot.saved = false;
  clearTimeout(reprocessTimer);
  reprocessTimer = setTimeout(async () => {
    $('#rvBadge').textContent = '보정 중…';
    await nextFrame();
    shot.out = applyPreset(shot.orig, shot.preset, { strength: shot.strength, backlit: shot.backlit });
    shot.outUrl = null;
    renderReview();
    if (state.rvIndex === state.shots.length - 1) $('#galleryThumb').src = shot.out.toDataURL('image/jpeg', 0.6);
  }, 120);
}
$('#rvClose').onclick = () => ($('#review').hidden = true);
$('#rvPrev').onclick = () => { state.rvIndex--; renderReview(); };
$('#rvNext').onclick = () => { state.rvIndex++; renderReview(); };
$('#rvStrength').oninput = (e) => reprocess({ strength: e.target.value / 100 });
$('#rvSave').onclick = async () => { await saveShot(state.shots[state.rvIndex]); renderReview(); };
$('#rvShare').onclick = () => shareShot(state.shots[state.rvIndex]);
const cmp = $('#rvCompare');
cmp.addEventListener('pointerdown', () => renderReview(true));
['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => cmp.addEventListener(ev, () => renderReview(false)));
$('#btnGallery').onclick = () => openReview(state.shots.length - 1);

// ---------- 가이드 / AI ----------
function renderGuide() {
  const grid = $('#sceneGrid'); grid.innerHTML = '';
  for (const [id, s] of Object.entries(SCENES)) {
    const b = document.createElement('button');
    b.className = id === state.scene ? 'on' : '';
    b.innerHTML = `<span>${s.icon}</span>${s.name}`;
    b.onclick = () => { setScene(id, 'manual'); toast(`${s.icon} ${s.name} 모드로 고정 (1분)`); };
    grid.append(b);
  }
  const tips = [...(state.aiTips || []), ...SCENES[state.scene].tips];
  $('#tipList').innerHTML = tips.map((t) => `<li>${escapeHtml(t)}</li>`).join('');
}
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

$('#btnAI').onclick = async () => {
  if (!settings.apiKey) { toast('설정에서 OpenAI API 키를 먼저 넣어주세요'); return; }
  const btn = $('#btnAI'); btn.disabled = true; btn.textContent = '🤖 분석 중… (몇 초 걸려요)';
  try {
    const f = grabFrame();
    const sm = document.createElement('canvas');
    const k = 768 / Math.max(f.width, f.height);
    sm.width = Math.round(f.width * k); sm.height = Math.round(f.height * k);
    sm.getContext('2d').drawImage(f, 0, 0, sm.width, sm.height);
    const r = await askPhotographer(settings.apiKey, sm.toDataURL('image/jpeg', 0.8), { mode: state.mode, people: state.persons.length });
    state.aiTips = r.tips || [];
    state.aiPoses = r.poses;
    state.presetManual = false; state.poseManual = false;
    setScene(r.scene, 'ai');
    setPreset(r.preset);
    const first = r.poses.find((id) => poseById(id).people === (state.mode === 'duo' ? 2 : 1));
    if (first) selectPose(first, false);
    if (r.composition && ['left', 'center', 'right'].includes(r.composition)) setComp(r.composition);
    $('#aiResult').innerHTML = `<div class="ai-box"><b>📍 ${escapeHtml(r.sceneLabel || SCENES[r.scene].name)}</b><br>추천 포즈: ${r.poses.map((id) => escapeHtml(poseById(id).name)).join(', ')}<br>색감: ${escapeHtml(PRESETS[r.preset].name)} · 구도: ${escapeHtml(COMPS.find((c) => c[0] === r.composition)?.[1] || '-')}</div>`;
    renderGuide();
  } catch (e) {
    $('#aiResult').innerHTML = `<div class="ai-box">분석 실패: ${escapeHtml(e.message)}</div>`;
  } finally { btn.disabled = false; btn.textContent = '🤖 AI 포토그래퍼에게 지금 화면 분석받기'; }
};

// ---------- 상단 버튼 ----------
function setTimer(t) {
  state.timer = t;
  $('#btnTimer b').textContent = t ? t + '초' : '끔';
  $('#btnTimer').classList.toggle('on', !!t);
}
$('#btnRatio').onclick = () => {
  const keys = Object.keys(RATIOS);
  state.ratio = keys[(keys.indexOf(state.ratio) + 1) % keys.length];
  $('#btnRatio b').textContent = state.ratio;
  layout();
};
$('#btnGrid').onclick = () => {
  const i = GRIDS.findIndex((g) => g[0] === state.grid);
  const [id, label] = GRIDS[(i + 1) % GRIDS.length];
  state.grid = id; $('#btnGrid b').textContent = label;
  toast({ thirds: '3분할: 인물·수평선을 선 위에', golden: '황금비: 조금 더 가운데로 모이는 3분할', diag: '대각선: 길·난간을 대각선에 맞추면 역동적', center: '중앙: 대칭 구도(건물·터널)에', none: '구도선 끔' }[id]);
};
$('#btnTimer').onclick = () => setTimer(TIMERS[(TIMERS.indexOf(state.timer) + 1) % TIMERS.length]);
$('#btnAuto').onclick = () => {
  state.auto = !state.auto;
  $('#btnAuto b').textContent = state.auto ? 'ON' : 'OFF';
  $('#btnAuto').classList.toggle('on', state.auto);
  toast(state.auto ? '🤖 포즈가 실루엣에 딱 맞으면 자동으로 찍어요' : '자동촬영 끔');
};
$('#btnComp').onclick = () => {
  const i = COMPS.findIndex((c) => c[0] === state.comp);
  setComp(COMPS[(i + 1) % COMPS.length][0]);
};
$('#btnFlip').onclick = async () => {
  state.facing = state.facing === 'environment' ? 'user' : 'environment';
  try { await startCamera(); } catch (e) { toast('카메라 전환 실패'); }
};
document.querySelectorAll('#modeToggle button').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
$('#btnGuide').onclick = () => { renderGuide(); $('#guide').hidden = false; };
$('#sceneChip').onclick = () => { renderGuide(); $('#guide').hidden = false; };
$('#btnSettings').onclick = () => { $('#settings').hidden = false; };
document.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => ($('#' + b.dataset.close).hidden = true)));

// 설정 바인딩
const bindCheck = (sel, key) => { const el = $(sel); el.checked = settings[key]; el.onchange = () => { settings[key] = el.checked; saveSettings(); }; };
bindCheck('#stAutoSave', 'autoSave'); bindCheck('#stSkeleton', 'skeleton'); bindCheck('#stSound', 'sound');
$('#stThreshold').value = settings.threshold;
$('#stThreshold').onchange = (e) => { settings.threshold = Math.max(60, Math.min(95, +e.target.value || 82)); saveSettings(); };
$('#stKey').value = settings.apiKey;
$('#stKey').onchange = (e) => { settings.apiKey = e.target.value.trim(); saveSettings(); };

// ---------- 시작 ----------
$('#btnStart').onclick = async () => {
  const motion = requestMotion(); // iOS는 사용자 제스처 안에서 호출해야 함
  const btn = $('#btnStart'); btn.disabled = true; btn.textContent = '카메라 여는 중…';
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('이 브라우저는 카메라를 지원하지 않아요 (HTTPS 주소로 접속했는지 확인)');
    await startCamera();
  } catch (e) {
    btn.disabled = false; btn.textContent = '다시 시도';
    const msg = e.name === 'NotAllowedError' ? '카메라 권한을 허용해 주세요 (주소창 옆 자물쇠 → 카메라 허용)' : e.message;
    toast(msg, null, 6000);
    return;
  }
  await motion;
  $('#start').hidden = true;
  requestAnimationFrame(loop);
  const ld = $('#loading'); ld.hidden = false;
  loadVision((s) => { ld.textContent = s; ld.hidden = !s; })
    .then(() => { state.visionReady = true; ld.hidden = true; toast('🤖 AI 준비 완료! 실루엣에 여친을 맞춰보세요'); })
    .catch((e) => { console.error(e); ld.textContent = 'AI 로드 실패 — 구도선·색보정은 사용 가능'; setTimeout(() => (ld.hidden = true), 5000); });
};

// 초기 렌더
setComp('right');
renderPresets();
setPreset('auto');
renderPoses();
updateSceneChip();
layout();
