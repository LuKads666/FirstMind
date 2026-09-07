import { Bot, ClipboardList, Send, Sparkles, X } from 'lucide-react'
import { useState } from 'react'

interface ChatMessage {
  id: string
  role: 'assistant' | 'user'
  text: string
}

const quickPrompts = ['今日安排', '拆实验报告', '提醒我']

function makeId(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 10000)}`
}

function buildReply(input: string): string {
  const text = input.trim()
  if (text.includes('安排') || text.includes('计划')) {
    return '今晚建议先做实验报告 40 分钟，再做高数习题 25 分钟，中间留 5 分钟休息。'
  }
  if (text.includes('拆') || text.includes('任务')) {
    return '实验报告可以先拆成三小段：整理数据 15 分钟、写摘要 20 分钟、检查结论 15 分钟。'
  }
  if (text.includes('提醒') || text.includes('专注')) {
    return '我记住了。实验报告还剩 2 天，建议今晚至少完成第一段。'
  }
  return '我先记下这件事。今天还剩实验报告和高数习题，先开始比较容易的那一小段就好。'
}

function Companion(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'seed',
      role: 'assistant',
      text: '今天还剩实验报告和高数习题，先从 25 分钟的实验报告开始吧。'
    }
  ])

  const send = (raw: string): void => {
    const text = raw.trim()
    if (!text) return

    setMessages((current) => [
      ...current,
      { id: makeId(), role: 'user', text }
    ])
    setInput('')

    window.setTimeout(() => {
      setMessages((current) => [
        ...current,
        { id: makeId(), role: 'assistant', text: buildReply(text) }
      ])
    }, 420)
  }

  return (
    <div className="companion-slot">
      {open && (
        <section className="companion-chat">
          <header className="chat-heading">
            <span className="chat-title">小策</span>
            <button
              className="icon-button"
              aria-label="关闭对话"
              onClick={() => setOpen(false)}
            >
              <X size={15} />
            </button>
          </header>
          <div className="chat-messages">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`chat-message message-${message.role}`}
              >
                {message.role === 'assistant' && (
                  <span className="message-bot">
                    <Bot size={13} aria-hidden="true" />
                  </span>
                )}
                <p>{message.text}</p>
              </div>
            ))}
          </div>
          <div className="quick-prompts">
            {quickPrompts.map((prompt) => (
              <button key={prompt} type="button" onClick={() => send(prompt)}>
                <ClipboardList size={12} aria-hidden="true" />
                {prompt}
              </button>
            ))}
          </div>
          <form
            className="chat-input-row"
            onSubmit={(event) => {
              event.preventDefault()
              send(input)
            }}
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="和小策说点什么"
              aria-label="对话输入"
            />
            <button className="icon-button primary" type="submit" aria-label="发送">
              <Send size={15} />
            </button>
          </form>
        </section>
      )}

      <button
        className="companion-card"
        type="button"
        aria-label={open ? '关闭小策' : '打开小策'}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="companion-glow">
          {open && <Sparkles size={7} aria-hidden="true" />}
        </span>
        <span className="companion-avatar">
          <Bot size={22} aria-hidden="true" />
        </span>
        <span className="companion-name">小策</span>
      </button>
    </div>
  )
}

export default Companion
