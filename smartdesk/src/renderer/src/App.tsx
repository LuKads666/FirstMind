import { useEffect, useState } from 'react'
import AlertPage from './components/AlertPage'
import Companion from './components/Companion'
import DailyStats from './components/DailyStats'
import DeadlineBoard from './components/DeadlineBoard'
import FocusCard from './components/FocusCard'
import MusicBar from './components/MusicBar'
import ScheduleTimeline from './components/ScheduleTimeline'
import TodayCard from './components/TodayCard'
import { mockTasks, type TaskItem } from './data/mock'

const isAlertWindow =
  new URLSearchParams(window.location.search).get('window') === 'alert'

export default function App(): React.JSX.Element {
  return isAlertWindow ? <AlertPage /> : <DesktopScreen />
}

function DesktopScreen(): React.JSX.Element {
  const [tasks, setTasks] = useState<TaskItem[]>(mockTasks)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        void window.desktop.closePreview()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const toggleTask = (taskId: string): void => {
    setTasks((current) =>
      current.map((task) => {
        if (task.id !== taskId) return task
        return {
          ...task,
          tone: task.tone === 'done' ? 'normal' : 'done'
        }
      })
    )
  }

  const updateTask = (
    taskId: string,
    patch: Partial<Pick<TaskItem, 'title' | 'meta' | 'tone'>>
  ): void => {
    setTasks((current) =>
      current.map((task) => (task.id === taskId ? { ...task, ...patch } : task))
    )
  }

  const addTask = (): void => {
    const nextId = `task-${Date.now()}`
    setTasks((current) => [
      ...current,
      {
        id: nextId,
        title: '新任务',
        meta: '今日',
        tone: 'normal'
      }
    ])
  }

  const deleteTask = (taskId: string): void => {
    setTasks((current) => current.filter((task) => task.id !== taskId))
  }

  return (
    <div className="desktop">
      <img
        className="wallpaper"
        src="/wallpaper/default.jpg"
        alt=""
        draggable={false}
      />
      <div className="wallpaper-veil" />
      <div className="drag-handle" />

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
