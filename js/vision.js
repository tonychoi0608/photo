// 온디바이스 AI: MediaPipe 포즈 인식 + 장면 분류 (브라우저에서 실행, 서버 불필요)
const VER = '0.10.14';
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VER}`;
const POSE_MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const CLS_MODEL = 'https://storage.googleapis.com/mediapipe-models/image_classifier/efficientnet_lite0/float32/1/efficientnet_lite0.tflite';

let pose = null, classifier = null;

export async function loadVision(onStatus = () => {}) {
  onStatus('AI 모델 불러오는 중…');
  const { FilesetResolver, PoseLandmarker, ImageClassifier } = await import(`${CDN}/vision_bundle.mjs`);
  const fileset = await FilesetResolver.forVisionTasks(`${CDN}/wasm`);

  const makePose = (delegate) => PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: POSE_MODEL, delegate },
    runningMode: 'VIDEO', numPoses: 2,
    minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
  });
  try { pose = await makePose('GPU'); } catch { pose = await makePose('CPU'); }
  onStatus('장면 인식 모델 불러오는 중…');
  try {
    classifier = await ImageClassifier.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: CLS_MODEL }, runningMode: 'IMAGE', maxResults: 10,
    });
  } catch (e) { console.warn('분류기 로드 실패', e); }
  onStatus('');
  return true;
}

// MediaPipe 인덱스 → 앱 키포인트 (좌우는 화면 기준으로 나중에 정렬)
const MAP = { h: 0, s: [11, 12], e: [13, 14], w: [15, 16], hp: [23, 24], k: [25, 26], a: [27, 28] };

let lastTs = -1;
export function detectPose(video, ts) {
  if (!pose || video.readyState < 2) return null;
  if (ts <= lastTs) ts = lastTs + 1;
  lastTs = ts;
  const res = pose.detectForVideo(video, ts);
  return (res.landmarks || []).map((lm) => lm);
}

export function classify(canvas) {
  if (!classifier) return [];
  const res = classifier.classify(canvas);
  return res.classifications?.[0]?.categories || [];
}

export { MAP };
