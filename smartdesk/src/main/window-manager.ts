import { BrowserWindow, app, screen } from 'electron'
import { join } from 'node:path'

// 窗口管理（设计文档 6.1）
// M1 阶段：桌面预览窗（全屏桌面模式）+ 主控台暂时复用同一窗口。

export function createPreviewWindow(): BrowserWindow {
  const { bounds } = screen.getPrimaryDisplay()
  const { width, height, x, y } = bounds

  const win = new BrowserWindow({
    width,
    height,
    x,
    y,
    frame: false,
    fullscreen: true,
    resizable: true,
    show: false,
    backgroundColor: '#172327',
    title: '智伴桌面',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.setMenuBarVisibility(false)

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  win.once('ready-to-show', () => win.show())
  win.webContents.on('before-input-event', (_, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      win.webContents.toggleDevTools()
    }
  })

  return win
}

export function getPreviewWindow(): BrowserWindow | null {
  return BrowserWindow.getAllWindows()[0] ?? null
}

export function showOrRestorePreview(): void {
  const win = getPreviewWindow()
  if (win) {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  } else {
    createPreviewWindow()
  }
}

export function hideToTray(): void {
  getPreviewWindow()?.hide()
}

export function quitApp(): void {
  app.quit()
}
