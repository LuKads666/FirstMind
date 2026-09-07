import { getDatabase } from './database'

export interface CalendarEventRow {
  id: number
  title: string
  source_type: 'course' | 'exam' | 'assignment' | 'manual'
  start_at: string
  end_at: string | null
  all_day: number
  location: string
}

export function listEventsBetween(startIso: string, endIso: string): CalendarEventRow[] {
  return getDatabase()
    .prepare(
      `SELECT * FROM calendar_events
       WHERE start_at >= ? AND start_at < ?
       ORDER BY start_at`
    )
    .all(startIso, endIso) as CalendarEventRow[]
}

export function listUpcoming(fromIso: string, limit = 20): CalendarEventRow[] {
  return getDatabase()
    .prepare(
      `SELECT * FROM calendar_events WHERE start_at >= ? ORDER BY start_at LIMIT ?`
    )
    .all(fromIso, limit) as CalendarEventRow[]
}

export function insertEvent(e: {
  title: string
  source_type: string
  start_at: string
  end_at?: string | null
  all_day?: number
  location?: string
}): number {
  const { lastInsertRowid } = getDatabase()
    .prepare(
      `INSERT INTO calendar_events (title, source_type, start_at, end_at, all_day, location)
       VALUES (@title, @source_type, @start_at, @end_at, @all_day, @location)`
    )
    .run({
      title: e.title,
      source_type: e.source_type,
      start_at: e.start_at,
      end_at: e.end_at ?? null,
      all_day: e.all_day ?? 0,
      location: e.location ?? ''
    })
  return Number(lastInsertRowid)
}

export function todayRange(now = new Date()): { startIso: string; endIso: string } {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}
