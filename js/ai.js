// (선택) GPT-5.4 포토그래퍼 분석 — 사용자가 설정에 OpenAI 키를 넣었을 때만 사용
import { POSES } from './poses.js';
import { SCENES } from './scenes.js';
import { PRESETS } from './color.js';

export async function askPhotographer(apiKey, dataUrl, { mode, people }) {
  const poseList = POSES.map((p) => `${p.id}(${p.name}, ${p.people}인, ${p.frame === 'full' ? '전신' : '상반신'})`).join(', ');
  const developer = `너는 인물 사진 전문 포토그래퍼다. 사진 초보인 남자친구가 여자친구를 찍으려 한다.
카메라 프리뷰 한 장을 보고 상황을 판단해 가장 예쁘게 나올 촬영 방법을 알려줘.
Return valid JSON only. No markdown. 스키마:
{"scene": one of [${Object.keys(SCENES).join(',')}],
 "sceneLabel": "한국어 짧은 상황 설명 (예: 햇살 좋은 한강 산책로)",
 "poses": [포즈 id 3개, 추천순. 목록: ${poseList}],
 "composition": "left"|"center"|"right",
 "preset": one of [${Object.keys(PRESETS).filter((k) => k !== 'original').join(',')}],
 "tips": ["구체적인 한국어 촬영 팁 3개, 각 40자 이내. 서는 위치/빛 방향/카메라 높이/배경 정리 등"]}`;
  const user = `현재 모드: ${mode === 'duo' ? '둘이 찍기(커플)' : '혼자 찍기'}, 감지된 인원: ${people}명.`;

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-5.4',
      input: [
        { role: 'developer', content: developer },
        { role: 'user', content: [
          { type: 'input_text', text: user },
          { type: 'input_image', image_url: dataUrl, detail: 'low' },
        ] },
      ],
      reasoning: { effort: 'low' },
      text: { verbosity: 'low', format: { type: 'json_object' } },
    }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error?.message || `HTTP ${res.status}`);
  const text = j.output_text ?? (j.output || [])
    .flatMap((o) => o.content || []).filter((c) => c.type === 'output_text').map((c) => c.text).join('');
  const out = JSON.parse(text);
  out.poses = (out.poses || []).filter((id) => POSES.some((p) => p.id === id));
  if (!SCENES[out.scene]) out.scene = 'daily';
  if (!PRESETS[out.preset]) out.preset = SCENES[out.scene].preset;
  return out;
}
