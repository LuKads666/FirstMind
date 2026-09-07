import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'

// 提醒窗口（设计文档 6.1 AlertWindow）：frameless + 透明 + 临时置顶，常驻复用。

const ALERT_SIZE = { width: 400, height: 264 }

let alertWin: BrowserWindow | null = null

export function getAlertWindow(): BrowserWindow | null {
  if (alertWin && !alertWin.isDestroyed()) return alertWin
  return null
}

export function showOrReuseAlertWindow(): BrowserWindow {
  if (alertWin && !alertWin.isDestroyed()) {
    alertWin.show()
    return alertWin
  }

  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize

  alertWin = new BrowserWindow({
    width: ALERT_SIZE.width,
    height: ALERT_SIZE.height,
    x: screenW - ALERT_SIZE.width - 24,
    y: screenH - ALERT_SIZE.height - 24,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    skipTaskbar: true,
    show: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  alertWin.setMenuBarVisibility(false)

  if (process.env.ELECTRON_RENDERER_URL) {
    void alertWin.loadURL(`${process.env.ELECTRON_RENDERER_URL}/?window=alert`)
  } else {
    void alertWin.loadFile(join(__dirname, '../renderer/index.html'), {
      search: 'window=alert'
    })
  }

  alertWin.once('ready-to-show', () => alertWin?.hide()) // 载入后先藏，等风险事件再显示
  alertWin.on('closed', () => {
    alertWin = null
  })
  return alertWin
}

export function hideAlertWindow(): void {
  if (alertWin && !alertWin.isDestroyed()) alertWin.hide()
}

export function sendRiskToShow(risk: unknown): void {
  const win = getAlertWindow()
  if (win) {
    win.webContents.send('risk:show', risk)
    return
  }
  // 首次提醒：创建后等渲染完成再推送
  const created = showOrReuseAlertWindow()
  created.webContents.once('did-finish-load', () => {
    created.webContents.send('risk:show', risk)
    created.show()
  })
}

/** 广播给除提醒窗外的所有窗口（桌面模式组件、主控台） */
export function broadcastToDesktop(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win === alertWin) continue
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}
