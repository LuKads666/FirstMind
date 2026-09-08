import { BrowserWindow } from 'electron'
import { join } from 'node:path'

// 主控台窗口（设计文档 6.4 MainConsoleWindow）：设置、数据管理、隐私说明

const CONSOLE_SIZE = { width: 960, height: 660 }

let consoleWin: BrowserWindow | null = null

export function getConsoleWindow(): BrowserWindow | null {
  if (consoleWin && !consoleWin.isDestroyed()) return consoleWin
  return null
}

export function createConsoleWindow(): BrowserWindow {
  if (consoleWin && !consoleWin.isDestroyed()) {
    consoleWin.show()
    consoleWin.focus()
    return consoleWin
  }

  consoleWin = new BrowserWindow({
    width: CONSOLE_SIZE.width,
    height: CONSOLE_SIZE.height,
    minWidth: 760,
    minHeight: 520,
    title: '智伴桌面 · 主控台',
    backgroundColor: '#141c20',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void consoleWin.loadURL(`${process.env.ELECTRON_RENDERER_URL}/?window=console`)
  } else {
    void consoleWin.loadFile(join(__dirname, '../renderer/index.html'), {
      search: 'window=console'
    })
  }

  consoleWin.once('ready-to-show', () => consoleWin?.show())
  consoleWin.on('closed', () => {
    consoleWin = null
  })
  return consoleWin
}
