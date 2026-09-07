// 时间约定：数据库中的时间戳一律使用「本地时区、无时区后缀」的 ISO 字符串
// （如 2026-09-07T20:30:00），便于 SQL 的 date() 比较与演示数据生成器保持一致。

export function localIso(d: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  )
}

export function todayDateString(d: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseLocal(s: string): Date {
  return new Date(s)
}
