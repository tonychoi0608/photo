// 자동 색보정 엔진: 화이트밸런스 → 레벨 → 노출/톤커브 → 바이브런스(피부 보호) → 글로우/비네팅

export const PRESETS = {
  original: { name: '원본', css: 'none' },
  auto: {
    name: '자동 보정', wb: 0.75, temp: 0, tint: 0, contrast: 0.12, fade: 0, vibrance: 0.18, sat: 0,
    glow: 0, vignette: 0.08, css: 'contrast(1.05) saturate(1.1)',
  },
  warm: {
    name: '따뜻한 필름', wb: 0.6, temp: 0.06, tint: 0.01, contrast: 0.16, fade: 0.05, vibrance: 0.08, sat: -0.06,
    glow: 0.08, vignette: 0.14, css: 'sepia(0.15) contrast(1.06) saturate(1.02) brightness(1.02)',
  },
  clear: {
    name: '청량', wb: 0.8, temp: -0.035, tint: -0.005, contrast: 0.1, fade: 0, vibrance: 0.32, sat: 0.04,
    glow: 0, vignette: 0.04, exposure: 0.05, css: 'saturate(1.3) contrast(1.05) brightness(1.05) hue-rotate(-4deg)',
  },
  cafe: {
    name: '카페 무드', wb: 0.55, temp: 0.05, tint: 0.012, contrast: 0.02, fade: 0.07, vibrance: -0.02, sat: -0.12,
    glow: 0.1, vignette: 0.1, exposure: 0.04, css: 'sepia(0.18) saturate(0.9) contrast(0.97) brightness(1.04)',
  },
  golden: {
    name: '골든아워', wb: 0.3, temp: 0.09, tint: 0.015, contrast: 0.14, fade: 0.02, vibrance: 0.2, sat: 0.05,
    glow: 0.16, vignette: 0.15, css: 'sepia(0.25) saturate(1.25) contrast(1.05)',
  },
  soft: {
    name: '뽀샤시', wb: 0.7, temp: 0.015, tint: 0.02, contrast: -0.04, fade: 0.04, vibrance: 0.05, sat: -0.04,
    glow: 0.24, vignette: 0, exposure: 0.08, css: 'brightness(1.08) contrast(0.94) saturate(1.02)',
  },
  mono: {
    name: '흑백', wb: 0.7, temp: 0, tint: 0, contrast: 0.22, fade: 0.03, vibrance: 0, sat: -1,
    glow: 0.05, vignette: 0.18, css: 'grayscale(1) contrast(1.15)',
  },
};

const clamp = (v, a = 0, b = 255) => (v < a ? a : v > b ? b : v);
const lumaOf = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

function analyze(data) {
  const hist = new Uint32Array(256);
  let sr = 0, sg = 0, sb = 0, n = 0;
  const step = Math.max(4, Math.floor(data.length / 4 / 250000) * 4); // 최대 ~25만 픽셀 샘플
  for (let i = 0; i < data.length; i += step) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const y = lumaOf(r, g, b);
    hist[y | 0]++;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    // 중간 밝기 + 저채도 픽셀만으로 화이트밸런스 추정 (gray-world 변형)
    if (y > 40 && y < 225 && mx - mn < 70) { sr += r; sg += g; sb += b; n++; }
  }
  let total = 0; for (const c of hist) total += c;
  const pct = (p) => { let acc = 0; for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= total * p) return i; } return 255; };
  let mean = 0; for (let i = 0; i < 256; i++) mean += i * hist[i]; mean /= total;
  return {
    black: pct(0.004), white: pct(0.996), mean, median: pct(0.5),
    avg: n > 50 ? [sr / n, sg / n, sb / n] : null,
  };
}

function buildLUTs(st, p, strength, opts) {
  // 1) 화이트밸런스 게인
  let gains = [1, 1, 1];
  if (st.avg && p.wb) {
    const gray = (st.avg[0] + st.avg[1] + st.avg[2]) / 3;
    gains = st.avg.map((c) => clamp(gray / c, 0.82, 1.22));
    gains = gains.map((g) => 1 + (g - 1) * p.wb * strength);
  }
  // 색온도/틴트
  const t = (p.temp || 0) * strength, tn = (p.tint || 0) * strength;
  gains[0] *= 1 + t + tn * 0.5; gains[1] *= 1 - tn; gains[2] *= 1 - t * 1.2 + tn * 0.5;

  // 2) 레벨 (과도한 스트레치 방지)
  const bp = Math.min(st.black, 28) * strength;
  const wp = 255 - (255 - Math.max(st.white, 200)) * strength;

  // 3) 노출: 어두운 사진/역광은 중간톤 끌어올리기
  const midAfter = clamp((st.median - bp) / (wp - bp), 0.02, 0.98);
  let targetMid = 0.46 + (p.exposure || 0);
  if (opts.backlit) targetMid += 0.06;
  let gamma = 1;
  // v^gamma 로 중간톤 이동 (gamma<1 밝게, >1 어둡게)
  if (midAfter < targetMid - 0.04) {
    gamma = clamp(Math.log(targetMid) / Math.log(midAfter), 0.55, 1);
  } else if (midAfter > 0.8) {
    // 해변·눈처럼 원래 밝은 장면은 그대로 두고, 확실히 날아간 경우만 살짝 누름
    gamma = clamp(Math.log(0.72) / Math.log(midAfter), 1, 1.15);
  } else if (p.exposure && midAfter < targetMid + 0.1) {
    gamma = clamp(Math.log(midAfter + p.exposure) / Math.log(midAfter), 0.8, 1);
  }
  gamma = 1 + (gamma - 1) * strength;

  const c = (p.contrast || 0) * strength, fade = (p.fade || 0) * strength;
  const shadowLift = opts.backlit ? 0.12 * strength : 0;

  const luts = [new Uint8ClampedArray(256), new Uint8ClampedArray(256), new Uint8ClampedArray(256)];
  for (let ch = 0; ch < 3; ch++) {
    for (let i = 0; i < 256; i++) {
      let v = (i * gains[ch] - bp) / (wp - bp);
      v = clamp(v, 0, 1);
      v = Math.pow(v, gamma);
      if (shadowLift) v = v + shadowLift * v * (1 - v) * (1 - v) * 2.2; // 그림자만 들어올림
      // S커브 (c>0 대비↑, c<0 대비↓)
      const s = v < 0.5 ? 2 * v * v : 1 - 2 * (1 - v) * (1 - v);
      v = v + (s - v) * c * 2;
      // 하이라이트 롤오프 (날아가지 않게)
      if (v > 0.9) v = 0.9 + (v - 0.9) * 0.85;
      v = fade + v * (1 - fade * 1.4);
      luts[ch][i] = clamp(Math.round(v * 255));
    }
  }
  return luts;
}

function isSkin(r, g, b) {
  return r > 95 && g > 40 && b > 20 && r > g && r > b && r - Math.min(g, b) > 15 && Math.abs(r - g) > 12;
}

// src: canvas (원본). 반환: 새 canvas (보정본)
export function applyPreset(src, presetId, { strength = 1, backlit = false } = {}) {
  const out = document.createElement('canvas');
  out.width = src.width; out.height = src.height;
  const ctx = out.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0);
  const p = PRESETS[presetId];
  if (!p || presetId === 'original') return out;

  const img = ctx.getImageData(0, 0, out.width, out.height);
  const d = img.data;
  const st = analyze(d);
  const [lr, lg, lb] = buildLUTs(st, p, strength, { backlit });
  const vib = (p.vibrance || 0) * strength, sat = (p.sat || 0) * strength;
  const mono = p.sat <= -1;

  for (let i = 0; i < d.length; i += 4) {
    let r = lr[d[i]], g = lg[d[i + 1]], b = lb[d[i + 2]];
    if (mono) {
      const y = lumaOf(r, g, b) * 1.02; r = g = b = y;
    } else if (vib || sat) {
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const y = lumaOf(r, g, b);
      let amt = sat + vib * (1 - (mx - mn) / 255);
      if (amt > 0 && isSkin(r, g, b)) amt *= 0.35; // 피부는 과포화 방지
      r = y + (r - y) * (1 + amt); g = y + (g - y) * (1 + amt); b = y + (b - y) * (1 + amt);
    }
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  ctx.putImageData(img, 0, 0);

  // 글로우: 축소→확대로 만든 블러를 screen 블렌딩
  const glow = (p.glow || 0) * strength;
  if (glow > 0) {
    const sm = document.createElement('canvas');
    const k = Math.max(out.width, out.height) / 48;
    sm.width = Math.max(1, Math.round(out.width / k)); sm.height = Math.max(1, Math.round(out.height / k));
    const sctx = sm.getContext('2d');
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(out, 0, 0, sm.width, sm.height);
    ctx.save();
    ctx.globalAlpha = glow;
    ctx.globalCompositeOperation = 'screen';
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sm, 0, 0, out.width, out.height);
    ctx.restore();
  }
  // 비네팅
  const vg = (p.vignette || 0) * strength;
  if (vg > 0) {
    const w = out.width, h = out.height;
    const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) / 2);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(0,0,0,${vg})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }
  return out;
}
