import koffi from 'koffi'

// 活跃度采集（设计文档 8.3）：只读“距上次键鼠输入的秒数”和锁屏状态，
// 不注册键盘钩子、不读取输入内容。
// LASTINPUTINFO = { uint32 cbSize; uint32 dwTime }，直接用 Buffer 作为结构体内存。

const user32 = koffi.load('user32.dll')
const kernel32 = koffi.load('kernel32.dll')

const GetLastInputInfo = user32.func('int GetLastInputInfo(void *info)')
const GetTickCount64 = kernel32.func('uint64 GetTickCount64()')

const OpenInputDesktop = user32.func(
  'void *OpenInputDesktop(uint32 flags, int inherit, uint32 access)'
)
const CloseDesktop = user32.func('int CloseDesktop(void *desktop)')

const DESKTOP_SWITCHDESKTOP = 0x0100

export interface ActivitySample {
  idle_seconds: number
  is_locked: boolean
  input_active: boolean
}

export function readActivity(activeThresholdSeconds = 60): ActivitySample {
  const buf = Buffer.alloc(8)
  buf.writeUInt32LE(8, 0) // cbSize
  const ok = GetLastInputInfo(buf)
  const nowTick = Number(GetTickCount64())

  let idle_seconds = Number.MAX_SAFE_INTEGER
  if (ok) {
    const dwTime = buf.readUInt32LE(4)
    if (dwTime > 0) idle_seconds = Math.max(0, Math.floor((nowTick - dwTime) / 1000))
  }

  const is_locked = isWorkstationLocked()

  return {
    idle_seconds,
    is_locked,
    input_active: !is_locked && idle_seconds <= activeThresholdSeconds
  }
}

function isWorkstationLocked(): boolean {
  // 锁屏时 OpenInputDesktop 返回 NULL（DESKTOP_SWITCHDESKTOP 权限）
  const desktop = OpenInputDesktop(0, 0, DESKTOP_SWITCHDESKTOP)
  if (!desktop) return true
  CloseDesktop(desktop)
  return false
}
