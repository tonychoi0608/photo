// 상황(장면) 정의 + 온디바이스 분류 결과 → 장면 매핑

export const SCENES = {
  beach: {
    name: '바다·물가', icon: '🌊', preset: 'clear',
    solo: ['walk', 'hair', 'back', 'jump', 's-line'], duo: ['c-walk', 'c-face', 'c-backhug'],
    tips: ['수평선은 화면 위쪽 ⅓선에 맞추고, 반드시 수평!', '해를 등지면 역광 — 얼굴 노출 자동 보정해요', '바람 방향으로 머리카락이 날리게 서면 분위기 UP'],
  },
  nature: {
    name: '산·자연', icon: '⛰️', preset: 'clear',
    solo: ['back', 'walk', 'jump', 's-line', 'sit'], duo: ['c-walk', 'c-shoulder', 'c-backhug'],
    tips: ['인물은 작게, 풍경은 크게 — 인물을 ⅓선 교차점에', '사람을 화면 아래쪽에 두면 풍경이 웅장해 보여요', '길이나 능선이 인물 쪽으로 향하게 (리딩 라인)'],
  },
  flower: {
    name: '꽃·공원', icon: '🌸', preset: 'soft',
    solo: ['hair', 's-line', 'sit', 'peace', 'walk'], duo: ['c-close', 'c-backhug', 'c-shoulder'],
    tips: ['꽃을 렌즈 바로 앞에 두고 찍으면 몽환적인 전경 보케', '2배 줌으로 배경을 압축하면 꽃이 가득 차 보여요', '역광 + 꽃 = 인생샷. 얼굴 밝기는 자동 보정'],
  },
  cafe: {
    name: '카페·식당', icon: '☕', preset: 'cafe',
    solo: ['chin', 'cup', 'peace', 'sit'], duo: ['c-close', 'c-face'],
    tips: ['창가 자리! 창문 빛이 얼굴 옆에서 오게 앉히기', '상반신은 눈을 위쪽 ⅓선에, 테이블은 살짝 걸치게', '폰을 눈높이보다 살짝 높게 — 턱선이 갸름해요'],
  },
  city: {
    name: '거리·도심', icon: '🏙️', preset: 'warm',
    solo: ['walk', 'lean', 'back', 's-line', 'hair'], duo: ['c-walk', 'c-face', 'c-shoulder'],
    tips: ['골목이나 길의 선이 인물로 모이게 (소실점 구도)', '건물 세로선이 기울지 않게 폰을 수직으로', '벽이나 기둥에 기대면 자세가 자연스러워져요'],
  },
  landmark: {
    name: '명소·건물', icon: '🏛️', preset: 'auto',
    solo: ['s-line', 'back', 'walk', 'jump'], duo: ['c-shoulder', 'c-walk', 'c-backhug'],
    tips: ['건물은 반대쪽 ⅓ 영역에, 인물과 겹치지 않게', '건물 꼭대기가 잘리지 않도록 뒤로 물러나기', '폰을 낮게 들고 살짝 올려 찍으면 웅장 + 다리 길어 보임'],
  },
  indoor: {
    name: '실내', icon: '🏠', preset: 'soft',
    solo: ['sit', 'chin', 'cup', 'lean', 'peace'], duo: ['c-close', 'c-shoulder'],
    tips: ['창문 쪽을 바라보게 — 자연광이 최고의 조명', '천장 조명 바로 아래는 눈 밑 그림자가 생겨요', '배경을 단순하게 정리하면 인물이 살아요'],
  },
  sunset: {
    name: '노을·골든아워', icon: '🌅', preset: 'golden',
    solo: ['back', 'hair', 'walk', 's-line'], duo: ['c-face', 'c-backhug', 'c-walk'],
    tips: ['해를 인물 뒤 옆으로 — 머리카락에 빛 테두리', '실루엣 샷: 인물 전체를 하늘 배경에 두고 노출 낮추기', '지금이 하루 중 제일 예쁜 빛이에요, 많이 찍으세요!'],
  },
  night: {
    name: '야경·어두움', icon: '🌙', preset: 'warm',
    solo: ['s-line', 'lean', 'peace', 'chin'], duo: ['c-close', 'c-shoulder'],
    tips: ['간판·가로등 불빛이 얼굴 앞에서 오게 서기', '어두우면 흔들려요 — 타이머 3초 + 팔꿈치 고정', '배경 불빛 보케를 위해 인물과 배경 거리를 멀리'],
  },
  daily: {
    name: '일상', icon: '📷', preset: 'auto',
    solo: ['s-line', 'walk', 'hair', 'peace', 'lean'], duo: ['c-walk', 'c-close', 'c-shoulder'],
    tips: ['인물은 ⅓선 위에, 시선 방향 쪽 공간을 넓게', '전신은 발끝을 화면 아래 끝에 — 다리가 길어 보여요', '관절(무릎·발목·손목)에서 자르지 않기'],
  },
};

// ImageNet 라벨 키워드 → 장면
const KEYWORDS = {
  beach: ['seashore', 'sandbar', 'lakeside', 'breakwater', 'boathouse', 'catamaran', 'yawl', 'speedboat', 'canoe', 'paddle', 'coral reef', 'dock', 'pier', 'swimming', 'wreck', 'trimaran', 'schooner', 'swimming trunks', 'maillot', 'bikini', 'snorkel', 'sarong', 'sunscreen'],
  nature: ['alp', 'valley', 'volcano', 'cliff', 'promontory', 'geyser', 'mountain', 'hay', 'dam', 'worm fence', 'stone wall', 'hen-of-the-woods', 'mushroom', 'cairn', 'bighorn'],
  flower: ['daisy', 'rapeseed', 'slipper', 'pot', 'greenhouse', 'maze', 'hip', 'buckeye', 'fountain', 'park bench', 'picket fence', 'corn', 'strawberry', 'garden'],
  cafe: ['espresso', 'cup', 'coffee', 'restaurant', 'dining table', 'plate', 'eggnog', 'menu', 'bakery', 'ice cream', 'trifle', 'dough', 'croissant', 'bagel', 'pizza', 'burrito', 'carbonara', 'teapot', 'wine bottle', 'beer glass', 'goblet', 'red wine', 'tray', 'chocolate sauce', 'cheeseburger', 'hotdog', 'soup bowl', 'pretzel', 'french loaf', 'water jug', 'pitcher'],
  city: ['street sign', 'traffic light', 'streetcar', 'cab', 'trolleybus', 'parking meter', 'shoe shop', 'bookshop', 'toyshop', 'barbershop', 'butcher shop', 'confectionery', 'tobacco shop', 'grocery', 'minibus', 'moped', 'scooter', 'limousine', 'crosswalk', 'police van', 'bus', 'mailbox', 'turnstile', 'sliding door', 'shopping cart', 'cinema', 'prison'],
  landmark: ['palace', 'church', 'castle', 'monastery', 'mosque', 'triumphal arch', 'obelisk', 'stupa', 'bell cote', 'dome', 'library', 'planetarium', 'suspension bridge', 'steel arch bridge', 'viaduct', 'pedestal', 'megalith', 'totem pole', 'boathouse', 'thatch', 'patio', 'fountain'],
  indoor: ['studio couch', 'four-poster', 'home theater', 'window shade', 'quilt', 'desk', 'wardrobe', 'bookcase', 'china cabinet', 'rocking chair', 'folding chair', 'table lamp', 'lampshade', 'pillow', 'shower curtain', 'bathtub', 'washbasin', 'medicine chest', 'entertainment center', 'television', 'window screen', 'sliding door', 'wall clock', 'dishwasher', 'refrigerator'],
};

export function sceneFromLabels(categories) {
  const score = {};
  for (const c of categories) {
    const name = (c.categoryName || c.displayName || '').toLowerCase();
    for (const [scene, words] of Object.entries(KEYWORDS)) {
      if (words.some((w) => name.includes(w))) score[scene] = (score[scene] || 0) + c.score;
    }
  }
  let best = null, bestScore = 0.06;
  for (const [s, v] of Object.entries(score)) if (v > bestScore) { best = s; bestScore = v; }
  return { scene: best, confidence: bestScore };
}

// 밝기/색 통계로 노을·야간 판정 (분류기보다 우선)
export function sceneFromLight(stats) {
  if (stats.luma < 0.16) return 'night';
  // 상단(하늘) 영역이 따뜻하고 적당히 밝으면 노을
  if (stats.topWarmth > 1.35 && stats.topLuma > 0.25 && stats.topLuma < 0.85) return 'sunset';
  return null;
}
