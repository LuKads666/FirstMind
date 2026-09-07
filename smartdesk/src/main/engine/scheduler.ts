import { getDatabase } from '../storage/database'
import { getCollectorState } from '../collectors/runtime'
import { getDistractionProb, refreshPrediction } from '../model/predictor'
import { evaluateRisks, type RiskCandidate, type RiskContext } from './risk-engine'
import { getSetting } from '../storage/settings-repo'
import { todayDateString, localIso } from '../utils/time'
import { sendRiskToShow, broadcastToDesktop } from '../alert-window'

// 提醒调度器（设计文档 12 / 19.1）：每 60s 组装上下文 → 规则引擎 → 落库 → 推送 UI

const EVAL_INTERVAL_MS = 60 * 1000
const COOLDOWN_MS = 30 * 60 * 1000

let timer: NodeJS.Timeout | null = null
const lastNotifiedAt = new Map<string, number>() // key = risk_type:task_id

export function startRiskScheduler(): void {
  if (timer) return
  timer = setInterval(() => {
    void evaluateOnce()
  }, EVAL_INTERVAL_MS)
}

export function stopRiskScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

interface ProfileData {
  avg_focus_minutes?: number
  delay_factor?: number
}

export async function evaluateOnce(now = new Date()): Promise<RiskCandidate[]> {
  refreshPrediction()
  const ctx = buildContext(now)
  const candidates = evaluateRisks(ctx)
  const dispatched: RiskCandidate[] = []

  for (const c of candidates) {
    const key = `${c.risk_type}:${c.task_id ?? 0}`
    const last = lastNotifiedAt.get(key)
    if (last && now.getTime() - last < COOLDOWN_MS) continue
    lastNotifiedAt.set(key, now.getTime())
    dispatchRisk(c, now)
    dispatched.push(c)
  }
  return dispatched
}

function buildContext(now: Date): RiskContext {
  const db = getDatabase()
  const today = todayDateString(now)
  const state = getCollectorState()

  const tasks = db
    .prepare(`SELECT id, title, due_at, status FROM tasks WHERE status IN ('open','in_progress')`)
    .all() as Array<{ id: number; title: string; due_at: string | null; status: string }>

  const sessionMinutes = (() => {
    if (!state.currentSessionStartedAt) return 0
    return Math.max(0, Math.round((now.getTime() - new Date(state.currentSessionStartedAt).getTime()) / 60000))
  })()

  const minutesOf = (filter: string): number => {
    const rows = db
      .prepare(
        `SELECT started_at, ended_at FROM app_sessions WHERE date(started_at) = ? AND category = ?`
      )
      .all(today, filter) as Array<{ started_at: string; ended_at: string | null }>
    return rows.reduce((sum, r) => {
      const start = new Date(r.started_at).getTime()
      const end = r.ended_at ? new Date(r.ended_at).getTime() : now.getTime()
      return sum + Math.max(0, end - start) / 60000
    }, 0)
  }

  const profileRow = db.prepare('SELECT data FROM user_profile WHERE id = 1').get() as
    | { data: string }
    | undefined
  let profile: ProfileData = {}
  try {
    profile = profileRow ? (JSON.parse(profileRow.data) as ProfileData) : {}
  } catch {
    profile = {}
  }

  const dnd = getSetting('do_not_disturb', { enabled: false }) as { enabled: boolean }

  // 演示模式：回放最近一条娱乐会话作为“当前状态”，让 A7 场景可确定性复现
  const demo = getSetting('demo_mode', { enabled: false }) as { enabled: boolean }
  let current_category = state.currentCategory
  let current_session_minutes = sessionMinutes
  if (demo.enabled) {
    const row = db
      .prepare(
        `SELECT started_at, ended_at FROM app_sessions WHERE category = 'entertainment'
         ORDER BY started_at DESC LIMIT 1`
      )
      .get() as { started_at: string; ended_at: string | null } | undefined
    if (row) {
      const start = new Date(row.started_at).getTime()
      const end = row.ended_at ? new Date(row.ended_at).getTime() : now.getTime()
      current_category = 'entertainment'
      current_session_minutes = Math.max(20, Math.round((end - start) / 60000))
    }
  }

  return {
    now,
    tasks,
    current_category,
    current_session_minutes,
    entertainment_minutes_today: Math.round(minutesOf('entertainment')),
    focus_minutes_today: Math.round(minutesOf('study_document') + minutesOf('study_code') + minutesOf('study_video')),
    profile: {
      avg_focus_minutes: profile.avg_focus_minutes ?? 42,
      delay_factor: profile.delay_factor ?? 0.3
    },
    model_distraction_prob: getDistractionProb(),
    last_notified: {},
    ignored_counts: loadIgnoredCounts(),
    do_not_disturb: dnd.enabled
  }
}

function loadIgnoredCounts(): Record<string, number> {
  const rows = getDatabase()
    .prepare(
      `SELECT re.task_id AS task_id, COUNT(*) AS n
       FROM notifications n JOIN risk_events re ON n.risk_id = re.id
       WHERE n.user_action = 'ignored' AND re.task_id IS NOT NULL
       GROUP BY re.task_id`
    )
    .all() as Array<{ task_id: number; n: number }>
  const map: Record<string, number> = {}
  for (const r of rows) map[String(r.task_id)] = r.n
  return map
}

function dispatchRisk(c: RiskCandidate, now: Date): void {
  const db = getDatabase()
  const { lastInsertRowid: riskId } = db
    .prepare(
      `INSERT INTO risk_events (raised_at, risk_type, risk_score, level, task_id, detail)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      localIso(now),
      c.risk_type,
      c.score,
      c.level,
      c.task_id ?? null,
      c.message
    )

  const { lastInsertRowid: notificationId } = db
    .prepare(
      `INSERT INTO notifications (sent_at, channel, title, body, risk_id, user_action)
       VALUES (?, ?, ?, ?, ?, '')`
    )
    .run(
      localIso(now),
      c.level === 'alert' ? 'alert' : c.level,
      c.title,
      c.message,
      Number(riskId)
    )

  const payload = {
    id: Number(notificationId),
    risk_type: c.risk_type,
    level: c.level,
    title: c.title,
    message: c.message,
    task_id: c.task_id
  }

  if (c.level === 'bubble' || c.level === 'alert') {
    sendRiskToShow(payload)
  }
  broadcastToDesktop('risk:raised', payload)
}

/** 演示模式（验收 A7）：启用后把最近一条娱乐会话回放为“当前状态”参与风险评估 */
export function triggerDemoRisk(): void {
  dispatchRisk(
    {
      risk_type: 'activity_mismatch',
      task_id: null,
      task_title: '演示场景',
      score: 0.66,
      level: 'bubble',
      title: '现在的状态可能偏离了任务',
      message:
        '「实验报告」还剩 2 天，按你平时的速度大约还需要 120 分钟。要不要先专注 25 分钟？'
    },
    new Date()
  )
}
