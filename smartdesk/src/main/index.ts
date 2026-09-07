import { app, BrowserWindow } from 'electron'
import { registerIpcHandlers } from './ipc/handlers'
import { getDatabase, closeDatabase } from './storage/database'
import { createTray, destroyTray } from './tray'
import { createPreviewWindow, showOrRestorePreview } from './window-manager'

// 单实例：托盘常驻应用，二次启动时唤起已有窗口
if (!app.requestSingleInstanceLock()) {
  app.quit()
}

app.on('second-instance', () => showOrRestorePreview())

app.whenReady().then(() => {
  getDatabase() // 初始化 SQLite（userData/smartdesk.db）
  registerIpcHandlers()
  createTray()
  createPreviewWindow()

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
  destroyTray()
  closeDatabase()
})
