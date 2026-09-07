import net from 'node:net'
import { AgentStatusInfo } from '../ipc/channels'

// Ollama 本地服务客户端（设计文档 13.2）
// 只访问本机 11434 端口，任何失败都降级为 available: false，不阻塞主进程。

const OLLAMA_HOST = '127.0.0.1'
const OLLAMA_PORT = 11434
const HTTP_TIMEOUT_MS = 3000

export function checkTcpPort(port: number, host: string, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    const done = (ok: boolean): void => {
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
    socket.connect(port, host)
  })
}

async function ollamaFetch(path: string, timeoutMs = HTTP_TIMEOUT_MS): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`http://${OLLAMA_HOST}:${OLLAMA_PORT}${path}`, {
      signal: controller.signal
    })
    if (!res.ok) return null
    return (await res.json()) as unknown
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function getAgentStatus(): Promise<AgentStatusInfo> {
  const base_url = `http://${OLLAMA_HOST}:${OLLAMA_PORT}`
  const alive = await checkTcpPort(OLLAMA_PORT, OLLAMA_HOST)
  if (!alive) return { available: false, models: [], base_url }

  const data = (await ollamaFetch('/api/tags')) as { models?: Array<{ name?: string }> } | null
  const models = (data?.models ?? []).map((m) => m.name ?? '').filter(Boolean)

  return { available: models.length > 0, models, base_url }
}
