// 구도 코칭: 실루엣 배치, 포즈 일치도 점수, 실시간 안내 메시지
import { MAP } from './vision.js';

const PAIRS = [['ls', 'rs', MAP.s], ['le', 're', MAP.e], ['lw', 'rw', MAP.w], ['lh', 'rh', MAP.hp], ['lk', 'rk', MAP.k], ['la', 'ra', MAP.a]];
const COMP_X = { left: 1 / 3, center: 0.5, right: 2 / 3 };

// 포즈 → 화면 좌표(u,v: 0~1) 실루엣 배치
export function placeGhost(pose, compPos, aspect) {
  const couple = pose.people > 1;
  const all = pose.people_pts.flatMap((p) => Object.values(p));
  const minY = Math.min(...all.map((p) => p[1])), maxY = Math.max(...all.map((p) => p[1]));
  const minX = Math.min(...all.map((p) => p[0])), maxX = Math.max(...all.map((p) => p[0]));
  let H, v0;
  if (pose.frame === 'half') {
    H = 0.9 / (pose.crop || 0.56);
    v0 = 0.1 - Math.min(0, minY) * H;
  } else {
    H = (couple ? 0.7 : 0.76) * (pose.scale || 1);
    // 가로 화면에선 조금 작게
    if (aspect > 1) H *= 0.92;
    v0 = 0.955 - (maxY + 0.02) * H;
  }
  const cxUnits = (minX + maxX) / 2;
  const cx = COMP_X[compPos] ?? 0.5;
  const people = pose.people_pts.map((pts) => {
    const o = {};
    for (const [k, [x, y]] of Object.entries(pts)) o[k] = [cx + ((x - cxUnits) * H) / aspect, v0 + y * H];
    return o;
  });
  return { people, H, headR: 0.065 * H };
}

// MediaPipe 랜드마크 → 화면좌표 인물
export function toPerson(lm, mapPoint) {
  const p = { raw: {}, vis: {} };
  const get = (i) => { const [u, v] = mapPoint(lm[i].x, lm[i].y); return { u, v, vis: lm[i].visibility ?? 1 }; };
  p.nose = get(0);
  p.raw.h = [p.nose.u, p.nose.v - 0.02]; p.vis.h = p.nose.vis;
  for (const [a, b, [i, j]] of PAIRS) {
    const A = get(i), B = get(j);
    // 화면상 왼쪽 점을 l로
    const [L, R] = A.u <= B.u ? [A, B] : [B, A];
    p.raw[a] = [L.u, L.v]; p.vis[a] = L.vis;
    p.raw[b] = [R.u, R.v]; p.vis[b] = R.vis;
  }
  const xs = Object.values(p.raw).map((q) => q[0]);
  p.cx = xs.reduce((s, x) => s + x, 0) / xs.length;
  return p;
}

const inFrame = ([u, v]) => u > -0.02 && u < 1.02 && v > -0.02 && v < 1.02;
const f = (e, s) => Math.exp(-((e / s) ** 2));

function matchOne(det, ghost, aspect) {
  const keys = Object.keys(ghost).filter((k) => det.raw[k] && det.vis[k] > 0.5 && inFrame(det.raw[k]));
  if (keys.length < 5) return { score: 0, keys: keys.length };
  // 좌우 쌍은 실루엣과 더 가까운 쪽으로 재배정 (다리 꼬기 등 대응)
  const pts = { ...det.raw };
  const d2 = (a, b) => ((a[0] - b[0]) * aspect) ** 2 + (a[1] - b[1]) ** 2;
  for (const [a, b] of PAIRS) {
    if (!ghost[a] || !ghost[b]) continue;
    if (d2(pts[a], ghost[b]) + d2(pts[b], ghost[a]) < d2(pts[a], ghost[a]) + d2(pts[b], ghost[b])) {
      [pts[a], pts[b]] = [pts[b], pts[a]];
    }
  }
  const norm = (set) => {
    const P = keys.map((k) => [set[k][0] * aspect, set[k][1]]);
    const c = P.reduce((s, p) => [s[0] + p[0] / P.length, s[1] + p[1] / P.length], [0, 0]);
    const sc = Math.sqrt(P.reduce((s, p) => s + (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2, 0) / P.length) || 1e-6;
    return { P: P.map((p) => [(p[0] - c[0]) / sc, (p[1] - c[1]) / sc]), c, sc };
  };
  const D = norm(pts), G = norm(ghost);
  const shape = D.P.reduce((s, p, i) => s + Math.hypot(p[0] - G.P[i][0], p[1] - G.P[i][1]), 0) / keys.length;
  const dx = (D.c[0] - G.c[0]) / aspect, dy = D.c[1] - G.c[1];
  const pos = Math.hypot(D.c[0] - G.c[0], dy);
  const scale = Math.log(D.sc / G.sc);
  const coverage = Math.min(1, keys.length / (Object.keys(ghost).length * 0.8));
  // 인식 흔들림·체형 차이만큼은 봐주고(허용치), 그 이상 벗어나면 급격히 감점
  const dz = (e, tol) => Math.max(0, Math.abs(e) - tol);
  const score = 100 * coverage * f(dz(shape, 0.05), 0.14) * f(dz(pos, 0.025), 0.07) * f(dz(scale, 0.08), 0.2);
  return { score, shape, dx, dy, scale, keys: keys.length };
}

export function matchScore(persons, placed, aspect) {
  if (!persons.length) return { score: 0, parts: [] };
  const ghosts = placed.people;
  const dets = [...persons].sort((a, b) => a.cx - b.cx);
  if (ghosts.length === 1) {
    // 여러 명이면 실루엣에 가장 잘 맞는 사람
    const parts = dets.map((d) => matchOne(d, ghosts[0], aspect));
    const best = parts.reduce((a, b) => (b.score > a.score ? b : a));
    return { score: best.score, parts: [best] };
  }
  if (dets.length < 2) {
    const one = matchOne(dets[0], ghosts[dets[0].cx < 0.5 ? 0 : 1], aspect);
    return { score: one.score * 0.4, parts: [one] };
  }
  const parts = ghosts.map((g, i) => matchOne(dets[i], g, aspect));
  return { score: parts.reduce((s, p) => s + p.score, 0) / parts.length, parts };
}

// 우선순위 기반 안내 메시지
export function coachMessage({ persons, pose, match, tilt, light, mode, scoreGood }) {
  const couple = mode === 'duo';
  if (!persons.length) {
    return { level: 'info', text: couple ? '두 사람 모두 화면 안으로 들어와 주세요' : '인물을 화면에 담아주세요 — 실루엣 위치에 세워요' };
  }
  if (couple && persons.length < 2) {
    return { level: 'info', text: '한 명 더! 타이머 10초 켜고 폰을 세워두면 둘이 같이 찍을 수 있어요', action: 'timer' };
  }
  // 머리 잘림
  for (const p of persons) {
    const sh = (p.raw.ls[1] + p.raw.rs[1]) / 2;
    const headTop = p.nose.v - 0.8 * Math.max(0.01, sh - p.nose.v);
    if (p.nose.vis > 0.5 && headTop < 0.005) return { level: 'warn', text: '머리가 잘려요! 카메라를 살짝 위로 올리거나 뒤로 물러나요', arrow: 'up' };
  }
  const full = pose ? pose.frame === 'full' : true;
  if (full) {
    for (const p of persons) {
      const ankleOk = p.vis.la > 0.45 && p.vis.ra > 0.45 && Math.max(p.raw.la[1], p.raw.ra[1]) < 1.0;
      const kneeV = Math.max(p.raw.lk[1], p.raw.rk[1]);
      if (!ankleOk && p.vis.lk > 0.5 && kneeV > 0.85 && kneeV < 1.05) {
        return { level: 'warn', text: '✂️ 무릎에서 잘렸어요 — 관절에서 자르면 어색해요. 발끝까지 담거나 허벅지 중간에서 자르기', arrow: 'back' };
      }
      if (!ankleOk && p.vis.lk > 0.5 && kneeV < 0.85) {
        return { level: 'warn', text: '✂️ 발목이 잘렸어요 — 발끝까지 다 담아야 다리가 길어 보여요', arrow: 'down' };
      }
    }
  }
  const part = match.parts?.[0];
  if (pose && part && part.keys >= 5) {
    if (part.scale > 0.2) return { level: 'warn', text: '한 걸음 뒤로 물러나요 (인물이 실루엣보다 커요)', arrow: 'back' };
    if (part.scale < -0.2) return { level: 'warn', text: '한 걸음 앞으로 다가가요 (인물이 실루엣보다 작아요)', arrow: 'fwd' };
    if (Math.abs(part.dx) > 0.05) {
      const dir = part.dx > 0 ? 'right' : 'left';
      return { level: 'warn', text: `카메라를 ${dir === 'right' ? '오른쪽 →' : '← 왼쪽'}으로 살짝 돌려요 (인물을 실루엣 위치에)`, arrow: dir };
    }
    if (Math.abs(part.dy) > 0.05) {
      const dir = part.dy > 0 ? 'down' : 'up';
      return { level: 'warn', text: dir === 'down' ? '카메라를 살짝 아래로 기울여요 ↓' : '카메라를 살짝 위로 기울여요 ↑', arrow: dir };
    }
  }
  if (tilt && Math.abs(tilt.roll) > 2.5) {
    return { level: 'warn', text: `수평이 ${Math.abs(tilt.roll).toFixed(0)}° 기울었어요 — 가운데 수평선이 초록색이 되게`, arrow: 'level' };
  }
  if (full && tilt && tilt.pitchDown > 18) {
    return { level: 'warn', text: '내려다보면 다리가 짧아 보여요 — 폰을 허리 높이로 내리고 살짝 위로 향하게', arrow: 'down' };
  }
  if (light?.dark) return { level: 'info', text: '🌙 어두워요 — 빛 쪽을 보게 하고, 흔들림 방지로 타이머 3초 추천' };
  if (light?.backlit) return { level: 'info', text: '🌅 역광이에요 — 얼굴 밝기는 자동 보정할게요. 빛 테두리가 예뻐요!' };
  if (match.score >= scoreGood) return { level: 'good', text: '✨ 완벽해요! 지금 찍으세요' };
  if (pose) return { level: 'info', text: `${pose.name}: ${pose.tip}` };
  return { level: 'good', text: '좋아요! 인물이 ⅓선 위에 있으면 더 좋아요' };
}
