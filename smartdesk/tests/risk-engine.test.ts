import { describe, expect, it } from 'vitest'
import {
  evaluateRisks,
  levelForScore,
  isInDoNotDisturb,
  type RiskContext
} from '../src/main/engine/risk-engine'

function ctx(overrides: Partial<RiskContext> = {}): RiskContext {
  return {
    now: new Date('2026-09-07T20:30:00'),
    tasks: [{ id: 1, title: '实验报告', due_at: '2026-09-09T23:00:00', status: 'open' }],
    current_category: 'entertainment',
    current_session_minutes: 20,
    entertainment_minutes_today: 120,
    focus_minutes_today: 30,
    profile: { avg_focus_minutes: 40, delay_factor: 0.3 },
    model_distraction_prob: null,
    last_notified: {},
    ignored_counts: {},
    do_not_disturb: false,
    ...overrides
  }
}

describe('levelForScore 阈值分级', () => {
  it('0-0.3 不提醒，0.3-0.6 桌面，0.6-0.8 气泡，>0.8 置顶', () => {
    expect(levelForScore(0.2)).toBe('none')
    expect(levelForScore(0.45)).toBe('desktop')
    expect(levelForScore(0.7)).toBe('bubble')
    expect(levelForScore(0.95)).toBe('alert')
  })
})

describe('勿扰时段', () => {
  it('23:30-07:30 不主动提醒', () => {
    expect(isInDoNotDisturb(new Date('2026-09-07T23:30:00'))).toBe(true)
    expect(isInDoNotDisturb(new Date('2026-09-08T03:00:00'))).toBe(true)
    expect(isInDoNotDisturb(new Date('2026-09-07T20:30:00'))).toBe(false)
  })
  it('勿扰开关打开时返回空', () => {
    expect(evaluateRisks(ctx({ do_not_disturb: true }))).toHaveLength(0)
  })
})

describe('activity_mismatch 与 ddl_near', () => {
  it('娱乐中 + 48h DDL + 模型高分 → bubble（气泡+语音轻提醒，文档演示场景）', () => {
    const risks = evaluateRisks(ctx({ model_distraction_prob: 0.9 }))
    const mismatch = risks.find((r) => r.risk_type === 'activity_mismatch')
    expect(mismatch).toBeDefined()
    expect(mismatch!.level).toBe('bubble')
  })

  it('临近截止（2h）+ 娱乐 + 模型高分 → alert 置顶', () => {
    const risks = evaluateRisks(
      ctx({
        tasks: [{ id: 1, title: '实验报告', due_at: '2026-09-07T22:30:00', status: 'open' }],
        model_distraction_prob: 0.9
      })
    )
    const mismatch = risks.find((r) => r.risk_type === 'activity_mismatch')
    expect(mismatch?.level).toBe('alert')
  })

  it('学习状态中临近 DDL 只给 ddl_near 桌面提示', () => {
    const risks = evaluateRisks(
      ctx({
        current_category: 'study_code',
        current_session_minutes: 30,
        tasks: [{ id: 1, title: '实验报告', due_at: '2026-09-07T22:30:00', status: 'open' }]
      })
    )
    expect(risks.some((r) => r.risk_type === 'activity_mismatch')).toBe(false)
    expect(risks.some((r) => r.risk_type === 'ddl_near')).toBe(true)
  })

  it('72 小时外的 DDL 不提醒', () => {
    const risks = evaluateRisks(
      ctx({ tasks: [{ id: 2, title: '四级', due_at: '2026-11-15T09:00:00', status: 'open' }] })
    )
    expect(risks).toHaveLength(0)
  })
})

describe('long_entertainment', () => {
  it('娱乐超阈值且有待办触发', () => {
    const risks = evaluateRisks(
      ctx({ current_category: 'entertainment', current_session_minutes: 45 })
    )
    expect(risks.some((r) => r.risk_type === 'long_entertainment')).toBe(true)
  })
  it('娱乐时间不足不触发', () => {
    const risks = evaluateRisks(
      ctx({ current_category: 'entertainment', current_session_minutes: 10 })
    )
    expect(risks.some((r) => r.risk_type === 'long_entertainment')).toBe(false)
  })
})

describe('focus_overrun', () => {
  it('连续专注超均值 1.5 倍建议休息', () => {
    const risks = evaluateRisks(
      ctx({
        current_category: 'study_document',
        current_session_minutes: 70,
        tasks: []
      })
    )
    expect(risks.some((r) => r.risk_type === 'focus_overrun')).toBe(true)
  })
})

describe('提醒纪律', () => {
  it('同一风险 30 分钟内冷却', () => {
    const base = ctx()
    const first = evaluateRisks(base)
    expect(first.length).toBeGreaterThan(0)
    const again = evaluateRisks(
      ctx({
        last_notified: { [`${first[0].risk_type}:${first[0].task_id ?? 0}`]: '2026-09-07T20:15:00' }
      })
    )
    expect(again.some((r) => r.risk_type === first[0].risk_type)).toBe(false)
  })

  it('忽略 3 次后 alert 降级为 desktop', () => {
    const risks = evaluateRisks(ctx({ ignored_counts: { '1': 3 }, model_distraction_prob: 0.9 }))
    const mismatch = risks.find((r) => r.risk_type === 'activity_mismatch')
    expect(mismatch?.level).toBe('desktop')
  })
})
