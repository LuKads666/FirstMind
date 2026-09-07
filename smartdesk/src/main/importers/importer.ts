// 日程导入（设计文档 8.6）：ICS 日历与 CSV 课表/作业清单 → calendar_events (+ tasks)
// Excel 按“另存为 CSV”使用；xlsx 二进制解析不在 MVP 范围。

export interface ParsedEvent {
  title: string
  source_type: 'course' | 'exam' | 'assignment' | 'manual'
  start_at: string
  end_at: string | null
  all_day: boolean
  location: string
}

export interface ParsedCsvResult {
  events: ParsedEvent[]
  warnings: string[]
}

// ── ICS 解析 ──

function unfoldIcsLines(raw: string): string[] {
  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const out: string[] = []
  for (const line of lines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += line.slice(1)
    } else {
      out.push(line)
    }
  }
  return out
}

function icsDateToIso(value: string): { iso: string; allDay: boolean } | null {
  const v = value.trim()
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(v)
  if (dateOnly) {
    return { iso: `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T00:00:00`, allDay: true }
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(v)
  if (!m) return null
  const [, y, mo, d, h, mi, s, z] = m
  if (z === 'Z') {
    // UTC → 本地
    const utc = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)))
    const pad = (n: number): string => String(n).padStart(2, '0')
    return {
      iso: `${utc.getFullYear()}-${pad(utc.getMonth() + 1)}-${pad(utc.getDate())}T${pad(utc.getHours())}:${pad(utc.getMinutes())}:${pad(utc.getSeconds())}`,
      allDay: false
    }
  }
  return { iso: `${y}-${mo}-${d}T${h}:${mi}:${s}`, allDay: false }
}

export function parseIcs(raw: string, defaultType: ParsedEvent['source_type'] = 'manual'): ParsedEvent[] {
  const lines = unfoldIcsLines(raw)
  const events: ParsedEvent[] = []
  let current: { summary?: string; start?: string; end?: string; location?: string } | null = null

  const finish = (): void => {
    if (!current?.summary || !current.start) {
      current = null
      return
    }
    const startParsed = icsDateToIso(current.start)
    if (!startParsed) {
      current = null
      return
    }
    const endParsed = current.end ? icsDateToIso(current.end) : null
    events.push({
      title: current.summary,
      source_type: classifyTitle(current.summary, defaultType),
      start_at: startParsed.iso,
      end_at: endParsed?.iso ?? null,
      all_day: startParsed.allDay,
      location: current.location ?? ''
    })
    current = null
  }

  for (const line of lines) {
    if (line.startsWith('BEGIN:VEVENT')) {
      current = {}
      continue
    }
    if (line.startsWith('END:VEVENT')) {
      finish()
      continue
    }
    if (!current) continue

    const colon = line.indexOf(':')
    if (colon < 0) continue
    const key = line.slice(0, colon).toUpperCase()
    const value = line.slice(colon + 1)

    if (key.startsWith('SUMMARY')) current.summary = value.trim()
    else if (key.startsWith('DTSTART')) current.start = value
    else if (key.startsWith('DTEND')) current.end = value
    else if (key.startsWith('LOCATION')) current.location = value.trim()
  }

  return events
}

// ── CSV 解析（支持引号转义的逗号） ──

function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        cell += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      cells.push(cell.trim())
      cell = ''
    } else {
      cell += ch
    }
  }
  cells.push(cell.trim())
  return cells
}

function normalizeDate(value: string): { iso: string; allDay: boolean } | null {
  const v = value.trim()
  if (!v) return null
  // 2026/9/9 14:00 或 2026-09-09 14:00 或 2026-09-09
  const m =
    /^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(v)
  if (!m) return icsDateToIso(v)
  const pad = (n: number): string => String(n).padStart(2, '0')
  const hasTime = m[4] !== undefined
  return {
    iso: `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}T${hasTime ? pad(Number(m[4])) : '00'}:${hasTime ? m[5] : '00'}:${hasTime ? (m[6] ?? '00') : '00'}`,
    allDay: !hasTime
  }
}

const TITLE_KEYS = ['title', 'name', '事项', '标题', '名称', '内容', '课程', '任务']
const START_KEYS = ['start', 'start_at', 'startat', '开始', '开始时间', '上课时间', '时间']
const END_KEYS = ['end', 'end_at', 'endat', '结束', '结束时间']
const DUE_KEYS = ['due', 'due_at', 'dueat', 'deadline', '截止', '截止时间', '提交时间']
const LOCATION_KEYS = ['location', 'place', '地点', '教室', '位置']
const TYPE_KEYS = ['type', 'source_type', '类型']

function classifyTitle(title: string, fallback: ParsedEvent['source_type']): ParsedEvent['source_type'] {
  if (/考试|exam|测验/i.test(title)) return 'exam'
  if (/作业|实验|assignment|报告|论文/i.test(title)) return 'assignment'
  if (fallback === 'course') return 'course'
  return fallback
}

export function parseCsv(raw: string, defaultType: ParsedEvent['source_type'] = 'manual'): ParsedCsvResult {
  const lines = raw.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim() !== '')
  if (lines.length < 2) {
    return { events: [], warnings: ['CSV 至少需要表头和一行数据'] }
  }

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase())
  const idxOf = (keys: string[]): number =>
    header.findIndex((h) => keys.includes(h.trim().toLowerCase()))

  const iTitle = idxOf(TITLE_KEYS)
  const iStart = idxOf(START_KEYS)
  const iEnd = idxOf(END_KEYS)
  const iDue = idxOf(DUE_KEYS)
  const iLocation = idxOf(LOCATION_KEYS)
  const iType = idxOf(TYPE_KEYS)

  if (iTitle < 0 || (iStart < 0 && iDue < 0)) {
    return {
      events: [],
      warnings: ['需要至少包含标题列(title/名称)与开始或截止时间列(start/due)']
    }
  }

  const warnings: string[] = []
  const events: ParsedEvent[] = []

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i])
    const title = cells[iTitle] ?? ''
    if (!title) {
      warnings.push(`第 ${i + 1} 行缺少标题，已跳过`)
      continue
    }
    const dateCell = iDue >= 0 && cells[iDue] ? cells[iDue] : cells[iStart]
    const parsed = normalizeDate(dateCell ?? '')
    if (!parsed) {
      warnings.push(`第 ${i + 1} 行时间无法解析（${dateCell}），已跳过`)
      continue
    }
    const endCell = iEnd >= 0 ? normalizeDate(cells[iEnd] ?? '') : null
    const typeCell = iType >= 0 ? (cells[iType] ?? '').toLowerCase() : ''
    const sourceType =
      typeCell === 'course' || typeCell === 'exam' || typeCell === 'assignment' || typeCell === 'manual'
        ? typeCell
        : classifyTitle(title, defaultType)

    events.push({
      title,
      source_type: sourceType,
      start_at: parsed.iso,
      end_at: endCell?.iso ?? null,
      all_day: parsed.allDay,
      location: iLocation >= 0 ? (cells[iLocation] ?? '') : ''
    })
  }

  return { events, warnings }
}
