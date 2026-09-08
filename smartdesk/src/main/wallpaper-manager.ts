import { dialog } from 'electron'
import koffi from 'koffi'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { getSetting, setSetting } from './storage/settings-repo'

// 壁纸管理（设计文档 6.3 阶段 1）：
// - 内置主题（渐变）只作用于本应用界面
// - 本机图片 / 同步系统壁纸 都是“程序内生效”，不修改 Windows 系统桌面设置

export interface WallpaperTheme {
  id: string
  name: string
  css: string
}

export const WALLPAPER_THEMES: WallpaperTheme[] = [
  {
    id: 'aurora',
    name: '极夜',
    css: 'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)'
  },
  {
    id: 'dusk',
    name: '暮色',
    css: 'linear-gradient(135deg, #17232a 0%, #35506b 55%, #6c5b7b 100%)'
  },
  {
    id: 'midnight',
    name: '深夜',
    css: 'linear-gradient(160deg, #10181c 0%, #17232a 60%, #1d2f36 100%)'
  }
]

const user32 = koffi.load('user32.dll')
const SystemParametersInfoW = user32.func(
  'int SystemParametersInfoW(uint32 action, uint32 param, void *value, uint32 ini)'
)
const SPI_GETDESKWALLPAPER = 0x0073

export interface WallpaperSetting {
  type: 'theme' | 'image'
  id?: string
  path?: string
}

export function getWallpaper(): WallpaperSetting {
  return getSetting<WallpaperSetting>('wallpaper', { type: 'theme', id: 'aurora' })
}

export function setWallpaperTheme(id: string): WallpaperSetting {
  const setting: WallpaperSetting = { type: 'theme', id }
  setSetting('wallpaper', setting)
  return setting
}

export async function chooseWallpaperImage(): Promise<WallpaperSetting | null> {
  const result = await dialog.showOpenDialog({
    title: '选择本机图片作为程序壁纸',
    filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }],
    properties: ['openFile']
  })
  if (result.canceled || result.filePaths.length === 0) return null

  const source = result.filePaths[0]
  return applyImageWallpaper(source, source)
}

/** 读取 Windows 当前桌面壁纸路径，复制后作为程序壁纸 */
export function syncFromSystemWallpaper(): WallpaperSetting | null {
  const buf = Buffer.alloc(1040) // MAX_PATH * 2 bytes 的 wchar 缓冲
  const ok = SystemParametersInfoW(SPI_GETDESKWALLPAPER, 520, buf, 0)
  if (!ok) return null

  const source = buf.toString('utf16le').replace(/\0.*$/, '')
  if (!source || !existsSync(source)) return null

  return applyImageWallpaper(source, `系统壁纸${extnameOf(source)}`)
}

function applyImageWallpaper(source: string, nameHint: string): WallpaperSetting {
  const dir = join(app.getPath('userData'), 'wallpapers')
  mkdirSync(dir, { recursive: true })
  const dest = join(dir, `wallpaper-${Date.now()}${extnameOf(source)}`)
  copyFileSync(source, dest)

  const setting: WallpaperSetting = { type: 'image', path: dest }
  setSetting('wallpaper', setting)
  void nameHint
  return setting
}

function extnameOf(p: string): string {
  const dot = p.lastIndexOf('.')
  return dot >= 0 ? p.slice(dot) : '.jpg'
}
