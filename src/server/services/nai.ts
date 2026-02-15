import { unzipSync } from 'fflate'
import type { ResolvedPrompts } from './prompt'

const NAI_API_URL = 'https://image.novelai.net/ai/generate-image'

interface GenerationParams {
  width?: number
  height?: number
  steps?: number
  cfg_scale?: number
  cfg_rescale?: number
  sampler?: string
  scheduler?: string
  seed?: number
  smea?: boolean
  smea_dyn?: boolean
  variety?: boolean
  qualityToggle?: boolean
  ucPreset?: number
  imageFormat?: string
  characterPositionEnabled?: boolean
}

export async function generateImage(
  apiKey: string,
  prompts: ResolvedPrompts,
  params: GenerationParams,
): Promise<{ imageData: Uint8Array; seed: number }> {
  const seed = params.seed ?? Math.floor(Math.random() * 2 ** 32)
  const useCoords = params.characterPositionEnabled ?? false

  // Build v4_prompt char_captions from character prompts
  const charCaptions = prompts.characterPrompts.map((cp) => ({
    char_caption: cp.prompt,
    centers: [{ x: 0, y: 0 }],
  }))

  const negCharCaptions = prompts.characterPrompts.map((cp) => ({
    char_caption: cp.negative,
    centers: [{ x: 0, y: 0 }],
  }))

  const body = {
    input: prompts.generalPrompt,
    model: 'nai-diffusion-4-full',
    action: 'generate',
    parameters: {
      prompt: prompts.generalPrompt,
      negative_prompt: prompts.negativePrompt,
      width: params.width ?? 832,
      height: params.height ?? 1216,
      n_samples: 1,
      steps: params.steps ?? 28,
      cfg_scale: params.cfg_scale ?? 5,
      cfg_rescale: params.cfg_rescale ?? 0,
      sampler: params.sampler ?? 'k_euler_ancestral',
      scheduler: params.scheduler ?? 'native',
      noise_schedule: params.scheduler ?? 'native',
      seed,
      smea: params.smea ?? false,
      smea_dyn: params.smea_dyn ?? false,
      variety: params.variety ?? false,
      qualityToggle: params.qualityToggle ?? true,
      ucPreset: params.ucPreset ?? 3,
      params_version: 3,
      legacy_v3_extend: false,
      image_format: params.imageFormat ?? 'png',
      v4_prompt: {
        caption: {
          base_caption: prompts.generalPrompt,
          char_captions: charCaptions,
        },
        use_coords: useCoords,
        use_order: true,
      },
      v4_negative_prompt: {
        caption: {
          base_caption: prompts.negativePrompt,
          char_captions: negCharCaptions,
        },
      },
      characterPrompts: prompts.characterPrompts.map((cp) => ({
        prompt: cp.prompt,
        negative: cp.negative,
        enabled: true,
        position: { x: 0, y: 0 },
      })),
      characterPositionEnabled: useCoords,
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
