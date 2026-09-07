import { dialog } from 'electron'
import koffi from 'koffi'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { getSetting, setSetting } from './storage/settings-repo'

// 壁纸管理（设计文档 6.3 阶段 1）：内置主题（渐变）+ 本机图片；选择本机图片时
// 同步调用 SystemParametersInfoW 更新系统壁纸。

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
const SPI_SETDESKWALLPAPER = 0x0014
const SPIF_UPDATEINIFILE = 0x01
const SPIF_SENDCHANGE = 0x02

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
    title: '选择本机图片作为壁纸',
    filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }],
    properties: ['openFile']
  })
  if (result.canceled || result.filePaths.length === 0) return null

  const source = result.filePaths[0]
  const dir = join(app.getPath('userData'), 'wallpapers')
  mkdirSync(dir, { recursive: true })
  const dest = join(dir, `current${extnameOf(source)}`)
  copyFileSync(source, dest)

  const setting: WallpaperSetting = { type: 'image', path: dest }
  setSetting('wallpaper', setting)
  setSystemWallpaper(dest)
  return setting
}

export function setSystemWallpaper(imagePath: string): boolean {
  if (!existsSync(imagePath)) return false
  const buf = Buffer.from(imagePath, 'utf16le')
  const ok = SystemParametersInfoW(
    SPI_SETDESKWALLPAPER,
    0,
    buf,
    SPIF_UPDATEINIFILE | SPIF_SENDCHANGE
  )
  return ok !== 0
}

function extnameOf(p: string): string {
  const dot = p.lastIndexOf('.')
  return dot >= 0 ? p.slice(dot) : '.jpg'
}
