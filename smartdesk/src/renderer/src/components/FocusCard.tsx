import { Coffee, Pause, Play, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { mockFocusLabel, mockFocusMinutes } from '../data/mock'

interface FocusCardProps {
  taskLabel?: string
}

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function FocusCard({ taskLabel = mockFocusLabel }: FocusCardProps): React.JSX.Element {
  const totalSeconds = mockFocusMinutes * 60
  const [remaining, setRemaining] = useState(totalSeconds)
  const [phase, setPhase] = useState<'idle' | 'running' | 'paused' | 'done'>('running')
  const [rounds, setRounds] = useState(0)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (phase !== 'running') return

    timerRef.current = window.setInterval(() => {
      setRemaining((current) => {
        if (current <= 1) {
          setPhase('done')
          setRounds((value) => value + 1)
          return 0
        }
        return current - 1
      })
    }, 1000)

    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current)
      }
    }
  }, [phase])

  const statusText =
    phase === 'running' ? '专注中' : phase === 'paused' ? '已暂停' : '专注完成'
  const progress = ((totalSeconds - remaining) / totalSeconds) * 100

  const toggle = (): void => {
    if (phase === 'running') {
      setPhase('paused')
    } else if (phase === 'done') {
      setRemaining(totalSeconds)
      setPhase('running')
    } else {
      setPhase('running')
    }
  }

  const reset = (): void => {
    setRemaining(totalSeconds)
    setPhase('idle')
  }

  return (
    <article className="glass-card focus-card">
      <div className="focus-heading">
        <span className={`state-dot state-${phase}`} />
        <span>{statusText}</span>
        <span className="focus-context">{taskLabel}</span>
      </div>
      <div className="focus-time">{formatTime(remaining)}</div>
      <div className="focus-actions">
        <button
          className="icon-button primary"
          aria-label={phase === 'running' ? '暂停专注' : '开始专注'}
          onClick={toggle}
        >
          {phase === 'running' ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button className="icon-button" aria-label="重置专注" onClick={reset}>
          <RotateCcw size={15} />
        </button>
      </div>
      <div className="focus-progress" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>
      {phase === 'done' && (
        <div className="rest-coach">
          <Coffee size={14} aria-hidden="true" />
          <span>
            第 {rounds} 轮完成，建议休息 5 分钟后再开始下一轮
          </span>
        </div>
      )}
    </article>
  )
}

export default FocusCard
