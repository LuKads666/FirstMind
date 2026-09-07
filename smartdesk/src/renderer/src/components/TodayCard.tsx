import { CalendarClock, Check, Circle, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { TaskItem } from '../data/mock'

interface TodayCardProps {
  tasks: TaskItem[]
  onToggleTask: (taskId: string) => void
  onUpdateTask: (
    taskId: string,
    patch: Partial<Pick<TaskItem, 'title' | 'meta' | 'tone'>>
  ) => void
  onAddTask: () => void
  onDeleteTask: (taskId: string) => void
}

function TodayCard({
  tasks,
  onToggleTask,
  onUpdateTask,
  onAddTask,
  onDeleteTask
}: TodayCardProps): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const done = tasks.filter((task) => task.tone === 'done').length

  return (
    <article className="glass-card today-card">
      <header className="card-heading">
        <div>
          <h2>今日</h2>
          <p className="card-subtitle">
            {done} / {tasks.length}
          </p>
        </div>
        <div className="card-tools">
          <button
            className={`card-edit-btn ${editing ? 'is-active' : ''}`}
            type="button"
            aria-label={editing ? '退出编辑今日任务' : '编辑今日任务'}
            onClick={() => setEditing((current) => !current)}
          >
            <Pencil size={13} />
          </button>
          <CalendarClock size={16} aria-hidden="true" />
        </div>
      </header>

      {editing ? (
        <>
          <ul className="task-edit-list">
            {tasks.map((task) => {
              const isDone = task.tone === 'done'
              return (
                <li key={task.id} className="task-edit-row">
                  <input
                    value={task.title}
                    aria-label="任务名称"
                    onChange={(event) =>
                      onUpdateTask(task.id, { title: event.target.value })
                    }
                  />
                  <input
                    className="edit-meta-input"
                    value={task.meta}
                    aria-label="任务时间或截止"
                    onChange={(event) =>
                      onUpdateTask(task.id, { meta: event.target.value })
                    }
                  />
                  <button
                    className="icon-button task-done-toggle"
                    type="button"
                    aria-label={isDone ? '标记未完成' : '标记完成'}
                    onClick={() => onToggleTask(task.id)}
                  >
                    {isDone ? (
                      <Check size={13} strokeWidth={3} />
                    ) : (
                      <Circle size={13} />
                    )}
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label="删除任务"
                    onClick={() => onDeleteTask(task.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              )
            })}
          </ul>
          <button className="add-inline-btn" type="button" onClick={onAddTask}>
            <Plus size={13} />
            添加任务
          </button>
        </>
      ) : (
        <ul className="task-list">
          {tasks.map((task) => {
            const isDone = task.tone === 'done'
            return (
              <li key={task.id} className="task-row">
                <button
                  className="task-hit"
                  type="button"
                  aria-label={`${task.title}，${isDone ? '已完成' : task.meta}`}
                  onClick={() => onToggleTask(task.id)}
                >
                  <span className={`task-check ${isDone ? 'is-done' : ''}`}>
                    {isDone ? (
                      <Check size={13} strokeWidth={3} aria-hidden="true" />
                    ) : (
                      <Circle size={13} aria-hidden="true" />
                    )}
                  </span>
                  <span
                    className={`task-title ${isDone ? 'is-done-text' : ''}`}
                  >
                    {task.title}
                  </span>
                  <span className={`task-meta tone-${task.tone}`}>
                    {isDone ? '已完成' : task.meta}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </article>
  )
}

export default TodayCard
