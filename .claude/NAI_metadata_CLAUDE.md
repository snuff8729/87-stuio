## NAI4 Request 구조

NAI4 이미지 생성 API의 Request 파라미터 인터페이스.

### 핵심 파라미터
- `prompt`, `negative_prompt`: 프롬프트 텍스트
- `model`, `width`, `height`, `steps`, `cfg_scale`, `cfg_rescale`, `sampler`, `scheduler`, `seed`
- `smea`, `smea_dyn`, `variety`: boolean 옵션
- `qualityToggle`: Quality Tags 자동 추가 여부
- `ucPreset`: Undesired Content 프리셋 (0=Heavy, 1=Light, 2=Furry, 3=Human, 4=None)
- `imageFormat`: 'png' | 'webp'

### V4 Prompt 구조 (필수)
NAI v4 모델은 `parameters` 내에 `v4_prompt`와 `v4_negative_prompt` 필드가 **필수**이다.

```ts
v4_prompt: {
  caption: {
    base_caption: string,           // general prompt 텍스트
    char_captions: Array<{
      char_caption: string,         // 캐릭터 prompt 텍스트
      centers: Array<{ x: number, y: number }>  // 캐릭터 위치 (use_coords: false면 무시됨)
    }>
  },
  use_coords: boolean,              // 캐릭터 위치 지정 사용 여부
  use_order: boolean,               // 캐릭터 순서 사용 여부 (보통 true)
}

v4_negative_prompt: {
  caption: {
    base_caption: string,           // negative prompt 텍스트
    char_captions: Array<{
      char_caption: string,         // 캐릭터 negative prompt 텍스트
      centers: Array<{ x: number, y: number }>
    }>
  },
}
```

- `characterPrompts[]`는 UI 레벨 파라미터이며, API 전송 시 `v4_prompt`/`v4_negative_prompt`의 `char_captions`로 변환해야 함
- `char_captions` 배열 순서는 `characterPrompts` 배열 순서와 일치해야 함
- `use_coords: false`일 때 `centers`는 `[{ x: 0, y: 0 }]`로 설정

### Precise Reference (Director Tools)
- `charImages`, `charStrength[]`, `charFidelity[]`, `charReferenceType[]`, `charCacheKeys[]`
- charFidelity는 API 전송 시 `1 - fidelity`로 변환
- charReferenceType: 'character' | 'style' | 'character&style'

### Vibe Transfer
- `vibeImages[]`, `vibeInfo[]`, `vibeStrength[]`, `preEncodedVibes[]`
- preEncodedVibes가 있으면 /ai/encode-vibe 호출 스킵

### Character Prompts (UI 레벨)
- `characterPrompts[]`: { prompt, negative, enabled, position: {x, y} }
- `characterPositionEnabled`: 위치 기능 활성화 여부
- API 전송 시 `v4_prompt.caption.char_captions`와 `v4_negative_prompt.caption.char_captions`로 변환 필요

### I2I / Inpainting
- `sourceImage` (base64), `strength` (0~1), `noise` (0~1)
- `mask` (base64, white=inpaint 영역)
