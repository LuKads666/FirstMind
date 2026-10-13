import { getDatabase } from '../storage/database'
import { getCurrentSessionSnapshot } from '../collectors/runtime'
import { localIso } from '../utils/time'
import type { SessionRecord } from '../collectors/collector'

// FirstMind feature-builder.js: six consecutive five-minute windows, each with
// twelve category ratios plus activity, switches, idle, and coverage.
export const FIRSTMIND_SEQUENCE_LENGTH = 6
export const FIRSTMIND_FEATURE_COUNT = 16
const WINDOW_MS = 5 * 60_000
const CATEGORIES = [
  'development', 'study', 'office', 'browser', 'communication', 'entertainment',
  'game', 'media', 'file', 'system', 'network', 'unknown'
] as const
type FirstMindCategory = (typeof CATEGORIES)[number]

export interface FirstMindSession {
  started_at: string
  ended_at: string
  app_name: string
  category: string
  activity_ratio: number
}

export interface FirstMindTick {
  tick_time: string
  idle_seconds: number
}

export interface FirstMindFeatures {
  features: Float32Array
  padding_mask: Uint8Array
  window_end: string
}

function firstMindCategory(session: FirstMindSession): FirstMindCategory {
  const app = session.app_name.toLowerCase()
  switch (session.category) {
    case 'study_code': return 'development'
    case 'study_document':
    case 'study_video': return 'study'
    case 'communication': return 'communication'
    case 'music': return 'media'
    case 'browsing_other': return 'browser'
    case 'away': return 'system'
    case 'entertainment':
      return /steam|epicgames|reliccardinal|valorant|genshin|leagueoflegends|game/.test(app)
        ? 'game' : 'entertainment'
    default: return 'unknown'
  }
}

export function buildFirstMindFeatures(
  sessions: FirstMindSession[],
  ticks: FirstMindTick[],
  now = new Date()
): FirstMindFeatures | null {
  const endMs = Math.floor(now.getTime() / WINDOW_MS) * WINDOW_MS
  const startMs = endMs - FIRSTMIND_SEQUENCE_LENGTH * WINDOW_MS
  const features = new Float32Array(FIRSTMIND_SEQUENCE_LENGTH * FIRSTMIND_FEATURE_COUNT)

  for (let i = 0; i < FIRSTMIND_SEQUENCE_LENGTH; i++) {
    const windowStart = startMs + i * WINDOW_MS
    const windowEnd = windowStart + WINDOW_MS
    const overlaps = sessions
      .map((session) => ({
        session,
        start: Math.max(Date.parse(session.started_at), windowStart),
        end: Math.min(Date.parse(session.ended_at), windowEnd),
        sessionEnd: Date.parse(session.ended_at)
      }))
      .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start)
      .sort((a, b) => a.start - b.start)

    const durations = new Map<FirstMindCategory, number>()
    let observed = 0
    let active = 0
    let switches = 0
    for (let j = 0; j < overlaps.length; j++) {
      const item = overlaps[j]
      const duration = item.end - item.start
      observed += duration
      active += duration * Math.max(0, Math.min(1, item.session.activity_ratio))
      const category = firstMindCategory(item.session)
      durations.set(category, (durations.get(category) ?? 0) + duration)
      if (j > 0 && item.start - overlaps[j - 1].sessionEnd <= 2000) switches++
    }

    const coverage = Math.min(1, observed / WINDOW_MS)
    // The teammate's checkpoint was trained on nearly complete windows.
    if (coverage < 0.5) return null
    const offset = i * FIRSTMIND_FEATURE_COUNT
    CATEGORIES.forEach((category, index) => {
      features[offset + index] = observed > 0 ? (durations.get(category) ?? 0) / observed : 0
    })
    features[offset + 12] = observed > 0 ? active / observed : 0
    features[offset + 13] = switches
    features[offset + 14] = Math.min(300, Math.max(0, ...ticks
      .filter((tick) => {
        const t = Date.parse(tick.tick_time)
        return t >= windowStart && t < windowEnd
      })
      .map((tick) => Number(tick.idle_seconds) || 0)))
    features[offset + 15] = coverage
  }

  return { features, padding_mask: new Uint8Array(FIRSTMIND_SEQUENCE_LENGTH), window_end: localIso(new Date(endMs)) }
}

export function buildRecentFirstMindFeatures(now = new Date()): FirstMindFeatures | null {
  const endMs = Math.floor(now.getTime() / WINDOW_MS) * WINDOW_MS
  const start = localIso(new Date(endMs - FIRSTMIND_SEQUENCE_LENGTH * WINDOW_MS))
  const end = localIso(new Date(endMs))
  const db = getDatabase()
  const sessions = db.prepare(
    `SELECT started_at, ended_at, app_name, category, activity_ratio FROM app_sessions
     WHERE ended_at > ? AND started_at < ?`
  ).all(start, end) as FirstMindSession[]
  const current = getCurrentSessionSnapshot(now) as SessionRecord | null
  if (current) sessions.push(current)
  const ticks = db.prepare(
    `SELECT tick_time, idle_seconds FROM activity_ticks WHERE tick_time >= ? AND tick_time < ?`
  ).all(start, end) as FirstMindTick[]
  return buildFirstMindFeatures(sessions, ticks, now)
}
