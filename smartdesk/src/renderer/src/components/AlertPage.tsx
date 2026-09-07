import { useEffect, useState } from 'react'

export interface RiskPayload {
  id: number
  risk_type: string
  level: string
  title: string
  message: string
  task_id: number | null
}

export default function AlertPage(): React.JSX.Element {
  const [risk, setRisk] = useState<RiskPayload | null>(null)

  useEffect(() => {
    const off = window.desktop.onRiskShow((payload) => setRisk(payload as RiskPayload))
    return off
  }, [])

  if (!risk) {
    return <div className="alert-root" />
  }

  const respond = (action: string): void => {
    void window.desktop.respondRisk({ id: risk.id, action })
    setRisk(null)
  }

  return (
    <div className="alert-root">
      <div className="alert-card">
        <div className={`alert-badge ${risk.level === 'alert' ? 'high' : ''}`}>
          {risk.level === 'alert' ? '重要提醒' : '轻提醒'}
        </div>
        <h3>{risk.title}</h3>
        <p className="alert-msg">{risk.message}</p>
        <div className="alert-actions">
          <button className="alert-btn primary" onClick={() => respond('accepted')}>
            开始任务
          </button>
          <button className="alert-btn ghost" onClick={() => respond('snoozed')}>
            稍后再说
          </button>
          <button className="alert-btn ghost" onClick={() => respond('ignored')}>
            忽略今日
          </button>
        </div>
      </div>
    </div>
  )
}
