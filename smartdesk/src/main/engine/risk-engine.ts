// 风险与规则引擎（设计文档 12）
// 纯逻辑、可注入时钟，规则保证稳定可解释的基础提醒，模型概率只调节强度。

export type RiskType =
  | 'ddl_near'
  | 'activity_mismatch'
  | 'task_not_started'
  | 'long_entertainment'
  | 'focus_overrun'
  | 'schedule_conflict'

export type RiskLevel = 'none' | 'desktop' | 'bubble' | 'alert'

export interface RiskTask {
  id: number
  title: string
  due_at: string | null
  status: string
}

export interface RiskProfile {
  avg_focus_minutes: number
  delay_factor: number
}

export interface RiskContext {
  now: Date
  tasks: RiskTask[]
  current_category: string
  current_session_minutes: number
  entertainment_minutes_today: number
  focus_minutes_today: number
  profile: RiskProfile
  model_distraction_prob: number | null
  /** 同一 (risk_type, task_id) 上次提醒时间，用于 30 分钟冷却 */
  last_notified: Record<string, string>
  /** 用户对同一任务提醒连续忽略次数 */
  ignored_counts: Record<string, number>
  do_not_disturb: boolean
}

export interface RiskCandidate {
  risk_type: RiskType
  task_id: number | null
  task_title: string | null
  score: number
  level: RiskLevel
  title: string
  message: string
}

const DDL_WINDOW_HOURS = 72
const MISMATCH_MIN_MINUTES = 15
const ENTERTAINMENT_THRESHOLD_MINUTES = 30
const DDL_HOURS = [21, 22] // task_not_started 检查时段

export const WEIGHTS = { urgency: 0.4, mismatch: 0.3, model: 0.2, delay: 0.1 }

function hoursUntil(now: Date, due: string): number {
  return (new Date(due).getTime() - now.getTime()) / 3600000
}

export function levelForScore(score: number): RiskLevel {
  if (score > 0.8) return 'alert'
  if (score > 0.6) return 'bubble'
  if (score > 0.3) return 'desktop'
  return 'none'
}

export function isInDoNotDisturb(now: Date): boolean {
  const minutes = now.getHours() * 60 + now.getMinutes()
  return minutes >= 23 * 60 + 30 || minutes < 7 * 60 + 30
}

export function evaluateRisks(ctx: RiskContext): RiskCandidate[] {
  if (ctx.do_not_disturb || isInDoNotDisturb(ctx.now)) return []

  const open = ctx.tasks.filter((t) => t.status === 'open' || t.status === 'in_progress')
  const candidates: RiskCandidate[] = []
  const modelProb = ctx.model_distraction_prob ?? 0
  const isFun =
    ctx.current_category === 'entertainment' || ctx.current_category === 'browsing_other'

  for (const task of open) {
    if (!task.due_at) continue
    const hoursLeft = hoursUntil(ctx.now, task.due_at)
    if (hoursLeft < 0 || hoursLeft > DDL_WINDOW_HOURS) continue

    const urgency = Math.max(0, Math.min(1, 1 - hoursLeft / DDL_WINDOW_HOURS))
    const mismatch = isFun && ctx.current_session_minutes >= MISMATCH_MIN_MINUTES ? 1 : 0
    const score = Math.min(
      1,
      WEIGHTS.urgency * urgency +
        WEIGHTS.mismatch * mismatch +
        WEIGHTS.model * modelProb +
        WEIGHTS.delay * ctx.profile.delay_factor
    )
    const level = levelForScore(score)
    if (level === 'none') continue

    const hoursText = hoursLeft >= 24 ? `${Math.floor(hoursLeft / 24)} 天` : `${Math.round(hoursLeft)} 小时`
    const key = `${task.id}`
    if (mismatch === 1) {
      candidates.push({
        risk_type: 'activity_mismatch',
        task_id: task.id,
        task_title: task.title,
        score,
        level: downgrade(level, ctx.ignored_counts[key]),
        title: '现在的状态可能偏离了任务',
        message: `「${task.title}」还剩 ${hoursText}，按你平时的速度大约还需要 ${Math.round(ctx.profile.avg_focus_minutes)} 分钟。要不要先专注 25 分钟？`
      })
    } else {
      candidates.push({
        risk_type: 'ddl_near',
        task_id: task.id,
        task_title: task.title,
        score,
        level: downgrade(level, ctx.ignored_counts[key]),
        title: '临近截止',
        message: `「${task.title}」将在 ${hoursText} 后截止，建议今天先推进一小步。`
      })
    }
  }

  // long_entertainment：娱乐超过阈值且存在待办
  const hasOpenWork = open.length > 0
  if (
    ctx.current_category === 'entertainment' &&
    ctx.current_session_minutes >= ENTERTAINMENT_THRESHOLD_MINUTES &&
    hasOpenWork
  ) {
    const next = open.find((t) => t.due_at) ?? open[0]
    candidates.push({
      risk_type: 'long_entertainment',
      task_id: next.id,
      task_title: next.title,
      score: Math.min(1, 0.45 + modelProb * 0.3),
      level: 'bubble',
      title: '休息得够久了',
      message: `已经连续娱乐 ${ctx.current_session_minutes} 分钟，「${next.title}」还开着。现在回来做点小任务吗？`
    })
  }

  // task_not_started：当天截止的任务在晚间仍未动
  for (const task of open) {
    if (!task.due_at) continue
    const due = new Date(task.due_at)
    const hour = ctx.now.getHours()
    if (
      due.getDate() === ctx.now.getDate() &&
      due.getMonth() === ctx.now.getMonth() &&
      hour >= DDL_HOURS[0] &&
      ctx.focus_minutes_today < 10
    ) {
      candidates.push({
        risk_type: 'task_not_started',
        task_id: task.id,
        task_title: task.title,
        score: 0.55,
        level: 'desktop',
        title: '今天的任务还没有开始',
        message: `「${task.title}」今天截止，但今天还没有专注记录。从最小的一步开始？`
      })
    }
  }

  // focus_overrun：连续专注超过个人均值 1.5 倍
  if (
    ctx.current_category.startsWith('study_') &&
    ctx.profile.avg_focus_minutes > 0 &&
    ctx.current_session_minutes > ctx.profile.avg_focus_minutes * 1.5
  ) {
    candidates.push({
      risk_type: 'focus_overrun',
      task_id: null,
      task_title: null,
      score: 0.35,
      level: 'desktop',
      title: '该休息一下了',
      message: `你已经连续专注 ${ctx.current_session_minutes} 分钟，超过平时的 ${ctx.profile.avg_focus_minutes} 分钟。休息 5 分钟吧。`
    })
  }

  // 冷却：同一 (risk_type, task_id) 30 分钟内只提醒一次
  const nowMs = ctx.now.getTime()
  return candidates.filter((c) => {
    const key = `${c.risk_type}:${c.task_id ?? 0}`
    const last = ctx.last_notified[key]
    if (!last) return true
    return nowMs - new Date(last).getTime() >= 30 * 60 * 1000
  })
}

function downgrade(level: RiskLevel, ignoredCount: number | undefined): RiskLevel {
  // 用户连续忽略同一任务 3 次后降级为桌面提示（设计文档 12.3）
  if ((ignoredCount ?? 0) >= 3 && (level === 'alert' || level === 'bubble')) return 'desktop'
  return level
}
