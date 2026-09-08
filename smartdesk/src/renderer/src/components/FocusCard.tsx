import { Coffee, Pause, Play, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { mockFocusLabel } from '../data/mock'
import { activityLabel } from '../data/real'

interface FocusCardProps {
  taskLabel?: string
}

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function FocusCard({ taskLabel = mockFocusLabel }: FocusCardProps): React.JSX.Element {
  const totalSeconds = 25 * 60
  const [remaining, setRemaining] = useState(totalSeconds)
  const [phase, setPhase] = useState<'idle' | 'running' | 'paused' | 'done'>('running')
  const [rounds, setRounds] = useState(0)
  const [live, setLive] = useState<{ current_activity: string; focus_minutes: number } | null>(
    null
  )
  const [linkedLabel, setLinkedLabel] = useState<string | null>(null)
  const timerRef = useRef<number | null>(null)
  const sessionIdRef = useRef<number | null>(null)

  // 真实专注状态（采集器会话）
  useEffect(() => {
    const load = (): void => {
      void window.desktop
        .getStatus()
        .then((s) => setLive({ current_activity: s.current_activity, focus_minutes: s.focus_minutes }))
        .catch(() => {})
    }
    load()
    const timer = window.setInterval(load, 5000)
    return () => window.clearInterval(timer)
  }, [])

  // 启动时恢复进行中的专注会话
  useEffect(() => {
    void window.desktop
      .focusActive()
      .then((active) => {
        if (active) sessionIdRef.current = active.id
      })
      .catch(() => {})
  }, [])

  // 提醒「开始任务」联动：主进程已建会话，这里同步计时状态
  useEffect(() => {
    const off = window.desktop.onFocusStarted(() => {
      void window.desktop
        .focusActive()
        .then((active) => {
          if (active) {
            sessionIdRef.current = active.id
            setLinkedLabel('提醒联动任务')
            setRemaining(totalSeconds)
            setPhase('running')
          }
        })
        .catch(() => {})
    })
    return off
  }, [totalSeconds])

  const beginSession = (): void => {
    if (sessionIdRef.current !== null) return
    void window.desktop
      .focusStart(null)
      .then((s) => {
        sessionIdRef.current = s.id
      })
      .catch(() => {})
  }

  const endSession = (completed: boolean): void => {
    if (sessionIdRef.current === null) return
    void window.desktop.focusStop(sessionIdRef.current, completed).catch(() => {})
    sessionIdRef.current = null
  }

  useEffect(() => {
    if (phase !== 'running') return

    timerRef.current = window.setInterval(() => {
      setRemaining((current) => {
        if (current <= 1) {
          setPhase('done')
          setRounds((value) => value + 1)
          endSession(true)
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
      endSession(false)
    } else if (phase === 'done') {
      setRemaining(totalSeconds)
      setPhase('running')
      beginSession()
    } else {
      setPhase('running')
      beginSession()
    }
  }

  const reset = (): void => {
    setRemaining(totalSeconds)
    setPhase('idle')
    endSession(false)
  }

  return (
    <article className="glass-card focus-card">
      <div className="focus-heading">
        <span className={`state-dot state-${phase}`} />
        <span>{statusText}</span>
        <span className="focus-context">
          {linkedLabel
            ? `${linkedLabel} · 剩余 ${Math.ceil(remaining / 60)} 分钟`
            : live && live.focus_minutes > 0
              ? `${activityLabel(live.current_activity)} · ${live.focus_minutes} 分钟`
              : taskLabel}
        </span>
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
