import { dialog } from 'electron'
import { readdirSync, statSync } from 'node:fs'
import { join, extname, basename } from 'node:path'
import { getSetting, setSetting } from '../storage/settings-repo'

// 本地音乐库（设计文档 7）：扫描用户选择文件夹的常见音频格式，仅播放本地文件。

const AUDIO_EXTENSIONS = ['.mp3', '.flac', '.wav', '.ogg', '.m4a']

export interface TrackInfo {
  id: string
  title: string
  artist: string
  path: string
}

const LIBRARY_KEY = 'music_library'
const IGNORED_DIRS = new Set(['node_modules', '$RECYCLE.BIN', 'System Volume Information'])

export function getLibraryFolder(): string | null {
  return getSetting<string | null>(LIBRARY_KEY, null)
}

export async function chooseLibraryFolder(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    title: '选择音乐文件夹',
    properties: ['openDirectory']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const folder = result.filePaths[0]
  setSetting(LIBRARY_KEY, folder)
  return folder
}

export function scanLibrary(): TrackInfo[] {
  const folder = getLibraryFolder()
  if (!folder) return []

  const tracks: TrackInfo[] = []
  walk(folder, tracks, 0)
  tracks.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
  return tracks
}

function walk(dir: string, out: TrackInfo[], depth: number): void {
  if (depth > 4) return
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }

  for (const name of entries) {
    if (name.startsWith('.')) continue
    const full = join(dir, name)
    let stat
    try {
      stat = statSync(full)
    } catch {
      continue
    }
    if (stat.isDirectory()) {
      if (!IGNORED_DIRS.has(name.toUpperCase())) walk(full, out, depth + 1)
      continue
    }
    if (AUDIO_EXTENSIONS.includes(extname(name).toLowerCase())) {
      const stem = basename(name, extname(name))
      const dash = stem.indexOf(' - ')
      out.push({
        id: Buffer.from(full).toString('base64url').slice(0, 40),
        title: dash > 0 ? stem.slice(dash + 3).trim() : stem,
        artist: dash > 0 ? stem.slice(0, dash).trim() : '本机音乐',
        path: full
      })
    }
  }
}
