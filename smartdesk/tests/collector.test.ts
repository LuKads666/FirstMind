import { describe, expect, it } from 'vitest'
import { BehaviorCollector, type SessionRecord, type SessionStore, type TickRecord } from '../src/main/collectors/collector'

class MemoryStore implements SessionStore {
  sessions: SessionRecord[] = []
  ticks: TickRecord[] = []
  insertSession(r: SessionRecord): void {
    this.sessions.push(r)
  }
  insertTick(r: TickRecord): void {
    this.ticks.push(r)
  }
}

function makeClock(startMs: number) {
  let t = startMs
  return () => {
    const d = new Date(t)
    t += 1000
    return d
  }
}

const CODE = { process_id: 100, process_name: 'Code.exe', window_title: 'report.docx - VS Code' }
const GAME = { process_id: 200, process_name: 'RelicCardinal.exe', window_title: 'Age of Empires IV' }
const ACTIVE = { idle_seconds: 5, is_locked: false, input_active: true }
const IDLE = { idle_seconds: 300, is_locked: false, input_active: false }
const LOCKED = { idle_seconds: 0, is_locked: true, input_active: false }

describe('BehaviorCollector 会话聚合', () => {
  it('连续同一窗口合并为一个会话并计算活跃比例', () => {
    const store = new MemoryStore()
    const collector = new BehaviorCollector(store, makeClock(Date.now()))

    collector.sample(CODE, ACTIVE)
    collector.sample(CODE, ACTIVE)
    collector.sample(CODE, IDLE)
    collector.sample(CODE, ACTIVE)

    const current = collector.getCurrentSession()
    expect(current?.category).toBe('study_document')
    expect(current?.activity_ratio).toBeCloseTo(3 / 4)

    expect(store.sessions).toHaveLength(0) // 未切换窗口前不落库
    collector.flush()
    expect(store.sessions).toHaveLength(1)
    expect(store.sessions[0].category).toBe('study_document')
    expect(store.sessions[0].activity_ratio).toBeCloseTo(3 / 4)
  })

  it('窗口切换产生两个会话，类别映射正确', () => {
    const store = new MemoryStore()
    const collector = new BehaviorCollector(store, makeClock(Date.now()))

    collector.sample(CODE, ACTIVE)
    collector.sample(GAME, ACTIVE)

    expect(store.sessions).toHaveLength(1)
    expect(store.sessions[0].category).toBe('study_document')
    expect(collector.getState().currentCategory).toBe('entertainment')
    collector.flush()
    expect(store.sessions).toHaveLength(2)
    expect(store.sessions[1].category).toBe('entertainment')
  })

  it('锁屏结束会话且类别为 away', () => {
    const store = new MemoryStore()
    const collector = new BehaviorCollector(store, makeClock(Date.now()))

    const first = collector.sample(CODE, ACTIVE)
    expect(first).toBe('study_document')
    const locked = collector.sample(CODE, LOCKED)
    expect(locked).toBe('away')
    expect(store.sessions).toHaveLength(1)
    expect(collector.getState().currentCategory).toBe('away')
  })

  it('跨分钟边界写入 activity_ticks', () => {
    const store = new MemoryStore()
    // 从 10:59:58 开始走钟
    const base = new Date()
    base.setHours(10, 59, 58, 0)
    const collector = new BehaviorCollector(store, makeClock(base.getTime()))

    collector.sample(CODE, ACTIVE) // 10:59:58
    collector.sample(CODE, ACTIVE) // 10:59:59
    collector.sample(CODE, IDLE) // 11:00:00 → 上一分钟落 tick

    expect(store.ticks).toHaveLength(1)
    expect(store.ticks[0].tick_time.endsWith('T10:59')).toBe(true)
    expect(store.ticks[0].input_active).toBeCloseTo(1)
  })

  it('无前台窗口（锁定/切换瞬间）不建立会话', () => {
    const store = new MemoryStore()
    const collector = new BehaviorCollector(store, makeClock(Date.now()))
    collector.sample(null, LOCKED)
    collector.flush()
    expect(store.sessions).toHaveLength(0)
  })
})
