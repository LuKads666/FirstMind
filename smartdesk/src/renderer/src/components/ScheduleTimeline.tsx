import { CalendarClock, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { type ScheduleItem } from '../data/mock'

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`
}

function ScheduleTimeline(): React.JSX.Element {
  const [items, setItems] = useState<ScheduleItem[]>([])
  const [editing, setEditing] = useState(false)
  const initialId = items.find((item) => item.state === 'next')?.id ?? items[0]?.id
  const [selectedId, setSelectedId] = useState(initialId)
  const selected = items.find((item) => item.id === selectedId)
  const nextItem = items.find((item) => item.state === 'next')

  useEffect(() => {
    const load = (): void => {
      void window.desktop
        .getScheduleToday()
        .then((events) => {
          const now = new Date()
          const mapped: ScheduleItem[] = events.map((ev) => {
            const start = new Date(ev.start_at)
            const end = ev.end_at ? new Date(ev.end_at) : start
            const pad = (n: number): string => String(n).padStart(2, '0')
            const time = `${pad(start.getHours())}:${pad(start.getMinutes())}-${pad(end.getHours())}:${pad(end.getMinutes())}`
            const state: ScheduleItem['state'] =
              end < now ? 'done' : start <= now ? 'next' : 'later'
            return {
              id: String(ev.id),
              time,
              title: ev.title,
              subtitle: ev.location || '日程',
              state
            }
          })
          setItems(mapped)
        })
        .catch(() => {})
    }
    load()
    const timer = window.setInterval(load, 60000)
    return () => window.clearInterval(timer)
  }, [])

  const updateItem = (
    itemId: string,
    patch: Partial<Omit<ScheduleItem, 'id'>>
  ): void => {
    setItems((current) =>
      current.map((item) => (item.id === itemId ? { ...item, ...patch } : item))
    )
  }

  const addItem = (): void => {
    const item: ScheduleItem = {
      id: nextId('schedule'),
      time: '20:00-21:00',
      title: '新安排',
      subtitle: '自习',
      state: 'later'
    }
    setItems((current) => [...current, item])
    setSelectedId(item.id)
  }

  const deleteItem = (itemId: string): void => {
    setItems((current) => current.filter((item) => item.id !== itemId))
  }

  return (
    <article className="glass-card schedule-card">
      <header className="card-heading">
        <div>
          <h2>今日日程</h2>
          <p className="card-subtitle">
            {nextItem ? `下一项 ${nextItem.time.slice(0, 5)}` : '今天已完成'}
          </p>
        </div>
        <div className="card-tools">
          <button
            className={`card-edit-btn ${editing ? 'is-active' : ''}`}
            type="button"
            aria-label={editing ? '退出编辑日程' : '编辑日程'}
            onClick={() => setEditing((current) => !current)}
          >
            <Pencil size={13} />
          </button>
          <CalendarClock size={16} aria-hidden="true" />
        </div>
      </header>

      {editing ? (
        <>
          <ul className="schedule-edit-list">
            {items.map((item) => (
              <li key={item.id} className="schedule-edit-row">
                <input
                  className="schedule-edit-input edit-time"
                  value={item.time}
                  aria-label="开始时间"
                  onChange={(event) =>
                    updateItem(item.id, { time: event.target.value })
                  }
                />
                <input
                  className="schedule-edit-input edit-title"
                  value={item.title}
                  aria-label="日程名称"
                  onChange={(event) =>
                    updateItem(item.id, { title: event.target.value })
                  }
                />
                <input
                  className="schedule-edit-input edit-subtitle"
                  value={item.subtitle}
                  aria-label="地点或备注"
                  onChange={(event) =>
                    updateItem(item.id, { subtitle: event.target.value })
                  }
                />
                <select
                  className="schedule-edit-input edit-state"
                  value={item.state}
                  aria-label="日程状态"
                  onChange={(event) =>
                    updateItem(item.id, {
                      state: event.target.value as ScheduleItem['state']
                    })
                  }
                >
                  <option value="done">已完成</option>
                  <option value="next">下一项</option>
                  <option value="later">稍后</option>
                </select>
                <button
                  className="icon-button edit-delete-btn"
                  type="button"
                  aria-label="删除日程"
                  onClick={() => deleteItem(item.id)}
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
          <button className="add-inline-btn" type="button" onClick={addItem}>
            <Plus size={13} />
            添加日程
          </button>
        </>
      ) : (
        <>
          <ul className="schedule-list">
            {items.map((item) => {
              const active = item.id === selectedId
              return (
                <li key={item.id}>
                  <button
                    className={`schedule-row state-${item.state} ${
                      active ? 'is-selected' : ''
                    }`}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                  >
                    <span className="schedule-time">{item.time}</span>
                    <span className="schedule-marker" />
                    <span className="schedule-copy">
                      <strong>{item.title}</strong>
                      <small>{item.subtitle}</small>
                    </span>
                    <span className="schedule-state-label">
                      {item.state === 'done'
                        ? '已完成'
                        : item.state === 'next'
                          ? '下一项'
                          : '稍后'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          {selected && (
            <div className="schedule-detail">
              {selected.state === 'done'
                ? `${selected.title} · ${selected.time} · 已结束`
                : `${selected.title} · ${selected.time} · ${selected.subtitle}`}
            </div>
          )}
        </>
      )}
    </article>
  )
}

export default ScheduleTimeline
