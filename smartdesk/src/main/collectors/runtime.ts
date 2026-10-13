import { readActivity } from './activity'
import { readForegroundWindow } from './foreground'
import {
  BehaviorCollector,
  type CollectorState,
  type SessionRecord,
  type SessionStore,
  type TickRecord
} from './collector'
import { getDatabase } from '../storage/database'
import { ActivityResolver } from './activity-resolver'
import { activityResolutionStore } from './activity-resolution-store'
import { classifyActivityWithOllama } from './activity-model'

// 采集器运行时：SQLite 存储适配 + 1 秒轮询 + 状态广播

let collector: BehaviorCollector | null = null
let timer: NodeJS.Timeout | null = null
let lastState: CollectorState = { currentCategory: 'away', currentSessionStartedAt: null, lastSampleAt: null }
let onFlip: ((category: string) => void) | null = null
let lastEnrichmentKey = ''
let runId = 0
let enrichmentVersion = 0

const sqliteStore: SessionStore = {
  insertSession(record: SessionRecord): void {
    getDatabase()
      .prepare(
        `INSERT INTO app_sessions (started_at, ended_at, app_name, process_id, window_title, category, activity_ratio)
         VALUES (@started_at, @ended_at, @app_name, @process_id, @window_title, @category, @activity_ratio)`
      )
      .run(record)
  },
  insertTick(record: TickRecord): void {
    getDatabase()
      .prepare(
        `INSERT INTO activity_ticks (tick_time, input_active, idle_seconds, is_locked)
         VALUES (@tick_time, @input_active, @idle_seconds, @is_locked)
         ON CONFLICT(tick_time) DO UPDATE SET input_active = excluded.input_active,
           idle_seconds = excluded.idle_seconds, is_locked = excluded.is_locked`
      )
      .run(record)
  }
}

export function startCollector(callbacks?: { onFlip?: (category: string) => void }): void {
  if (timer) return
  const activeResolver = new ActivityResolver(activityResolutionStore)
  collector = new BehaviorCollector(sqliteStore, () => new Date(),
    (processName, title) => activeResolver.resolve(processName, title).category)
  onFlip = callbacks?.onFlip ?? null
  const currentRun = ++runId

  timer = setInterval(() => {
    if (!collector) return
    try {
      const fg = readForegroundWindow()
      const activity = readActivity()
      if (fg && !activity.is_locked) {
        const key = `${fg.process_name}\0${fg.window_title}`
        if (key !== lastEnrichmentKey) {
          lastEnrichmentKey = key
          const initial = activeResolver.resolve(fg.process_name, fg.window_title)
          if (initial.needsModel) {
            const requestVersion = enrichmentVersion
            void classifyActivityWithOllama(fg.process_name, fg.window_title, initial.category)
              .then((verdict) => {
                if (currentRun === runId && requestVersion === enrichmentVersion && verdict) {
                  activeResolver.learn(fg.process_name, fg.window_title, verdict)
                }
              })
              .catch((err) => console.error('[activity-resolver] model judgment failed:', err))
          }
        }
      } else {
        lastEnrichmentKey = ''
      }
      const flipped = collector.sample(
        fg ? { process_id: fg.process_id, process_name: fg.process_name, window_title: fg.window_title } : null,
        activity
      )
      lastState = collector.getState()
      if (flipped) onFlip?.(flipped)
    } catch (err) {
      console.error('[collector] sample failed:', err)
    }
  }, 1000)
}

export function stopCollector(): void {
  runId++
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  collector?.flush()
  collector = null
  lastEnrichmentKey = ''
}

export function getCollectorState(): CollectorState {
  return lastState
}

export function getCurrentSessionSnapshot(now = new Date()): SessionRecord | null {
  return collector?.getCurrentSession(now) ?? null
}

export function resetActivityResolutionState(): void {
  enrichmentVersion++
  lastEnrichmentKey = ''
}
