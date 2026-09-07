import { CircleCheck, Clock3, Target } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { TaskItem } from '../data/mock'

interface DailyStatsProps {
  tasks: TaskItem[]
}

interface TodayStats {
  focus_minutes: number
  study_minutes: number
  entertainment_minutes: number
  active_minutes: number
  session_count: number
}

const FOCUS_TARGET = 120

function DailyStats({ tasks }: DailyStatsProps): React.JSX.Element {
  const [stats, setStats] = useState<TodayStats | null>(null)
  const done = tasks.filter((task) => task.tone === 'done').length

  useEffect(() => {
    const load = (): void => {
      void window.desktop
        .getTodayStats()
        .then((s) => setStats(s as TodayStats))
        .catch(() => {})
    }
    load()
    const timer = window.setInterval(load, 15000)
    return () => window.clearInterval(timer)
  }, [])

  const focusedMinutes = stats?.focus_minutes ?? 0
  const focusProgress = Math.min(100, Math.round((focusedMinutes / FOCUS_TARGET) * 100))

  return (
    <article className="glass-card stats-card">
      <div className="stat-cell">
        <Clock3 size={15} aria-hidden="true" />
        <div>
          <strong>
            {focusedMinutes}
            <span>/{FOCUS_TARGET}</span>
          </strong>
          <small>专注分钟</small>
        </div>
      </div>
      <div className="stat-cell">
        <CircleCheck size={15} aria-hidden="true" />
        <div>
          <strong>
            {done}
            <span>/{tasks.length}</span>
          </strong>
          <small>任务完成</small>
        </div>
      </div>
      <div className="stat-goal">
        <Target size={15} aria-hidden="true" />
        <div className="goal-meter">
          <span style={{ width: `${focusProgress}%` }} />
        </div>
        <small>{focusProgress}%</small>
      </div>
    </article>
  )
}

export default DailyStats
