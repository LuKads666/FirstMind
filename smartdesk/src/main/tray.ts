import { Tray, Menu, nativeImage } from 'electron'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { showOrRestorePreview, quitApp } from './window-manager'
import { createConsoleWindow } from './console-window'

// 系统托盘（设计文档 6.5）
let tray: Tray | null = null

function resolveIconPath(): string {
  const candidates = [
    join(__dirname, '../../resources/icons/tray.png'), // 开发与 preview：out/main 相对项目根
    join(process.resourcesPath ?? '.', 'icons/tray.png') // electron-builder extraResources
  ]
  return candidates.find((p) => existsSync(p)) ?? candidates[0]
}

export function createTray(): Tray {
  const icon = nativeImage.createFromPath(resolveIconPath())
  tray = new Tray(icon)

  tray.setToolTip('智伴桌面')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示桌面', click: () => showOrRestorePreview() },
      { label: '打开主控台', click: () => createConsoleWindow() },
      { type: 'separator' },
      { label: '退出', click: () => quitApp() }
    ])
  )
  tray.on('click', () => showOrRestorePreview())

  return tray
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
