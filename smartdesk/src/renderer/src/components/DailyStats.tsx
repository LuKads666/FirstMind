import { CircleCheck, Clock3, Target } from 'lucide-react'
import type { TaskItem } from '../data/mock'
import { mockFocusTarget, mockFocusedMinutes } from '../data/mock'

interface DailyStatsProps {
  tasks: TaskItem[]
}

function DailyStats({ tasks }: DailyStatsProps): React.JSX.Element {
  const done = tasks.filter((task) => task.tone === 'done').length
  const focusProgress = Math.min(
    100,
    Math.round((mockFocusedMinutes / mockFocusTarget) * 100)
  )

  return (
    <article className="glass-card stats-card">
      <div className="stat-cell">
        <Clock3 size={15} aria-hidden="true" />
        <div>
          <strong>
            {mockFocusedMinutes}
            <span>/{mockFocusTarget}</span>
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
