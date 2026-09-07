import koffi from 'koffi'
import { mapCategory } from './category-mapper'

// 前台窗口采集（设计文档 8.2）
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

export interface RawForeground {
  hwnd: string
  process_id: number
  window_title: string
  process_name: string
  category: string
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
  if (!process_id) return null

  const process_name = readProcessName(process_id)

  return {
    hwnd: hwndStr,
    process_id,
    window_title,
    process_name,
    category: mapCategory(process_name, window_title)
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

export function getForegroundInfo() {
  const raw = readForegroundWindow()
  if (!raw) return null
  return {
    process_id: raw.process_id,
    window_title: raw.window_title,
    process_name: raw.process_name,
    category: raw.category,
    captured_at: new Date().toISOString()
  }
}
