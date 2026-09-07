import { app, BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'node:path'

function createPreviewWindow(): BrowserWindow {
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
    title: '智伴桌面 UI 预览',
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

app.whenReady().then(() => {
  ipcMain.handle('preview:close', () => app.quit())
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
