import { getDatabase } from '../storage/database'
import { localIso } from '../utils/time'
import { predict } from './onnx-runner'

// 行为模型推理编排：scheduler 每轮刷新 → 推理 → 落库 model_predictions → 供风险引擎读取

let cachedProb: number | null = null
let cachedActivity: string | null = null
let modelAvailable = false

export function isModelAvailable(): boolean {
  return modelAvailable
}

/** 当前分心概率（0-1），模型不可用时返回 null（风险引擎自动退化为纯规则） */
export function getDistractionProb(): number | null {
  if (!modelAvailable) return null
  return cachedProb
}

export function getPredictedActivity(): string | null {
  if (!modelAvailable) return null
  return cachedActivity
}

export async function refreshPrediction(): Promise<void> {
  try {
    const result = await predict()
    if (!result) {
      modelAvailable = false
      cachedProb = null
      cachedActivity = null
      return
    }

    modelAvailable = true
    cachedProb = result.distraction_prob
    cachedActivity = result.activity

    getDatabase()
      .prepare(
        `INSERT INTO model_predictions (predicted_at, window_end, activity, distraction_prob, focus_remaining, model_version)
         VALUES (?, ?, ?, ?, ?, '0.1.0')`
      )
      .run(localIso(), result.window_end, result.activity, result.distraction_prob, result.focus_remaining_minutes)
  } catch (err) {
    console.error('[predictor] refresh failed:', err)
    modelAvailable = false
  }
}
