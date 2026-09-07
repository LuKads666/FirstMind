import { dialog } from 'electron'
import { readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { parseCsv, parseIcs } from './importer'
import { insertEvent } from '../storage/calendar-repo'
import { createTask } from '../storage/tasks-repo'
import { localIso } from '../utils/time'

// 导入编排：文件对话框 → 解析 → calendar_events + tasks（作业/考试生成任务）

const ICS_EXT = ['.ics']
const CSV_EXT = ['.csv']

export interface ImportResult {
  imported: number
  tasksCreated: number
  warnings: string[]
}

export async function importScheduleFile(): Promise<ImportResult | null> {
  const result = await dialog.showOpenDialog({
    title: '导入课程表 / 考试 / 作业',
    filters: [
      { name: '日程文件', extensions: ['ics', 'csv'] },
      { name: 'ICS 日历', extensions: ['ics'] },
      { name: 'CSV 表格', extensions: ['csv'] }
    ],
    properties: ['openFile']
  })
  if (result.canceled || result.filePaths.length === 0) return null

  const file = result.filePaths[0]
  return importFromPath(file)
}

export function importFromPath(file: string): ImportResult {
  const ext = extname(file).toLowerCase()
  const raw = readFileSync(file, 'utf-8')

  let events
  const warnings: string[] = []
  if (ICS_EXT.includes(ext)) {
    events = parseIcs(raw)
  } else if (CSV_EXT.includes(ext)) {
    const parsed = parseCsv(raw)
    events = parsed.events
    warnings.push(...parsed.warnings)
  } else {
    return { imported: 0, tasksCreated: 0, warnings: [`不支持的文件类型：${ext}（Excel 请另存为 CSV）`] }
  }

  let tasksCreated = 0
  for (const e of events) {
    insertEvent({
      title: e.title,
      source_type: e.source_type,
      start_at: e.start_at,
      end_at: e.end_at,
      all_day: e.all_day ? 1 : 0,
      location: e.location
    })

    // 作业与考试同步生成任务（设计文档 9.2）
    if (e.source_type === 'assignment' || e.source_type === 'exam') {
      const dueAt = e.end_at ?? e.start_at
      if (dueAt >= localIso()) {
        createTask({
          title: e.title,
          due_at: dueAt,
          priority: e.source_type === 'exam' ? 'high' : 'medium'
        })
        tasksCreated++
      }
    }
  }

  return { imported: events.length, tasksCreated, warnings }
}
