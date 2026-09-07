import { app, BrowserWindow } from 'electron'
import { registerIpcHandlers } from './ipc/handlers'
import { getDatabase, closeDatabase } from './storage/database'
import { createTray, destroyTray } from './tray'
import { createPreviewWindow, showOrRestorePreview } from './window-manager'
import { startCollector, stopCollector } from './collectors/runtime'
import { startRiskScheduler, stopRiskScheduler } from './engine/scheduler'
import { registerMediaProtocol, registerMediaHandler } from './music/media-protocol'

registerMediaProtocol() // 必须在 app ready 前注册特权 scheme

// 单实例：托盘常驻应用，二次启动时唤起已有窗口
if (!app.requestSingleInstanceLock()) {
  app.quit()
}

app.on('second-instance', () => showOrRestorePreview())

app.whenReady().then(() => {
  registerMediaHandler()
  getDatabase() // 初始化 SQLite（userData/smartdesk.db）
  registerIpcHandlers()
  createTray()
  createPreviewWindow()
  startCollector() // 1 秒轮询前台窗口与活跃度，写入 app_sessions / activity_ticks
  startRiskScheduler() // 每 60 秒评估风险规则并派发提醒

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createPreviewWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  stopCollector() // flush 未结束的会话与分钟时间片
  stopRiskScheduler()
  destroyTray()
  closeDatabase()
})
