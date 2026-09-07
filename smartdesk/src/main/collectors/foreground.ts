import koffi from 'koffi'

// 前台窗口采集（设计文档 8.2 / 8.5）
// 只读取窗口句柄、标题与进程 ID，不注册键盘钩子、不读取输入内容。

const user32 = koffi.load('user32.dll')
const kernel32 = koffi.load('kernel32.dll')

const GetForegroundWindow = user32.func('void *GetForegroundWindow()')
const GetWindowTextW = user32.func('int GetWindowTextW(void *hwnd, uint16 *text, int max)')
const GetWindowThreadProcessId = user32.func(
  'uint32 GetWindowThreadProcessId(void *hwnd, uint32 *pid)'
)
const OpenProcess = kernel32.func('void *OpenProcess(uint32 access, int inherit, uint32 pid)')
const CloseHandle = kernel32.func('int CloseHandle(void *handle)')
const QueryFullProcessImageNameW = kernel32.func(
  'uint32 QueryFullProcessImageNameW(void *proc, uint32 flags, uint16 *text, uint32 *size)'
)

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000

const CATEGORY_RULES: Array<{ category: string; keywords: string[] }> = [
  { category: 'study_document', keywords: ['.doc', '.docx', '.pdf', '.ppt', 'word', 'notion', 'obsidian', 'typora', '报告', '论文', '笔记'] },
  { category: 'study_code', keywords: ['visual studio code', 'vscode', 'idea', 'pycharm', 'webstorm', 'visual studio', 'dev-c', 'codeblocks', 'git bash', '终端'] },
  { category: 'study_video', keywords: ['mooc', '慕课', '网课', 'bilibili', '哔哩哔哩', '中国大学', '网易云课堂'] },
  { category: 'communication', keywords: ['wechat', '微信', 'qq', '钉钉', 'dingtalk', 'outlook', '飞书', 'feishu', 'teams', 'thunder', 'foxmail'] },
  { category: 'entertainment', keywords: ['youtube', 'netflix', 'iqiyi', '爱奇艺', '腾讯视频', '优酷', 'youku', '抖音', 'douyin', 'steam', 'epic games', 'game', '英雄联盟', '王者荣耀'] },
  { category: 'music', keywords: ['spotify', 'netease_cloudmusic', 'cloudmusic', '网易云音乐', 'qqmusic', 'qq音乐', 'kugou', 'kuwo', 'foobar'] }
]

export interface RawForeground {
  hwnd: string
  process_id: number
  window_title: string
  process_name: string
}

export function readForegroundWindow(): RawForeground | null {
  const hwnd = GetForegroundWindow()
  if (!hwnd) return null
  const hwndStr = String(hwnd)
  if (hwndStr === '0' || hwndStr === '0x0') return null

  const titleBuf = Buffer.alloc(1024)
  GetWindowTextW(hwnd, titleBuf, 512)
  const window_title = titleBuf.toString('utf16le').replace(/\0.*$/, '')

  const pidBuf = Buffer.alloc(4)
  GetWindowThreadProcessId(hwnd, pidBuf)
  const process_id = pidBuf.readUInt32LE(0)

  return {
    hwnd: hwndStr,
    process_id,
    window_title,
    process_name: readProcessName(process_id)
  }
}

function readProcessName(pid: number): string {
  if (!pid) return ''
  const handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid)
  if (!handle) return ''

  try {
    const nameBuf = Buffer.alloc(1024)
    const sizeBuf = Buffer.alloc(4)
    sizeBuf.writeUInt32LE(512, 0)
    const ok = QueryFullProcessImageNameW(handle, 0, nameBuf, sizeBuf)
    if (!ok) return ''
    const full = nameBuf.toString('utf16le').replace(/\0.*$/, '')
    const normalized = full.replace(/\//g, '\\')
    const lastSlash = normalized.lastIndexOf('\\')
    return lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized
  } finally {
    CloseHandle(handle)
  }
}

// 进程名 + 窗口标题 → 应用类别（M1 简版映射，M2 支持用户修正）
export function mapCategory(processName: string, windowTitle: string): string {
  const exe = processName.toLowerCase()
  if (exe === 'explorer.exe' || exe === '') return 'unknown'
  const hay = `${exe} ${windowTitle.toLowerCase()}`

  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((k) => hay.includes(k))) return rule.category
  }
  if (exe.endsWith('.exe') && exe.includes('chrome')) return 'browsing_other'
  if (['msedge.exe', 'firefox.exe', 'chrome.exe', 'browser.exe'].includes(exe)) {
    return 'browsing_other'
  }
  if (windowTitle.includes('锁定') || windowTitle.includes('锁屏')) return 'away'
  return 'unknown'
}

export function getForegroundInfo(): {
  process_id: number
  window_title: string
  process_name: string
  category: string
  captured_at: string
} | null {
  const raw = readForegroundWindow()
  if (!raw) return null
  return {
    process_id: raw.process_id,
    window_title: raw.window_title,
    process_name: raw.process_name,
    category: mapCategory(raw.process_name, raw.window_title),
    captured_at: new Date().toISOString()
  }
}
