import { z } from 'zod'

// IPC 通道名与数据契约：渲染层与主进程只通过这些定义通信。

export const IpcChannels = {
  PreviewClose: 'preview:close',
  TasksList: 'tasks:list',
  TaskCreate: 'task:create',
  TaskUpdate: 'task:update',
  TaskDelete: 'task:delete',
  StatusSnapshot: 'status:snapshot',
  CollectNow: 'collect:now',
  AgentStatus: 'agent:status',
  StatsToday: 'stats:today',
  ScheduleToday: 'schedule:today',
  DeadlinesList: 'deadlines:list',
  GetSetting: 'settings:get',
  SetSetting: 'settings:set'
} as const

export const CreateTaskSchema = z.object({
  title: z.string().min(1).max(200),
  due_at: z.string().nullable().optional(),
  estimated_minutes: z.number().int().positive().nullable().optional(),
  priority: z.enum(['high', 'medium', 'low']).optional()
})

export const UpdateTaskSchema = z.object({
  id: z.number().int().positive(),
  patch: z.object({
    title: z.string().min(1).max(200).optional(),
    status: z.enum(['open', 'in_progress', 'done', 'cancelled']).optional(),
    priority: z.enum(['high', 'medium', 'low']).optional(),
    due_at: z.string().nullable().optional(),
    estimated_minutes: z.number().int().positive().nullable().optional()
  })
})

export const IdSchema = z.number().int().positive()

export type CreateTaskPayload = z.infer<typeof CreateTaskSchema>
export type UpdateTaskPayload = z.infer<typeof UpdateTaskSchema>

// 19.2 状态推送快照：M1 先给出骨架字段，采集与模型上线后补全
export interface StatusSnapshot {
  current_activity: string
  focus_minutes: number
  distraction_prob: number | null
  today_tasks: { done: number; total: number }
  next_deadline: { title: string; due_in_hours: number } | null
}

export interface ForegroundInfo {
  process_id: number
  window_title: string
  category: string
  captured_at: string
}

export interface AgentStatusInfo {
  available: boolean
  models: string[]
  base_url: string
}

export interface TodayStatsInfo {
  focus_minutes: number
  entertainment_minutes: number
  study_minutes: number
  active_minutes: number
  session_count: number
  current_category: string
}

export interface ScheduleEventInfo {
  id: number
  title: string
  source_type: string
  start_at: string
  end_at: string | null
  location: string
}

export interface DeadlineInfo {
  id: number
  title: string
  due_at: string | null
  due_in_hours: number | null
  source_type: string
}
