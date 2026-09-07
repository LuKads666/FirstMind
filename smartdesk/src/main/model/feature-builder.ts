import { getDatabase } from '../storage/database'
import { localIso } from '../utils/time'

// 特征构建（设计文档 10.2/10.3）：最近 128 个一分钟时间片 → 模型输入
// 特征顺序与 python-training/features.py / feature_config.json 严格一致

export const SEQ_LEN = 128
export const NUM_FEATURES = 7

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
] as const

export interface BehaviorWindow {
  x_num: Float32Array // [SEQ_LEN * NUM_FEATURES]
  x_cat: BigInt64Array // [SEQ_LEN]
  window_end: string
}

export function buildRecentWindow(now = new Date()): BehaviorWindow | null {
  const db = getDatabase()

  // 以当前分钟为终点，取最近 128 分钟
  const endMinute = new Date(now)
  endMinute.setSeconds(0, 0)
  const startMinute = new Date(endMinute.getTime() - (SEQ_LEN - 1) * 60000)

  const startStr = localIso(startMinute).slice(0, 16)
  const endStr = localIso(endMinute).slice(0, 16)

  const sessions = db
    .prepare(
      `SELECT started_at, ended_at, category FROM app_sessions
       WHERE ended_at IS NULL OR (ended_at >= ? AND started_at <= ?)`
    )
    .all(startStr, endStr + 'z') as Array<{
    started_at: string
    ended_at: string | null
    category: string
  }>

  const ticks = db
    .prepare(`SELECT tick_time, input_active, idle_seconds, is_locked FROM activity_ticks WHERE tick_time >= ? AND tick_time <= ?`)
    .all(startStr, endStr + 'z') as Array<{
    tick_time: string
    input_active: number
    idle_seconds: number
    is_locked: number
  }>

  const tickMap = new Map<string, { active: number; idle: number; locked: number }>()
  for (const t of ticks) {
    tickMap.set(t.tick_time.slice(0, 16), {
      active: Number(t.input_active) || 0,
      idle: Number(t.idle_seconds) || 0,
      locked: Number(t.is_locked) || 0
    })
  }

  const x_num = new Float32Array(SEQ_LEN * NUM_FEATURES)
  const x_cat = new BigInt64Array(SEQ_LEN)

  for (let i = 0; i < SEQ_LEN; i++) {
    const minute = new Date(startMinute.getTime() + i * 60000)
    const key = localIso(minute).slice(0, 16)

    // 该分钟所属类别：按时间查找覆盖该分钟的会话
    let category: string = 'unknown'
    for (const s of sessions) {
      const st = s.started_at.slice(0, 16)
      const en = (s.ended_at ?? endStr + 'z').slice(0, 16)
      if (key >= st && key <= en) {
        category = s.category
        break
      }
    }

    const tick = tickMap.get(key)
    const active = tick ? tick.active : 0
    const idle = tick ? tick.idle : 120
    const locked = tick ? tick.locked : key < localIso(now).slice(0, 13) ? 0 : 0

    const hour = minute.getHours() + minute.getMinutes() / 60
    const o = i * NUM_FEATURES
    x_num[o + 0] = Math.sin((2 * Math.PI * hour) / 24)
    x_num[o + 1] = Math.cos((2 * Math.PI * hour) / 24)
    x_num[o + 2] = minute.getDay() === 0 || minute.getDay() === 6 ? 1 : 0
    x_num[o + 3] = active
    x_num[o + 4] = Math.min(idle, 1800) / 1800
    x_num[o + 5] = locked
    x_num[o + 6] = 0 // file_events 暂未接入采集

    const catId = CATEGORY_LIST.indexOf(category as (typeof CATEGORY_LIST)[number])
    x_cat[i] = BigInt(catId >= 0 ? catId : CATEGORY_LIST.indexOf('unknown'))
  }

  return { x_num, x_cat, window_end: localIso(endMinute) }
}
