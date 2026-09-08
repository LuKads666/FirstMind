import { getDatabase } from './database'
import { localIso } from '../utils/time'

// 专注会话（设计文档 9 focus_sessions / 场景 4.4）：开始/结束落库

export interface FocusSessionRow {
  id: number
  started_at: string
  ended_at: string | null
  task_id: number | null
  minutes: number
  completed: number
}

export function startFocusSession(taskId: number | null): FocusSessionRow {
  const { lastInsertRowid } = getDatabase()
    .prepare(
      `INSERT INTO focus_sessions (started_at, ended_at, task_id, minutes, completed)
       VALUES (?, NULL, ?, 0, 0)`
    )
    .run(localIso(), taskId)
  return {
    id: Number(lastInsertRowid),
    started_at: localIso(),
    ended_at: null,
    task_id: taskId,
    minutes: 0,
    completed: 0
  }
}

export function stopFocusSession(id: number, completed: boolean): FocusSessionRow | null {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM focus_sessions WHERE id = ?').get(id) as
    | FocusSessionRow
    | undefined
  if (!row || row.ended_at) return row ?? null

  const minutes = Math.max(
    0,
    Math.round((Date.now() - new Date(row.started_at).getTime()) / 60000)
  )
  db.prepare('UPDATE focus_sessions SET ended_at = ?, minutes = ?, completed = ? WHERE id = ?').run(
    localIso(),
    minutes,
    completed ? 1 : 0,
    id
  )
  return { ...row, ended_at: localIso(), minutes, completed: completed ? 1 : 0 }
}

export function getActiveFocusSession(): FocusSessionRow | null {
  const row = getDatabase()
    .prepare('SELECT * FROM focus_sessions WHERE ended_at IS NULL ORDER BY id DESC LIMIT 1')
    .get() as FocusSessionRow | undefined
  return row ?? null
}

export function listTodayFocusSessions(): FocusSessionRow[] {
  return getDatabase()
    .prepare(
      `SELECT * FROM focus_sessions WHERE date(started_at) = date(?) ORDER BY started_at`
    )
    .all(localIso()) as FocusSessionRow[]
}
