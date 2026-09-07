import * as ort from 'onnxruntime-node'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { buildRecentWindow, type BehaviorWindow } from './feature-builder'

// ONNX 推理（设计文档 11.3）：加载 behavior_model.onnx，输入最近 128 分钟行为序列

export interface PredictionResult {
  activity: string
  activity_confidence: number
  distraction_prob: number
  focus_remaining_minutes: number
  window_end: string
}

const CATEGORY_LIST = [
  'study_document',
  'study_code',
  'study_video',
  'communication',
  'entertainment',
  'music',
  'browsing_other',
  'away',
  'unknown'
]

let session: ort.InferenceSession | null = null
let loadFailed = false

export function resolveModelPath(): string | null {
  const candidates = [
    join(__dirname, '../../resources/onnx/behavior_model.onnx'), // dev/preview
    join(process.resourcesPath ?? '.', 'onnx/behavior_model.onnx') // 打包后 extraResources
  ]
  return candidates.find((p) => existsSync(p)) ?? null
}

export function isModelLoaded(): boolean {
  return session !== null
}

export async function loadModel(): Promise<boolean> {
  if (session) return true
  if (loadFailed) return false
  const path = resolveModelPath()
  if (!path) {
    loadFailed = true
    return false
  }
  try {
    session = await ort.InferenceSession.create(path)
    return true
  } catch (err) {
    console.error('[onnx-runner] load failed:', err)
    loadFailed = true
    return false
  }
}

export async function predict(window?: BehaviorWindow): Promise<PredictionResult | null> {
  if (!(await loadModel())) return null
  const input = window ?? buildRecentWindow()
  if (!input) return null

  try {
    const feeds = {
      x_num: new ort.Tensor('float32', input.x_num, [1, 128, 7]),
      x_cat: new ort.Tensor('int64', input.x_cat, [1, 128])
    }
    const results = await session!.run(feeds)

    const logits = results.activity_logits.data as Float32Array
    let maxIdx = 0
    let maxVal = -Infinity
    for (let i = 0; i < logits.length; i++) {
      if (logits[i] > maxVal) {
        maxVal = logits[i]
        maxIdx = i
      }
    }
    // softmax 置信度
    const exps = Array.from(logits, Math.exp)
    const sumExp = exps.reduce((a, b) => a + b, 0)

    return {
      activity: CATEGORY_LIST[maxIdx] ?? 'unknown',
      activity_confidence: exps[maxIdx] / sumExp,
      distraction_prob: (results.distraction_prob.data as Float32Array)[0],
      focus_remaining_minutes: (results.duration_pred.data as Float32Array)[0] * 120,
      window_end: input.window_end
    }
  } catch (err) {
    console.error('[onnx-runner] inference failed:', err)
    return null
  }
}
