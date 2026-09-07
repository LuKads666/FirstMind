import { getDatabase } from './database'
import { todayDateString } from '../utils/time'

// 今日统计与画像基础数据（设计文档 9.3 / 19.2）

export interface TodayStats {
  focus_minutes: number
  entertainment_minutes: number
  study_minutes: number
  active_minutes: number
  session_count: number
  current_category: string
}

const FOCUS_CATEGORIES = ['study_document', 'study_code', 'study_video']
const STUDY_ALL = [...FOCUS_CATEGORIES]
const FUN_CATEGORIES = ['entertainment']

export function getTodayStats(currentCategory = 'unknown'): TodayStats {
  const db = getDatabase()
  const today = todayDateString()
  const rows = db
    .prepare(
      `SELECT category, started_at, ended_at, activity_ratio FROM app_sessions
       WHERE date(started_at) = ?`
    )
    .all(today) as Array<{ category: string; started_at: string; ended_at: string | null; activity_ratio: number }>

  let focus_seconds = 0
  let entertainment_seconds = 0
  let study_seconds = 0
  let active_seconds = 0

  for (const r of rows) {
    const start = new Date(r.started_at).getTime()
    const end = r.ended_at ? new Date(r.ended_at).getTime() : Date.now()
    const seconds = Math.max(0, (end - start) / 1000)
    if (FOCUS_CATEGORIES.includes(r.category)) focus_seconds += seconds
    if (STUDY_ALL.includes(r.category)) study_seconds += seconds
    if (FUN_CATEGORIES.includes(r.category)) entertainment_seconds += seconds
    if (r.activity_ratio > 0.2) active_seconds += seconds
  }

  const sessionCount = db
    .prepare('SELECT COUNT(*) AS n FROM app_sessions WHERE date(started_at) = ?')
    .get(today) as { n: number }

  return {
    focus_minutes: Math.round(focus_seconds / 60),
    entertainment_minutes: Math.round(entertainment_seconds / 60),
    study_minutes: Math.round(study_seconds / 60),
    active_minutes: Math.round(active_seconds / 60),
    session_count: sessionCount.n,
    current_category: currentCategory
  }
}

// 最近连续专注分钟数：当前若处于学习类会话，取该会话起点到现在的分钟数
export function getCurrentFocusMinutes(currentCategory: string): number {
  if (!currentCategory.startsWith('study_')) return 0
  const row = getDatabase()
    .prepare(
      `SELECT started_at FROM app_sessions
       WHERE category LIKE 'study_%' AND date(started_at) = ?
       ORDER BY started_at DESC LIMIT 1`
    )
    .get(todayDateString()) as { started_at: string } | undefined
  if (!row) return 0
  return Math.max(0, Math.round((Date.now() - new Date(row.started_at).getTime()) / 60000))
}
