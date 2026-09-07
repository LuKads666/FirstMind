import { getDatabase } from '../storage/database'
import { getCollectorState } from '../collectors/runtime'
import { getAgentStatus, ollamaChat, pickModel, type ChatMessage } from './ollama-client'
import { localIso } from '../utils/time'

// Agent 服务（设计文档 13）：工具取数 → 上下文注入 → 本地模型生成；不可用时模板兜底。

export interface AgentReply {
  reply: string
  source: 'ollama' | 'template'
}

const SYSTEM_PROMPT = `你是"小策"，一个运行在用户 Windows 桌面上的学习同伴。
语气：温和、简洁、不催促、不说教。
表达：先给结论，再给一个最小的行动建议。
边界：只使用下方提供的用户数据，不编造；数据不足时直说"目前没有足够数据"。
回复不超过三句话，不出现任何 JSON、字段名或英文技术词。`

interface AgentContext {
  open_tasks: Array<{ title: string; due_at: string | null; priority: string }>
  next_deadline: { title: string; hours_left: number } | null
  today_focus_minutes: number
  current_activity: string
}

function buildContext(): AgentContext {
  const db = getDatabase()
  const tasks = db
    .prepare(
      `SELECT title, due_at, priority FROM tasks
       WHERE status IN ('open', 'in_progress') ORDER BY (due_at IS NULL), due_at LIMIT 8`
    )
    .all() as Array<{ title: string; due_at: string | null; priority: string }>

  const now = Date.now()
  const next = tasks.find((t) => t.due_at && new Date(t.due_at).getTime() > now)

  const focusRow = db
    .prepare(
      `SELECT COALESCE(SUM((julianday(COALESCE(ended_at, ?)) - julianday(started_at)) * 24 * 60), 0) AS m
       FROM app_sessions
       WHERE date(started_at) = date(?) AND category LIKE 'study_%'`
    )
    .get(localIso(), localIso()) as { m: number }

  return {
    open_tasks: tasks,
    next_deadline: next
      ? {
          title: next.title,
          hours_left: Math.round((new Date(next.due_at as string).getTime() - now) / 3600000)
        }
      : null,
    today_focus_minutes: Math.round(focusRow.m),
    current_activity: getCollectorState().currentCategory
  }
}

function describeContext(ctx: AgentContext): string {
  const tasks = ctx.open_tasks
    .slice(0, 5)
    .map((t) => {
      if (!t.due_at) return `「${t.title}」（无截止）`
      const hours = Math.round((new Date(t.due_at).getTime() - Date.now()) / 3600000)
      return `「${t.title}」（剩 ${hours} 小时）`
    })
    .join('、')
  return [
    `未完成任务：${tasks || '无'}`,
    ctx.next_deadline ? `最近截止：${ctx.next_deadline.title}，剩 ${ctx.next_deadline.hours_left} 小时` : '',
    `今日专注：${ctx.today_focus_minutes} 分钟`,
    `当前状态：${ctx.current_activity}`
  ]
    .filter(Boolean)
    .join('\n')
}

/** 模板兜底（Ollama 未启动 / 断网时仍可回复，验收 22.3） */
function templateReply(input: string, ctx: AgentContext): string {
  const text = input.trim()
  const first = ctx.open_tasks[0]

  if (text.includes('安排') || text.includes('计划') || text.includes('今晚')) {
    if (ctx.open_tasks.length === 0) {
      return '目前没有待办任务，今晚可以自由安排。'
    }
    const parts = ctx.open_tasks.slice(0, 2).map((t, i) => `${t.title} ${i === 0 ? 40 : 25} 分钟`)
    return `建议今晚先做${parts.join('，')}，中间休息 5 分钟。`
  }
  if (text.includes('拆') || (text.includes('任务') && first)) {
    const target = ctx.open_tasks.find((t) => text.includes(t.title)) ?? first
    if (!target) return '目前没有可拆解的任务。'
    return `「${target.title}」可以先拆成三小段：整理材料 15 分钟、完成主体 25 分钟、检查收尾 15 分钟，从最容易的一段开始。`
  }
  if (text.includes('专注') || text.includes('开始')) {
    if (ctx.next_deadline) {
      return `建议现在专注 25 分钟推进「${ctx.next_deadline.title}」，我会在旁边记录。`
    }
    return '现在开始一段 25 分钟的专注吧，从最容易的一小步做起。'
  }
  if (text.includes('提醒')) {
    return '好的，我记住了。到时间我会在桌面轻声提醒你。'
  }
  if (text.includes('怎么样') || text.includes('状态')) {
    return `今天已专注 ${ctx.today_focus_minutes} 分钟。${ctx.next_deadline ? `「${ctx.next_deadline.title}」还剩 ${ctx.next_deadline.hours_left} 小时，` : ''}保持节奏就好。`
  }
  if (first) {
    return `我先记下这件事。今天还剩「${first.title}」，先开始比较容易的那一小段就好。`
  }
  return '我先记下这件事。目前没有待办，随时告诉我你的安排。'
}

export async function handleChat(userText: string): Promise<AgentReply> {
  const text = userText.trim().slice(0, 500)
  const db = getDatabase()
  const ctx = buildContext()

  db.prepare('INSERT INTO chat_logs (created_at, role, content, source) VALUES (?, ?, ?, ?)').run(
    localIso(),
    'user',
    text,
    'text'
  )

  let reply: string
  let source: 'ollama' | 'template' = 'template'

  const status = await getAgentStatus()
  const model = pickModel(status.models)
  if (status.available && model) {
    const history = db
      .prepare(`SELECT role, content FROM chat_logs ORDER BY id DESC LIMIT 6`)
      .all()
      .reverse() as Array<{ role: string; content: string }>

    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'system', content: `用户当前数据：\n${describeContext(ctx)}` },
      ...history.map((h) => ({
        role: h.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        content: h.content
      }))
    ]

    const llmReply = await ollamaChat(model, messages)
    if (llmReply) {
      reply = llmReply
      source = 'ollama'
    } else {
      reply = templateReply(text, ctx)
    }
  } else {
    reply = templateReply(text, ctx)
  }

  db.prepare('INSERT INTO chat_logs (created_at, role, content, source) VALUES (?, ?, ?, ?)').run(
    localIso(),
    'assistant',
    reply,
    'text'
  )

  return { reply, source }
}

export function chatHistory(limit = 20): Array<{ role: string; content: string; created_at: string }> {
  const rows = getDatabase()
    .prepare(
      `SELECT role, content, created_at FROM chat_logs ORDER BY id DESC LIMIT ?`
    )
    .all(limit) as Array<{ role: string; content: string; created_at: string }>
  return rows.reverse()
}
