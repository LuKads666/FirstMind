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
import { getCollectorState, resetActivityResolutionState } from '../collectors/runtime'
import { getCurrentFocusMinutes, getTodayStats } from '../storage/stats-repo'
import { listEventsBetween, todayRange } from '../storage/calendar-repo'
import { getAgentStatus } from '../agent/ollama-client'
import { getDistractionProb } from '../model/predictor'
import { getSetting, setSetting } from '../storage/settings-repo'
import { localIso } from '../utils/time'
import { evaluateOnce, triggerDemoRisk } from '../engine/scheduler'
import { chooseLibraryFolder, scanLibrary } from '../music/music-library'
import { chatHistory, handleChat } from '../agent/agent-service'
import { importScheduleFile } from '../importers/import-service'
import {
  chooseWallpaperImage,
  getWallpaper,
  setWallpaperTheme,
  syncFromSystemWallpaper
} from '../wallpaper-manager'
import {
  getActiveFocusSession,
  startFocusSession,
  stopFocusSession
} from '../storage/focus-repo'
import { broadcastToDesktop, hideAlertWindow } from '../alert-window'
import { createConsoleWindow } from '../console-window'
import { hideToTray } from '../window-manager'

function stopAnyActiveFocus(): void {
  const active = getActiveFocusSession()
  if (active) stopFocusSession(active.id, false)
}

// 类型化 IPC 注册中心（设计文档 19）：渲染层不直接访问数据库与 Win32。

export function registerIpcHandlers(): void {
  ipcMain.handle(IpcChannels.PreviewClose, () => app.quit())
  ipcMain.handle(IpcChannels.PreviewHide, () => {
    hideToTray()
    return true
  })

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
    const stats = getTodayStats(state.currentCategory)
    // 进行中的学习会话也计入今日专注分钟
    if (
      state.currentCategory.startsWith('study_') &&
      state.currentSessionStartedAt
    ) {
      const minutes = Math.max(
        0,
        Math.round((Date.now() - new Date(state.currentSessionStartedAt).getTime()) / 60000)
      )
      if (minutes > 0 && minutes < 600) {
        stats.focus_minutes += minutes
      }
    }
    return stats
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

    // 「开始任务」联动专注闭环：查提醒对应的任务，自动开启专注会话
    let startedFocusTaskId: number | null = null
    if (action === 'accepted') {
      const row = getDatabase()
        .prepare(
          `SELECT re.task_id AS task_id FROM notifications n
           JOIN risk_events re ON n.risk_id = re.id WHERE n.id = ?`
        )
        .get(id) as { task_id: number | null } | undefined
      if (row?.task_id) {
        stopAnyActiveFocus()
        startFocusSession(row.task_id)
        startedFocusTaskId = row.task_id
      }
    }

    getDatabase()
      .prepare('UPDATE notifications SET user_action = ? WHERE id = ?')
      .run(action, id)
    hideAlertWindow()

    if (startedFocusTaskId !== null) {
      broadcastToDesktop('focus:started', { task_id: startedFocusTaskId })
    }
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

  ipcMain.handle(IpcChannels.WallpaperSyncFromSystem, () => syncFromSystemWallpaper())

  ipcMain.handle(IpcChannels.ConsoleOpen, () => {
    createConsoleWindow()
    return true
  })

  ipcMain.handle(IpcChannels.DataStats, () => {
    const db = getDatabase()
    const count = (table: string): number => {
      try {
        return (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
      } catch {
        return 0
      }
    }
    return {
      app_sessions: count('app_sessions'),
      activity_ticks: count('activity_ticks'),
      file_events: count('file_events'),
      focus_sessions: count('focus_sessions'),
      risk_events: count('risk_events'),
      notifications: count('notifications'),
      chat_logs: count('chat_logs'),
      tasks: count('tasks'),
      calendar_events: count('calendar_events')
    }
  })

  ipcMain.handle(IpcChannels.DataClear, () => {
    const db = getDatabase()
    // 清除全部行为数据（设计文档 16 隐私设计）；任务、日程与设置保留
    const tables = [
      'app_sessions',
      'activity_ticks',
      'activity_resolution_cache',
      'activity_learned_rules',
      'file_events',
      'focus_sessions',
      'risk_events',
      'notifications',
      'chat_logs',
      'model_predictions',
      'behavior_labels',
      'user_feedback'
    ]
    for (const t of tables) db.prepare(`DELETE FROM ${t}`).run()
    resetActivityResolutionState()
    return true
  })

  ipcMain.handle(IpcChannels.LoginItemGet, () => app.getLoginItemSettings())

  ipcMain.handle(IpcChannels.LoginItemSet, (_event, openAtLogin: boolean) => {
    app.setLoginItemSettings({ openAtLogin })
    return app.getLoginItemSettings().openAtLogin
  })

  ipcMain.handle(IpcChannels.FocusStart, (_event, taskId: number | null) => {
    stopAnyActiveFocus()
    return startFocusSession(taskId ?? null)
  })

  ipcMain.handle(IpcChannels.FocusStop, (_event, payload: unknown) => {
    const { id, completed } = payload as { id: number; completed: boolean }
    return stopFocusSession(id, Boolean(completed))
  })

  ipcMain.handle(IpcChannels.FocusActive, () => getActiveFocusSession())
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
    distraction_prob: getDistractionProb(),
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
