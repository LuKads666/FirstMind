import { useEffect, useState } from 'react'
import AlertPage from './components/AlertPage'
import Companion from './components/Companion'
import DailyStats from './components/DailyStats'
import DeadlineBoard from './components/DeadlineBoard'
import FocusCard from './components/FocusCard'
import MusicBar from './components/MusicBar'
import ScheduleTimeline from './components/ScheduleTimeline'
import TodayCard from './components/TodayCard'
import WallpaperPicker, { THEME_CSS, useWallpaper } from './components/WallpaperPicker'
import { type TaskItem } from './data/mock'
import { dueText } from './data/real'

const isAlertWindow =
  new URLSearchParams(window.location.search).get('window') === 'alert'

export default function App(): React.JSX.Element {
  return isAlertWindow ? <AlertPage /> : <DesktopScreen />
}

function rowToItem(row: TaskRow): TaskItem {
  return {
    id: String(row.id),
    title: row.title,
    meta: dueText(row.due_at),
    tone:
      row.status === 'done'
        ? 'done'
        : row.due_at && new Date(row.due_at).getTime() - Date.now() < 72 * 3600000
          ? 'warn'
          : 'normal'
  }
}

function DesktopScreen(): React.JSX.Element {
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const { wallpaper } = useWallpaper()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        void window.desktop.closePreview()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const reloadTasks = (): void => {
    void window.desktop
      .listTasks()
      .then((rows) => setTasks(rows.map(rowToItem)))
      .catch(() => {})
  }

  useEffect(() => {
    reloadTasks()
    const timer = window.setInterval(reloadTasks, 15000)
    return () => window.clearInterval(timer)
  }, [])

  const toggleTask = (taskId: string): void => {
    const numericId = Number(taskId)
    const target = tasks.find((t) => t.id === taskId)
    if (!target || Number.isNaN(numericId)) return
    const nextTone = target.tone === 'done' ? 'normal' : 'done'
    setTasks((current) =>
      current.map((t) => (t.id === taskId ? { ...t, tone: nextTone } : t))
    )
    void window.desktop
      .updateTask({ id: numericId, patch: { status: nextTone === 'done' ? 'done' : 'open' } })
      .then(reloadTasks)
  }

  const updateTask = (
    taskId: string,
    patch: Partial<Pick<TaskItem, 'title' | 'meta' | 'tone'>>
  ): void => {
    setTasks((current) =>
      current.map((task) => (task.id === taskId ? { ...task, ...patch } : task))
    )
    if (patch.title !== undefined) {
      void window.desktop.updateTask({ id: Number(taskId), patch: { title: patch.title } })
    }
  }

  const addTask = (): void => {
    void window.desktop.createTask({ title: '新任务' }).then(reloadTasks)
  }

  const deleteTask = (taskId: string): void => {
    setTasks((current) => current.filter((task) => task.id !== taskId))
    const numericId = Number(taskId)
    if (!Number.isNaN(numericId)) void window.desktop.deleteTask(numericId)
  }

  return (
    <div className="desktop">
      {wallpaper.type === 'image' && wallpaper.path ? (
        <img
          className="wallpaper"
          src={window.desktop.musicUrl(wallpaper.path)}
          alt=""
          draggable={false}
        />
      ) : (
        <div
          className="wallpaper wallpaper-theme"
          style={{ backgroundImage: THEME_CSS[wallpaper.id ?? 'aurora'] ?? THEME_CSS.aurora }}
        />
      )}
      <div className="wallpaper-veil" />
      <div className="drag-handle" />
      <div className="top-left-tools">
        <WallpaperPicker />
        <button
          className="import-btn"
          type="button"
          aria-label="导入课程表或作业"
          onClick={() => void window.desktop.importFile()}
        >
          导入日程
        </button>
      </div>

      <div className="right-stack">
        <TodayCard
          tasks={tasks}
          onToggleTask={toggleTask}
          onUpdateTask={updateTask}
          onAddTask={addTask}
          onDeleteTask={deleteTask}
        />
        <ScheduleTimeline />
        <DeadlineBoard />
        <FocusCard />
        <DailyStats tasks={tasks} />
      </div>

      <div className="bottom-cluster">
        <MusicBar />
        <Companion />
      </div>
    </div>
  )
}
