import { Play, Settings, ShieldCheck, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'

// 主控台（设计文档 6.4）：设置、数据管理、隐私说明

interface BoolSetting {
  key: string
  label: string
  hint: string
  value: boolean
}

export default function ConsolePage(): React.JSX.Element {
  const [stats, setStats] = useState<Record<string, number> | null>(null)
  const [dnd, setDnd] = useState(false)
  const [demo, setDemo] = useState(false)
  const [login, setLogin] = useState(false)
  const [cleared, setCleared] = useState(false)
  const [evalHint, setEvalHint] = useState('')

  const loadStats = (): void => {
    void window.desktop.getDataStats().then(setStats).catch(() => {})
  }

  useEffect(() => {
    document.title = '智伴桌面 · 主控台'
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') window.close()
    }
    window.addEventListener('keydown', onKey)
    loadStats()
    void window.desktop.getSetting('do_not_disturb', { enabled: false }).then((v) => {
      const setting = v as { enabled?: boolean } | null
      setDnd(Boolean(setting?.enabled))
    })
    void window.desktop.getSetting('demo_mode', { enabled: false }).then((v) => {
      const setting = v as { enabled?: boolean } | null
      setDemo(Boolean(setting?.enabled))
    })
    void window.desktop
      .getLoginItem()
      .then((v) => setLogin(Boolean(v.openAtLogin)))
      .catch(() => {})
  }, [])

  const saveSetting = (key: string, enabled: boolean): void => {
    void window.desktop.setSetting(key, { enabled })
  }

  const toggle = (setting: BoolSetting): void => {
    const next = !setting.value
    if (setting.key === 'do_not_disturb') {
      setDnd(next)
      saveSetting('do_not_disturb', next)
    } else if (setting.key === 'demo_mode') {
      setDemo(next)
      saveSetting('demo_mode', next)
    } else if (setting.key === 'login_item') {
      setLogin(next)
      void window.desktop.setLoginItem(next).catch(() => {})
    }
  }

  const runEvaluate = (): void => {
    void window.desktop
      .evaluateRisks()
      .then(({ dispatched }) => {
        setEvalHint(dispatched > 0 ? `已触发 ${dispatched} 条提醒，看看桌面右下角` : '当前没有满足条件的风险')
        window.setTimeout(() => setEvalHint(''), 4000)
      })
      .catch(() => setEvalHint('评估失败'))
  }

  const clearData = (): void => {
    if (!window.confirm('将删除全部行为记录、专注会话、风险与提醒记录、对话记录。\n任务、日程和设置会保留。此操作不可恢复，确定继续吗？')) {
      return
    }
    void window.desktop
      .clearBehaviorData()
      .then(() => {
        setCleared(true)
        loadStats()
        window.setTimeout(() => setCleared(false), 3000)
      })
      .catch(() => {})
  }

  const settings: BoolSetting[] = [
    {
      key: 'do_not_disturb',
      label: '勿扰时段',
      hint: '开启后全天不主动提醒；默认规则 23:30–07:30 本来就不打扰',
      value: dnd
    },
    {
      key: 'demo_mode',
      label: '演示模式',
      hint: '回放最近一段娱乐行为用于现场演示风险提醒（验收 A7）',
      value: demo
    },
    {
      key: 'login_item',
      label: '开机自动启动',
      hint: '登录 Windows 后在后台静默启动智伴桌面',
      value: login
    }
  ]

  return (
    <div className="console-root">
      <header className="console-header">
        <h1>主控台</h1>
        <p>设置、数据与隐私都只保存在这台电脑上</p>
      </header>

      <section className="console-section">
        <h2>
          <ShieldCheck size={15} /> 隐私承诺
        </h2>
        <ul className="privacy-list">
          <li>只记录“当前最前面的窗口是什么软件”，<strong>不记录键盘输入内容</strong>，<strong>不截屏</strong>，不读取文件正文。</li>
          <li>所有数据只保存在本机数据库，<strong>不上传任何服务器</strong>。</li>
          <li>深夜 23:30–07:30 不主动提醒；同一提醒 30 分钟内不重复。</li>
          <li>你可以随时在下方一键清除全部行为数据。</li>
        </ul>
      </section>

      <section className="console-section">
        <h2>
          <Settings size={15} /> 设置
        </h2>
        <div className="setting-rows">
          {settings.map((s) => (
            <div key={s.key} className="setting-row">
              <div>
                <strong>{s.label}</strong>
                <small>{s.hint}</small>
                {s.key === 'demo_mode' && (
                  <div className="eval-row">
                    <button type="button" className="eval-btn" onClick={runEvaluate}>
                      <Play size={11} /> 立即评估
                    </button>
                    {evalHint && <small className="eval-hint">{evalHint}</small>}
                  </div>
                )}
              </div>
              <button
                type="button"
                className={`switch ${s.value ? 'on' : ''}`}
                role="switch"
                aria-checked={s.value}
                aria-label={s.label}
                onClick={() => toggle(s)}
              >
                <span className="switch-knob" />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="console-section">
        <h2>
          <Trash2 size={15} /> 本机数据
        </h2>
        <div className="stats-grid">
          {stats &&
            Object.entries(stats).map(([key, n]) => (
              <div key={key} className="stat-chip">
                <strong>{n}</strong>
                <small>{statNames[key] ?? key}</small>
              </div>
            ))}
        </div>
        <div className="danger-row">
          <button type="button" className="danger-btn" onClick={clearData}>
            清除全部行为数据
          </button>
          {cleared && <span className="cleared-hint">已清除 ✓</span>}
        </div>
      </section>

      <footer className="console-footer">智伴桌面 v0.1.0 · 2026 新工科工程实践创新竞赛作品</footer>
    </div>
  )
}

const statNames: Record<string, string> = {
  app_sessions: '应用会话',
  activity_ticks: '分钟行为片',
  file_events: '文件事件',
  focus_sessions: '专注会话',
  risk_events: '风险事件',
  notifications: '已发提醒',
  chat_logs: '对话记录',
  tasks: '任务',
  calendar_events: '日程'
}
