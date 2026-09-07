// 行为模型推理接口（设计文档 11.3）
// M3 阶段接入 onnxruntime-node；未导出模型前返回 null（规则引擎独立工作）。

let cachedProb: number | null = null
let modelAvailable = false

export function isModelAvailable(): boolean {
  return modelAvailable
}

/** 当前分心概率（0-1），模型不可用时返回 null */
export function getDistractionProb(): number | null {
  if (!modelAvailable) return null
  return cachedProb
}

/** scheduler 每轮刷新时调用；M3 在此调用 onnx-runner */
export function refreshPrediction(_featureSource?: unknown): void {
  // TODO(M3): 特征序列 → ONNX 推理 → activity/distraction_prob
  cachedProb = null
  modelAvailable = false
}
