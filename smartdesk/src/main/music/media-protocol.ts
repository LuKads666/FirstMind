import { app, net, protocol } from 'electron'
import { pathToFileURL } from 'node:url'
import { extname } from 'node:path'

// 自定义 media:// 协议：渲染层 HTML5 Audio 通过它播放本机音频文件，
// 避免渲染进程直接持有文件系统路径权限。

const SCHEME = 'media'
const ALLOWED_EXTENSIONS = new Set([
  '.mp3',
  '.flac',
  '.wav',
  '.ogg',
  '.m4a',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.bmp'
])

const MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp'
}

export function registerMediaProtocol(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { stream: true, supportFetchAPI: true } }
  ])
}

export function registerMediaHandler(): void {
  protocol.handle(SCHEME, (request) => {
    const url = new URL(request.url)
    // media://local/< encoded absolute path >
    let filePath = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
    if (/^[a-zA-Z]:/.test(filePath) === false) {
      // 非盘符路径（理论不出现）
      filePath = decodeURIComponent(url.host + url.pathname)
    }

    const ext = extname(filePath).toLowerCase()
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return new Response('forbidden', { status: 403 })
    }

    return net.fetch(pathToFileURL(filePath).toString(), { headers: request.headers })
  })
}

export function buildMediaUrl(filePath: string): string {
  return `${SCHEME}://local/${encodeURI(filePath.replace(/\\/g, '/'))}`
}

export function initMediaProtocol(): void {
  registerMediaProtocol()
  app.whenReady().then(() => {
    registerMediaHandler()
  })
}
