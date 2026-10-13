import * as ort from 'onnxruntime-node'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import metadata from '../../../resources/onnx/firstmind.json'
import { buildRecentFirstMindFeatures, type FirstMindFeatures } from './firstmind-features'

export interface FirstMindPrediction {
  activity: string
  activity_confidence: number
  distraction_prob: number
  window_end: string
}

const labels = Object.entries(metadata.label_to_id)
  .sort((a, b) => a[1] - b[1])
  .map(([name]) => name)
let session: ort.InferenceSession | null = null
let loadFailed = false

export function resolveFirstMindModelPath(): string | null {
  const paths = [
    join(__dirname, '../../resources/onnx/firstmind.onnx'),
    join(__dirname, '../../../resources/onnx/firstmind.onnx'),
    join(process.resourcesPath ?? '.', 'onnx/firstmind.onnx')
  ]
  return paths.find((path) => existsSync(path)) ?? null
}

async function loadModel(): Promise<ort.InferenceSession | null> {
  if (session) return session
  if (loadFailed) return null
  const path = resolveFirstMindModelPath()
  if (!path) { loadFailed = true; return null }
  try {
    session = await ort.InferenceSession.create(path)
    return session
  } catch (error) {
    console.error('[firstmind] model load failed:', error)
    loadFailed = true
    return null
  }
}

export async function predictFirstMind(input?: FirstMindFeatures): Promise<FirstMindPrediction | null> {
  const model = await loadModel()
  if (!model) return null
  const window = input ?? buildRecentFirstMindFeatures()
  if (!window) return null
  try {
    const normalized = new Float32Array(window.features.length)
    for (let i = 0; i < normalized.length; i++) {
      const feature = i % metadata.feature_mean.length
      normalized[i] = (window.features[i] - metadata.feature_mean[feature]) / metadata.safe_std[feature]
    }
    const result = await model.run({
      features: new ort.Tensor('float32', normalized, [1, 6, 16]),
      padding_mask: new ort.Tensor('bool', window.padding_mask, [1, 6])
    })
    const logits = Array.from(result.logits.data as Float32Array)
    const maxLogit = Math.max(...logits)
    const probabilities = logits.map((value) => Math.exp(value - maxLogit))
    const total = probabilities.reduce((sum, value) => sum + value, 0)
    const index = probabilities.indexOf(Math.max(...probabilities))
    const confidence = probabilities[index] / total
    const entertainmentProbability = probabilities[metadata.label_to_id.entertainment] / total
    return {
      activity: labels[index] ?? 'mixed_activity',
      activity_confidence: confidence,
      // This checkpoint has no separate distraction head. Only a confident
      // entertainment prediction raises the risk score, avoiding false alarms
      // on activity patterns unlike its training samples.
      distraction_prob: labels[index] === 'entertainment' && confidence >= 0.8
        ? entertainmentProbability : 0,
      window_end: window.window_end
    }
  } catch (error) {
    console.error('[firstmind] inference failed:', error)
    return null
  }
}
