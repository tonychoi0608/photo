// 포즈 라이브러리
// 좌표계: 전신 키 = 1.0, 머리 꼭대기 y=0, 발끝 y≈1, x는 몸 중심 0 기준 (화면 기준 좌/우)
// 키포인트: h(머리중심) ls/rs(어깨) le/re(팔꿈치) lw/rw(손목) lh/rh(골반) lk/rk(무릎) la/ra(발목)

const STAND = {
  h: [0, 0.065], ls: [-0.11, 0.18], rs: [0.11, 0.18],
  le: [-0.14, 0.33], re: [0.14, 0.33], lw: [-0.15, 0.46], rw: [0.15, 0.46],
  lh: [-0.07, 0.52], rh: [0.07, 0.52], lk: [-0.07, 0.74], rk: [0.07, 0.74],
  la: [-0.07, 0.96], ra: [0.07, 0.96],
};

const P = (over) => ({ ...STAND, ...over });
const shift = (pts, dx, dy = 0, s = 1) =>
  Object.fromEntries(Object.entries(pts).map(([k, [x, y]]) => [k, [x * s + dx, y * s + dy]]));
const pick = (pts, keys) => Object.fromEntries(keys.map((k) => [k, pts[k]]));
const UPPER = ['h', 'ls', 'rs', 'le', 're', 'lw', 'rw', 'lh', 'rh'];

// frame: 'full' 전신 / 'half' 상반신(crop = 보여줄 몸 비율)
export const POSES = [
  {
    id: 's-line', name: 'S라인 기본', people: 1, frame: 'full',
    tip: '한쪽 다리에 체중, 반대 무릎을 살짝 안으로. 한 손은 허리에!',
    people_pts: [P({
      h: [0.015, 0.065], ls: [-0.1, 0.185], rs: [0.11, 0.175],
      le: [-0.13, 0.33], lw: [-0.12, 0.47], re: [0.2, 0.35], rw: [0.085, 0.5],
      lh: [-0.09, 0.51], rh: [0.06, 0.53], lk: [-0.065, 0.74], la: [-0.055, 0.96],
      rk: [0.0, 0.75], ra: [0.04, 0.955],
    })],
  },
  {
    id: 'walk', name: '걸어오기', people: 1, frame: 'full',
    tip: '카메라 쪽으로 천천히 걸어오게 하고 연속으로 찍어요. 시선은 살짝 아래나 옆으로.',
    people_pts: [P({
      le: [-0.15, 0.33], lw: [-0.1, 0.44], re: [0.16, 0.32], rw: [0.21, 0.43],
      lk: [-0.05, 0.74], la: [-0.035, 0.975], rk: [0.1, 0.72], ra: [0.12, 0.92],
    })],
  },
  {
    id: 'hair', name: '머리 넘기기', people: 1, frame: 'full',
    tip: '한 손으로 머리카락을 쓸어 넘기는 순간을 연사로! 턱은 살짝 들고.',
    people_pts: [P({
      h: [-0.01, 0.065], re: [0.2, 0.1], rw: [0.06, 0.02], rs: [0.11, 0.17],
      le: [-0.13, 0.33], lw: [-0.11, 0.47],
      lh: [-0.08, 0.52], rh: [0.07, 0.525], rk: [0.03, 0.75], ra: [0.06, 0.96],
    })],
  },
  {
    id: 'back', name: '뒤돌아보기', people: 1, frame: 'full',
    tip: '등을 보이고 서서 어깨 너머로 카메라를 봐요. 걷다가 "여기!" 부르면 자연스러워요.',
    people_pts: [P({
      h: [0.03, 0.07], ls: [-0.1, 0.19], rs: [0.1, 0.18],
      le: [-0.125, 0.34], lw: [-0.12, 0.47], re: [0.13, 0.33], rw: [0.13, 0.47],
      lk: [-0.06, 0.745], rk: [0.05, 0.76], ra: [0.075, 0.95],
    })],
  },
  {
    id: 'lean', name: '벽에 기대기', people: 1, frame: 'full',
    tip: '어깨를 벽에 기대고 발목을 꼬아요. 손은 앞으로 가볍게 모으기.',
    people_pts: [P({
      h: [0.07, 0.065], ls: [-0.035, 0.18], rs: [0.18, 0.195],
      le: [-0.07, 0.33], lw: [0.0, 0.44], re: [0.2, 0.34], rw: [0.05, 0.45],
      lh: [-0.03, 0.52], rh: [0.1, 0.53], lk: [-0.03, 0.74], rk: [0.05, 0.75],
      la: [0.045, 0.96], ra: [-0.03, 0.965],
    })],
  },
  {
    id: 'sit', name: '계단·벤치 앉기', people: 1, frame: 'full', scale: 0.72,
    tip: '앉아서 무릎을 모으고 한쪽 발을 앞으로. 카메라는 앉은 눈높이보다 살짝 낮게.',
    people_pts: [{
      h: [0, 0.09], ls: [-0.11, 0.22], rs: [0.11, 0.22],
      le: [-0.15, 0.4], re: [0.14, 0.4], lw: [-0.07, 0.56], rw: [0.06, 0.57],
      lh: [-0.09, 0.56], rh: [0.09, 0.56], lk: [-0.1, 0.63], rk: [0.08, 0.64],
      la: [-0.1, 0.96], ra: [0.1, 0.93],
    }],
  },
  {
    id: 'jump', name: '점프!', people: 1, frame: 'full',
    tip: '"하나 둘 셋" 하고 뛸 때 연사! 무릎을 뒤로 접으면 더 높아 보여요.',
    people_pts: [P({
      le: [-0.2, 0.08], re: [0.2, 0.08], lw: [-0.26, -0.04], rw: [0.26, -0.04],
      lk: [-0.1, 0.7], rk: [0.1, 0.7], la: [-0.17, 0.83], ra: [0.17, 0.83],
    })],
  },
  {
    id: 'chin', name: '턱 괴기', people: 1, frame: 'half', crop: 0.56,
    tip: '테이블에 팔꿈치를 대고 손등 위에 턱을 살짝. 눈은 화면 위 ⅓선에.',
    people_pts: [pick(P({
      h: [0.02, 0.065], re: [0.1, 0.42], rw: [0.04, 0.14],
      le: [-0.17, 0.41], lw: [0.02, 0.45],
    }), UPPER)],
  },
  {
    id: 'cup', name: '컵 들고 미소', people: 1, frame: 'half', crop: 0.56,
    tip: '두 손으로 컵을 가슴 높이에. 컵 대신 시선은 카메라나 창밖으로.',
    people_pts: [pick(P({
      le: [-0.12, 0.36], lw: [-0.02, 0.3], re: [0.12, 0.36], rw: [0.035, 0.3],
    }), UPPER)],
  },
  {
    id: 'peace', name: '얼굴 옆 브이', people: 1, frame: 'half', crop: 0.56,
    tip: '손을 얼굴 옆에 가까이. 손이 얼굴보다 앞으로 나오면 커 보이니 옆으로!',
    people_pts: [pick(P({
      h: [-0.01, 0.065], re: [0.19, 0.25], rw: [0.11, 0.08],
      le: [-0.13, 0.33], lw: [-0.12, 0.46],
    }), UPPER)],
  },

  // ---------- 둘이 (사람 추가) ----------
  {
    id: 'c-walk', name: '손잡고 걷기', people: 2, frame: 'full',
    tip: '손잡고 앞으로 걸으면서 서로 바라보기. 촬영자는 타이머 + 거치!',
    people_pts: [
      shift(P({ rw: [0.17, 0.47], re: [0.15, 0.34], lk: [-0.05, 0.74], la: [-0.04, 0.97], rk: [0.09, 0.73], ra: [0.1, 0.93] }), -0.17),
      shift(P({ lw: [-0.17, 0.47], le: [-0.15, 0.34], rk: [0.05, 0.74], ra: [0.04, 0.97], lk: [-0.09, 0.73], la: [-0.1, 0.93], h: [0, 0.055] }), 0.17, -0.04, 1.04),
    ],
  },
  {
    id: 'c-backhug', name: '백허그', people: 2, frame: 'full',
    tip: '뒤에서 허리를 감싸 안고 어깨에 턱을 살짝. 앞사람은 손을 겹쳐 잡아요.',
    people_pts: [
      shift(P({ lw: [-0.03, 0.45], rw: [0.04, 0.45], le: [-0.12, 0.36], re: [0.12, 0.36] }), -0.03),
      shift(P({ h: [-0.06, 0.07], lw: [-0.03, 0.47], rw: [0.02, 0.46], le: [-0.17, 0.36], re: [0.17, 0.36] }), 0.07, -0.06, 1.05),
    ],
  },
  {
    id: 'c-face', name: '마주보기', people: 2, frame: 'full',
    tip: '서로 마주보고 이마가 닿을 듯 가까이. 옆모습 실루엣이 예뻐요.',
    people_pts: [
      shift(P({ h: [0.04, 0.065], ls: [-0.03, 0.18], rs: [0.05, 0.18], le: [0.0, 0.33], re: [0.09, 0.32], lw: [0.06, 0.45], rw: [0.14, 0.42], lh: [-0.04, 0.52], rh: [0.04, 0.52], lk: [-0.03, 0.74], rk: [0.04, 0.74], la: [-0.04, 0.96], ra: [0.04, 0.96] }), -0.12),
      shift(P({ h: [-0.04, 0.065], ls: [-0.05, 0.18], rs: [0.03, 0.18], le: [-0.09, 0.32], re: [0.0, 0.33], lw: [-0.14, 0.42], rw: [-0.06, 0.45], lh: [-0.04, 0.52], rh: [0.04, 0.52], lk: [-0.04, 0.74], rk: [0.03, 0.74], la: [-0.04, 0.96], ra: [0.04, 0.96] }), 0.12, -0.05, 1.05),
    ],
  },
  {
    id: 'c-shoulder', name: '어깨 기대기', people: 2, frame: 'full',
    tip: '한 명이 어깨에 머리를 기대고, 다른 한 명은 팔로 감싸요.',
    people_pts: [
      shift(P({ h: [0.05, 0.09], ls: [-0.1, 0.19], rs: [0.11, 0.2] }), -0.12),
      shift(P({ lw: [-0.2, 0.23], le: [-0.13, 0.28] }), 0.12, -0.05, 1.05),
    ],
  },
  {
    id: 'c-close', name: '볼 맞대기', people: 2, frame: 'half', crop: 0.56,
    tip: '볼이나 머리를 맞대고 같은 방향 보기. 서로 기대면 표정이 자연스러워요.',
    people_pts: [
      pick(shift(P({ h: [0.05, 0.07], le: [-0.14, 0.33], lw: [-0.13, 0.46] }), -0.1), UPPER),
      pick(shift(P({ h: [-0.05, 0.07], re: [0.14, 0.33], rw: [0.13, 0.46] }), 0.1, -0.02), UPPER),
    ],
  },
];

export const poseById = (id) => POSES.find((p) => p.id === id);

// 뼈대 연결
export const LIMBS = [
  ['ls', 'le'], ['le', 'lw'], ['rs', 're'], ['re', 'rw'],
  ['lh', 'lk'], ['lk', 'la'], ['rh', 'rk'], ['rk', 'ra'],
];

// 포즈 썸네일 SVG
export function poseSVG(pose, size = 56) {
  const all = pose.people_pts.flatMap((pts) => Object.values(pts));
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const minX = Math.min(...xs) - 0.1, maxX = Math.max(...xs) + 0.1;
  const minY = Math.min(...ys) - 0.1, maxY = Math.max(...ys) + 0.06;
  const w = maxX - minX, h = maxY - minY, s = Math.max(w, h);
  const vb = `${(minX + maxX) / 2 - s / 2} ${(minY + maxY) / 2 - s / 2} ${s} ${s}`;
  let body = '';
  for (const pts of pose.people_pts) {
    const line = (a, b) => (pts[a] && pts[b])
      ? `<line x1="${pts[a][0]}" y1="${pts[a][1]}" x2="${pts[b][0]}" y2="${pts[b][1]}"/>` : '';
    const torso = ['ls', 'rs', 'rh', 'lh'].every((k) => pts[k])
      ? `<polygon points="${['ls', 'rs', 'rh', 'lh'].map((k) => pts[k].join(',')).join(' ')}"/>`
      : `<line x1="${pts.ls[0]}" y1="${pts.ls[1]}" x2="${pts.rs[0]}" y2="${pts.rs[1]}"/>`;
    body += torso + LIMBS.map(([a, b]) => line(a, b)).join('') +
      `<circle cx="${pts.h[0]}" cy="${pts.h[1]}" r="0.065"/>`;
  }
  return `<svg viewBox="${vb}" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <g fill="currentColor" stroke="currentColor" stroke-width="0.055" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;
}
