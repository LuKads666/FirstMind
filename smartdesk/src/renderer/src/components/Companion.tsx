import { Bot, ClipboardList, Send, Sparkles, X } from 'lucide-react'
import { useEffect, useState } from 'react'

interface ChatMessage {
  id: string
  role: 'assistant' | 'user'
  text: string
}

const quickPrompts = ['今晚怎么安排', '拆解实验报告', '今天状态怎么样']
const SEED_TEXT = '我在的。可以问我今晚怎么安排，或者让我帮你拆解任务。'

function makeId(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 10000)}`
}

function Companion(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'seed', role: 'assistant', text: SEED_TEXT }
  ])

  // 打开面板时载入最近对话
  useEffect(() => {
    if (!open) return
    void window.desktop
      .chatHistory()
      .then((rows) => {
        if (rows.length === 0) return
        setMessages([
          ...rows.map((r) => ({
            id: `${r.created_at}-${r.role}`,
            role: r.role === 'assistant' ? ('assistant' as const) : ('user' as const),
            text: r.content
          }))
        ])
      })
      .catch(() => {})
  }, [open])

  const send = (raw: string): void => {
    const text = raw.trim()
    if (!text || pending) return

    setMessages((current) => [...current, { id: makeId(), role: 'user', text }])
    setInput('')
    setPending(true)

    void window.desktop
      .chatSend(text)
      .then(({ reply }) => {
        setMessages((current) => [...current, { id: makeId(), role: 'assistant', text: reply }])
      })
      .catch(() => {
        setMessages((current) => [
          ...current,
          { id: makeId(), role: 'assistant', text: '我这边刚才没反应过来，再说一次好吗？' }
        ])
      })
      .finally(() => setPending(false))
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
