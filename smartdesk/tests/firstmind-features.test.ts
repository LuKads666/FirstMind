import { describe, expect, it } from 'vitest'
import { buildFirstMindFeatures, type FirstMindSession } from '../src/main/model/firstmind-features'
import { predictFirstMind } from '../src/main/model/firstmind-runner'

const end = new Date(2026, 8, 7, 12, 30)
const start = new Date(end.getTime() - 30 * 60_000)
const local = (date: Date): string => {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

describe('FirstMind 6×5-minute feature adapter', () => {
  it('maps a complete game session to the teammate model feature order', () => {
    const sessions: FirstMindSession[] = [{
      started_at: local(start), ended_at: local(end), app_name: 'RelicCardinal.exe',
      category: 'entertainment', activity_ratio: 0.8
    }]
    const ticks = Array.from({ length: 30 }, (_, i) => ({
      tick_time: local(new Date(start.getTime() + i * 60_000)).slice(0, 16), idle_seconds: 12
    }))
    const result = buildFirstMindFeatures(sessions, ticks, end)
    expect(result).not.toBeNull()
    expect(result!.features).toHaveLength(96)
    for (let i = 0; i < 6; i++) {
      const row = Array.from(result!.features.slice(i * 16, i * 16 + 16))
      expect(row[6]).toBe(1) // game
      expect(row[12]).toBeCloseTo(0.8) // activity_ratio
      expect(row[13]).toBe(0) // switch_count
      expect(row[14]).toBe(12) // max_idle_seconds
      expect(row[15]).toBe(1) // coverage_ratio
    }
  })

  it('waits for six sufficiently observed windows before predicting', () => {
    const sessions: FirstMindSession[] = [{
      started_at: local(new Date(end.getTime() - 5 * 60_000)), ended_at: local(end),
      app_name: 'Code.exe', category: 'study_code', activity_ratio: 1
    }]
    expect(buildFirstMindFeatures(sessions, [], end)).toBeNull()
  })

  it('runs the exported FirstMind checkpoint with the adapted sequence', async () => {
    const input = buildFirstMindFeatures([{
      started_at: local(start), ended_at: local(end), app_name: 'Code.exe',
      category: 'study_code', activity_ratio: 1
    }], [], end)
    const prediction = await predictFirstMind(input!)
    expect(prediction).not.toBeNull()
    expect(['focused_work', 'mixed_activity', 'entertainment']).toContain(prediction!.activity)
    expect(prediction!.distraction_prob).toBeGreaterThanOrEqual(0)
    expect(prediction!.distraction_prob).toBeLessThanOrEqual(1)
  })
})
