import { app, ipcMain } from 'electron'
import {
  IpcChannels,
  CreateTaskSchema,
  UpdateTaskSchema,
  IdSchema,
  RiskRespondSchema,
  ChatSendSchema,
  StatusSnapshot
} from './channels'
import { createTask, deleteTask, listTasks, updateTask } from '../storage/tasks-repo'
import { getDatabase } from '../storage/database'
import { getForegroundInfo } from '../collectors/foreground'
import { getCollectorState } from '../collectors/runtime'
import { getCurrentFocusMinutes, getTodayStats } from '../storage/stats-repo'
import { listEventsBetween, todayRange } from '../storage/calendar-repo'
import { getAgentStatus } from '../agent/ollama-client'
import { getSetting, setSetting } from '../storage/settings-repo'
import { localIso } from '../utils/time'
import { hideAlertWindow } from '../alert-window'
import { evaluateOnce, triggerDemoRisk } from '../engine/scheduler'
import { chooseLibraryFolder, scanLibrary } from '../music/music-library'
import { chatHistory, handleChat } from '../agent/agent-service'
import { importScheduleFile } from '../importers/import-service'
import {
  chooseWallpaperImage,
  getWallpaper,
  setWallpaperTheme
} from '../wallpaper-manager'

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

  ipcMain.handle(IpcChannels.StatsToday, () => {
    const state = getCollectorState()
    return getTodayStats(state.currentCategory)
  })

  ipcMain.handle(IpcChannels.ScheduleToday, () => {
    const { startIso, endIso } = todayRange()
    return listEventsBetween(startIso, endIso)
  })

  ipcMain.handle(IpcChannels.DeadlinesList, () => listDeadlines())

  ipcMain.handle(IpcChannels.GetSetting, (_event, key: string) => getSetting(key, null))

  ipcMain.handle(IpcChannels.SetSetting, (_event, key: string, value: unknown) => {
    setSetting(key, value)
    return true
  })

  ipcMain.handle(IpcChannels.RiskRespond, (_event, payload: unknown) => {
    const { id, action } = RiskRespondSchema.parse(payload)
    getDatabase()
      .prepare('UPDATE notifications SET user_action = ? WHERE id = ?')
      .run(action, id)
    hideAlertWindow()
    return true
  })

  ipcMain.handle(IpcChannels.RiskEvaluate, async () => {
    const dispatched = await evaluateOnce()
    return { dispatched: dispatched.length }
  })

  ipcMain.handle(IpcChannels.MusicChooseFolder, async () => {
    const folder = await chooseLibraryFolder()
    return { folder, tracks: scanLibrary() }
  })

  ipcMain.handle(IpcChannels.MusicList, () => scanLibrary())

  ipcMain.handle(IpcChannels.ChatSend, async (_event, payload: unknown) => {
    const { text } = ChatSendSchema.parse(payload)
    return handleChat(text)
  })

  ipcMain.handle(IpcChannels.ChatHistory, () => chatHistory())

  ipcMain.handle(IpcChannels.ImportFile, () => importScheduleFile())

  ipcMain.handle(IpcChannels.WallpaperGet, () => getWallpaper())

  ipcMain.handle(IpcChannels.WallpaperSetTheme, (_event, id: string) => setWallpaperTheme(id))

  ipcMain.handle(IpcChannels.WallpaperChooseImage, () => chooseWallpaperImage())
}

function buildStatusSnapshot(): StatusSnapshot {
  const state = getCollectorState()
  const focus_minutes = getCurrentFocusMinutes(state.currentCategory)

  const nextDeadline = getDatabase()
    .prepare(
      `SELECT title, due_at FROM tasks
       WHERE due_at IS NOT NULL AND due_at >= ? AND status IN ('open', 'in_progress')
       ORDER BY due_at LIMIT 1`
    )
    .get(localIso()) as { title: string; due_at: string } | undefined

  const counts = getDatabase()
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done,
         COUNT(*) AS total
       FROM tasks
       WHERE date(created_at) = ? OR status IN ('open', 'in_progress')`
    )
    .get(localIso().slice(0, 10)) as { done: number | null; total: number }

  return {
    current_activity: state.currentCategory,
    focus_minutes,
    distraction_prob: null,
    today_tasks: { done: counts.done ?? 0, total: counts.total },
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

function listDeadlines() {
  const rows = getDatabase()
    .prepare(
      `SELECT id, title, due_at, source_type FROM tasks
       WHERE due_at IS NOT NULL AND status IN ('open', 'in_progress')
       ORDER BY due_at LIMIT 10`
    )
    .all() as Array<{ id: number; title: string; due_at: string; source_type: string }>

  return rows.map((r) => ({
    ...r,
    due_in_hours: Math.max(0, Math.round((new Date(r.due_at).getTime() - Date.now()) / 3600000))
  }))
}
