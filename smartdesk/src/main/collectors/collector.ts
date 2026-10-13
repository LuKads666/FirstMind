import type { AppCategory } from './category-mapper'
import { mapCategory } from './category-mapper'
import { localIso } from '../utils/time'

// 采集调度器（设计文档 8.2/8.3/10.1）
// 每秒采样一次前台窗口与活跃度：
//   - 会话聚合：同一进程+标题连续 → 一条 app_sessions（含活跃比例）
//   - 分钟时间片：每分钟聚合为一条 activity_ticks
// 存储通过 SessionStore 接口注入，便于单元测试。

export interface SessionRecord {
  started_at: string
  ended_at: string
  app_name: string
  process_id: number
  window_title: string
  category: AppCategory
  activity_ratio: number
}

export interface TickRecord {
  tick_time: string
  input_active: number
  idle_seconds: number
  is_locked: number
}

export interface SessionStore {
  insertSession(record: SessionRecord): void
  insertTick(record: TickRecord): void
}

export interface ForegroundSample {
  process_id: number
  process_name: string
  window_title: string
}

export interface ActivitySampleInput {
  idle_seconds: number
  is_locked: boolean
  input_active: boolean
}

export interface CollectorState {
  currentCategory: AppCategory
  currentSessionStartedAt: string | null
  lastSampleAt: string | null
}

const ACTIVE_IDLE_SECONDS = 60

export class BehaviorCollector {
  private store: SessionStore
  private now: () => Date

  private current: {
    process_id: number
    process_name: string
    window_title: string
    category: AppCategory
    started_at: Date
    active_samples: number
    total_samples: number
  } | null = null

  private minute: {
    key: string
    active_samples: number
    total_samples: number
    last_idle_seconds: number
    locked: boolean
  } | null = null

  constructor(
    store: SessionStore,
    now: () => Date = () => new Date(),
    private readonly classify: (processName: string, windowTitle: string) => AppCategory = mapCategory
  ) {
    this.store = store
    this.now = now
  }

  /** 每秒调用一次；返回发生翻转时的类别（供 UI 事件），否则 null */
  sample(foreground: ForegroundSample | null, activity: ActivitySampleInput): AppCategory | null {
    const now = this.now()
    let flipped: AppCategory | null = null

    this.advanceMinuteIfNeeded(now, activity)

    const locked = activity.is_locked
    const category: AppCategory = locked ? 'away' : this.classify(foreground?.process_name ?? '', foreground?.window_title ?? '')

    // 锁屏/无前台窗口：结束当前会话
    if (locked || !foreground) {
      this.closeSession(now)
      return category === 'away' ? 'away' : null
    }

    const sameSession =
      this.current !== null &&
      this.current.process_id === foreground.process_id &&
      this.current.window_title === foreground.window_title &&
      this.current.category === category

    if (!sameSession) {
      this.closeSession(now)
      this.current = {
        process_id: foreground.process_id,
        process_name: foreground.process_name,
        window_title: foreground.window_title,
        category,
        started_at: now,
        active_samples: 0,
        total_samples: 0
      }
      flipped = category
    }

    if (this.current) {
      this.current.total_samples += 1
      if (activity.input_active) this.current.active_samples += 1
    }

    if (this.minute) {
      this.minute.total_samples += 1
      if (activity.input_active) this.minute.active_samples += 1
      this.minute.last_idle_seconds = activity.idle_seconds
      if (locked) this.minute.locked = true
    }

    return flipped
  }

  /** 定时器停止/应用退出时调用，flush 未结束的会话与时间片 */
  flush(): void {
    const now = this.now()
    this.closeSession(now)
    this.closeMinute(now)
  }

  getState(): CollectorState {
    return {
      currentCategory: this.current?.category ?? 'away',
      currentSessionStartedAt: this.current ? localIso(this.current.started_at) : null,
      lastSampleAt: null
    }
  }

  getCurrentSession(now = this.now()): SessionRecord | null {
    const c = this.current
    if (!c) return null
    return {
      started_at: localIso(c.started_at),
      ended_at: localIso(now),
      app_name: c.process_name,
      process_id: c.process_id,
      window_title: c.window_title,
      category: c.category,
      activity_ratio: c.total_samples > 0 ? c.active_samples / c.total_samples : 0
    }
  }

  private closeSession(now: Date): void {
    if (!this.current) return
    const c = this.current
    this.store.insertSession({
      started_at: localIso(c.started_at),
      ended_at: localIso(now),
      app_name: c.process_name,
      process_id: c.process_id,
      window_title: c.window_title,
      category: c.category,
      activity_ratio: c.total_samples > 0 ? c.active_samples / c.total_samples : 0
    })
    this.current = null
  }

  private advanceMinuteIfNeeded(now: Date, activity: ActivitySampleInput): void {
    const key = minuteKey(now)
    if (!this.minute) {
      this.minute = { key, active_samples: 0, total_samples: 0, last_idle_seconds: activity.idle_seconds, locked: activity.is_locked }
      return
    }
    if (this.minute.key !== key) {
      this.closeMinute(now)
      this.minute = { key, active_samples: 0, total_samples: 0, last_idle_seconds: activity.idle_seconds, locked: activity.is_locked }
    }
  }

  private closeMinute(_now: Date): void {
    if (!this.minute) return
    const m = this.minute
    if (m.total_samples > 0) {
      this.store.insertTick({
        tick_time: m.key,
        input_active: m.active_samples / m.total_samples,
        idle_seconds: m.last_idle_seconds,
        is_locked: m.locked ? 1 : 0
      })
    }
    this.minute = null
  }
}

function minuteKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day}T${h}:${min}`
}
