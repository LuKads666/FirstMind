import { CalendarX2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { type DeadlineItem } from '../data/mock'

function DeadlineBoard(): React.JSX.Element {
  const [items, setItems] = useState<DeadlineItem[]>([])
  const [editing, setEditing] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const reload = (): void => {
    void window.desktop
      .getDeadlines()
      .then((rows) =>
        setItems(
          rows.map((r) => ({
            id: String(r.id),
            title: r.title,
            dueText: new Date(r.due_at).toLocaleDateString('zh-CN', {
              month: 'numeric',
              day: 'numeric'
            }),
            daysLeft: Math.max(1, Math.round(r.due_in_hours / 24))
          }))
        )
      )
      .catch(() => {})
  }

  useEffect(reload, [])

  const updateItem = (
    itemId: string,
    patch: Partial<Omit<DeadlineItem, 'id'>>
  ): void => {
    setItems((current) =>
      current.map((item) => (item.id === itemId ? { ...item, ...patch } : item))
    )
    if (patch.daysLeft !== undefined) {
      const due = new Date(Date.now() + patch.daysLeft * 86400000)
      void window.desktop.updateTask({
        id: Number(itemId),
        patch: { due_at: due.toISOString() }
      })
    }
  }

  const addItem = (): void => {
    void window.desktop
      .createTask({ title: '新截止', due_at: new Date(Date.now() + 23 * 86400000).toISOString() })
      .then(reload)
  }

  const deleteItem = (itemId: string): void => {
    setItems((current) => current.filter((item) => item.id !== itemId))
    void window.desktop.deleteTask(Number(itemId))
  }

  return (
    <article className="glass-card deadline-card">
      <header className="card-heading">
        <div>
          <h2>截止日期</h2>
          <p className="card-subtitle">近期 {items.length} 项</p>
        </div>
        <div className="card-tools">
          <button
            className={`card-edit-btn ${editing ? 'is-active' : ''}`}
            type="button"
            aria-label={editing ? '退出编辑截止日期' : '编辑截止日期'}
            onClick={() => setEditing((current) => !current)}
          >
            <Pencil size={13} />
          </button>
          <CalendarX2 size={16} aria-hidden="true" />
        </div>
      </header>

      {editing ? (
        <>
          <ul className="deadline-edit-list">
            {items.map((item) => (
              <li key={item.id} className="deadline-edit-row">
                <input
                  value={item.title}
                  aria-label="截止事项"
                  onChange={(event) =>
                    updateItem(item.id, { title: event.target.value })
                  }
                />
                <input
                  value={item.dueText}
                  aria-label="截止日期"
                  onChange={(event) =>
                    updateItem(item.id, { dueText: event.target.value })
                  }
                />
                <input
                  className="days-input"
                  type="number"
                  min={0}
                  value={item.daysLeft}
                  aria-label="剩余天数"
                  onChange={(event) =>
                    updateItem(item.id, {
                      daysLeft: Number(event.target.value)
                    })
                  }
                />
                <button
                  className="icon-button"
                  type="button"
                  aria-label="删除截止事项"
                  onClick={() => deleteItem(item.id)}
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
          <button className="add-inline-btn" type="button" onClick={addItem}>
            <Plus size={13} />
            添加截止
          </button>
        </>
      ) : (
        <ul className="deadline-list">
          {items.map((item) => {
            const active = item.id === selectedId
            return (
              <li key={item.id}>
                <button
                  className={`deadline-row ${active ? 'is-open' : ''}`}
                  type="button"
                  aria-expanded={active}
                  onClick={() =>
                    setSelectedId((current) =>
                      current === item.id ? null : item.id
                    )
                  }
                >
                  <span className="deadline-copy">
                    <strong>{item.title}</strong>
                    <small>{item.dueText}</small>
                  </span>
                  <span
                    className={`deadline-badge ${
                      item.daysLeft <= 2 ? 'is-urgent' : ''
                    }`}
                  >
                    剩 {item.daysLeft} 天
                  </span>
                </button>
                {active && (
                  <p className="deadline-detail">
                    距离 {item.title} 截止还有 {item.daysLeft} 天
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </article>
  )
}

export default DeadlineBoard
