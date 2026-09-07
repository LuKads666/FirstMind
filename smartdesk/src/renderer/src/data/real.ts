import { useEffect, useState } from 'react'

// 渲染层数据获取：统一从主进程 IPC 拉取，不做本地缓存（设计文档 19.2 状态推送的轮询版）

export function useIpcPolling<T>(fetcher: () => Promise<T>, intervalMs: number, deps: unknown[] = []): T | null {
  const [data, setData] = useState<T | null>(null)

  useEffect(() => {
    let alive = true
    const load = (): void => {
      fetcher()
        .then((result) => {
          if (alive) setData(result)
        })
        .catch(() => {
          /* 主进程未就绪时静默，下轮重试 */
        })
    }
    load()
    if (intervalMs > 0) {
      const timer = window.setInterval(load, intervalMs)
      return () => {
        alive = false
        window.clearInterval(timer)
      }
    }
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return data
}

export function activityLabel(category: string): string {
  const map: Record<string, string> = {
    study_document: '文档学习',
    study_code: '编程/写代码',
    study_video: '网课视频',
    communication: '沟通中',
    entertainment: '娱乐中',
    music: '听音乐',
    browsing_other: '浏览网页',
    away: '离开',
    unknown: '待识别'
  }
  return map[category] ?? category
}

export function dueText(dueAt: string | null): string {
  if (!dueAt) return '无截止'
  const due = new Date(dueAt)
  const now = new Date()
  const hours = (due.getTime() - now.getTime()) / 3600000
  if (hours < 0) return '已过期'
  if (hours < 24) {
    const h = Math.max(1, Math.round(hours))
    return h <= 1 ? '即将截止' : `剩 ${h} 小时`
  }
  return `剩 ${Math.round(hours / 24)} 天`
}
