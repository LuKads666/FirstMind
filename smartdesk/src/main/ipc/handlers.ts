import { app, ipcMain } from 'electron'
import {
  IpcChannels,
  CreateTaskSchema,
  UpdateTaskSchema,
  IdSchema,
  StatusSnapshot
} from './channels'
import { createTask, deleteTask, listTasks, updateTask } from '../storage/tasks-repo'
import { getDatabase } from '../storage/database'
import { getForegroundInfo } from '../collectors/foreground'
import { getAgentStatus } from '../agent/ollama-client'

// 类型化 IPC 注册中心（设计文档 19）：渲染层不直接访问数据库与 Win32。

export function registerIpcHandlers(): void {
  ipcMain.handle(IpcChannels.PreviewClose, () => app.quit())

  ipcMain.handle(IpcChannels.TasksList, () => listTasks())

  ipcMain.handle(IpcChannels.TaskCreate, (_event, payload: unknown) => {
    const input = CreateTaskSchema.parse(payload)
    return createTask(input)
  })

  ipcMain.handle(IpcChannels.TaskUpdate, (_event, payload: unknown) => {
    const { id, patch } = UpdateTaskSchema.parse(payload)
    return updateTask(id, patch)
  })

  ipcMain.handle(IpcChannels.TaskDelete, (_event, payload: unknown) => {
    const id = IdSchema.parse(payload)
    return deleteTask(id)
  })

  ipcMain.handle(IpcChannels.StatusSnapshot, (): StatusSnapshot => buildStatusSnapshot())

  ipcMain.handle(IpcChannels.CollectNow, () => getForegroundInfo())

  ipcMain.handle(IpcChannels.AgentStatus, () => getAgentStatus())
}

function buildStatusSnapshot(): StatusSnapshot {
  const db = getDatabase()
  const now = new Date().toISOString()

  const todayTasks = db
    .prepare(
      `SELECT status, COUNT(*) AS n FROM tasks
       WHERE date(created_at) = date('now') OR status != 'done'
       GROUP BY status`
    )
    .all() as Array<{ status: string; n: number }>
  const total = todayTasks.reduce((sum, r) => sum + r.n, 0)
  const done = todayTasks.find((r) => r.status === 'done')?.n ?? 0

  const nextDeadline = db
    .prepare(
      `SELECT title, due_at FROM tasks
       WHERE due_at IS NOT NULL AND due_at >= ? AND status IN ('open', 'in_progress')
       ORDER BY due_at LIMIT 1`
    )
    .get(now) as { title: string; due_at: string } | undefined

  const fg = getForegroundInfo()

  return {
    current_activity: fg?.category ?? 'unknown',
    focus_minutes: 0,
    distraction_prob: null,
    today_tasks: { done, total },
    next_deadline: nextDeadline
      ? {
          title: nextDeadline.title,
          due_in_hours: Math.max(
            0,
            Math.round((new Date(nextDeadline.due_at).getTime() - Date.now()) / 3600000)
          )
        }
      : null
  }
}
