import { unzipSync } from 'fflate'
import type { ResolvedPrompts } from './prompt'

const NAI_API_URL = 'https://image.novelai.net/ai/generate-image'

interface GenerationParams {
  width?: number
  height?: number
  steps?: number
  scale?: number
  cfgRescale?: number
  sampler?: string
  scheduler?: string
  seed?: number
  autoSmea?: boolean
  qualityToggle?: boolean
  ucPreset?: number
  imageFormat?: string
}

export async function generateImage(
  apiKey: string,
  prompts: ResolvedPrompts,
  params: GenerationParams,
): Promise<{ imageData: Uint8Array; seed: number }> {
  const seed = params.seed ?? Math.floor(Math.random() * 2 ** 32)

  // Build v4_prompt char_captions from character prompts
  const charCaptions = prompts.characterPrompts.map((cp) => ({
    char_caption: cp.prompt,
    centers: [{ x: 0.5, y: 0.5 }],
  }))

  const negCharCaptions = prompts.characterPrompts.map((cp) => ({
    char_caption: cp.negative,
    centers: [{ x: 0.5, y: 0.5 }],
  }))

  const body = {
    input: prompts.generalPrompt,
    model: 'nai-diffusion-4-5-curated',
    action: 'generate',
    parameters: {
      add_original_image: true,
      autoSmea: params.autoSmea,
      cfg_rescale: params.cfgRescale,
      characterPrompts: prompts.characterPrompts.map((cp) => ({
        center: { x: 0.5, y: 0.5 },
        enabled: true,
        prompt: cp.prompt,
        uc: cp.negative,
      })),
      controlnet_strength: 1,
      deliberate_euler_ancestral_bug: false,
      dynamic_thresholding: false,
      height: params.height ?? 1216,
      image_format: params.imageFormat ?? "png",
      inpaintImg2ImgStrength: 1,
      legacy: false,
      legacy_uc: false,
      legacy_v3_extend: false,
      n_samples: 1,
      negative_prompt: prompts.negativePrompt,
      noise_schedule: params.scheduler ?? "karras",
      normalize_reference_strength_multiple: true,
      params_version: 3,
      prefer_brownian: true,
      qualityToggle: params.qualityToggle ?? true,
      sampler: params.sampler ?? "k_euler_ancestral",
      scale: params.scale ?? 5,
      seed: seed,
      skip_cfg_above_sigma: null,
      steps: params.steps ?? 23,
      ucPreset: params.ucPreset ?? 0,
      use_coords: false,
      v4_prompt: {
        caption: {
          base_caption: prompts.generalPrompt,
          char_captions: charCaptions,
        },
        use_coords: false,
        use_order: true
      },
      v4_negative_prompt: {
        caption: {
          base_caption: prompts.negativePrompt,
          char_captions: negCharCaptions,
        },
        legacy_uc: false
      },
      // width: params.width ?? 832,
      // height: params.height ?? 1216,
      // n_samples: 1,
      // seed,
      // prompt: prompts.generalPrompt,
      // negative_prompt: prompts.negativePrompt,
      // steps: params.steps ?? 28,
      // scale: params.cfg_scale ?? 5,
      // cfg_rescale: params.cfg_rescale ?? 0,
      // sampler: params.sampler ?? 'k_euler_ancestral',
      // scheduler: params.scheduler ?? 'karras',
      // noise_schedule: params.scheduler ?? 'karras',
      // extra_noise_seed: seed,
      // smea: params.smea ?? true,
      // smea_dyn: params.smea_dyn ?? true,
      // variety: params.variety ?? false,
      // qualityToggle: params.qualityToggle ?? true,
      // ucPreset: params.ucPreset ?? 0,
      // params_version: 3,
      // legacy_v3_extend: false,
      // image_format: params.imageFormat ?? 'png',
      // v4_prompt: {
      //   caption: {
      //     base_caption: prompts.generalPrompt,
      //     char_captions: charCaptions,
      //   },
      //   use_coords: useCoords,
      //   use_order: true,
      // },
      // v4_negative_prompt: {
      //   caption: {
      //     base_caption: prompts.negativePrompt,
      //     char_captions: negCharCaptions,
      //   },
      // },
      // characterPrompts: prompts.characterPrompts.map((cp) => ({
      //   prompt: cp.prompt,
      //   negative: cp.negative,
      //   enabled: true,
      //   position: { x: 0, y: 0 },
      // })),
      // characterPositionEnabled: useCoords,
    },
  }

  console.log('[NAI] Request body:', JSON.stringify(body, null, 2))

  const response = await fetch(NAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`NAI API error ${response.status}: ${text}`)
  }

  const zipData = new Uint8Array(await response.arrayBuffer())
  const files = unzipSync(zipData)

  // Extract the first image file from the ZIP
  const imageEntry = Object.entries(files).find(([name]) =>
    /\.(png|webp|jpg|jpeg)$/i.test(name),
  )
  if (!imageEntry) throw new Error('No image found in NAI API response')

  return { imageData: imageEntry[1], seed }
}
