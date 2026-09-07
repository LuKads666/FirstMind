/// <reference types="vite/client" />

interface ForegroundInfo {
  process_id: number
  window_title: string
  process_name: string
  category: string
  captured_at: string
}

interface StatusSnapshot {
  current_activity: string
  focus_minutes: number
  distraction_prob: number | null
  today_tasks: { done: number; total: number }
  next_deadline: { title: string; due_in_hours: number } | null
}

interface AgentStatusInfo {
  available: boolean
  models: string[]
  base_url: string
}

interface TaskRow {
  id: number
  title: string
  source_type: string
  due_at: string | null
  estimated_minutes: number | null
  status: 'open' | 'in_progress' | 'done' | 'cancelled'
  priority: 'high' | 'medium' | 'low'
  created_at: string
  updated_at: string
}

interface Window {
  desktop: {
    closePreview: () => Promise<void>
    listTasks: () => Promise<TaskRow[]>
    createTask: (payload: {
      title: string
      due_at?: string | null
      estimated_minutes?: number | null
      priority?: 'high' | 'medium' | 'low'
    }) => Promise<TaskRow>
    updateTask: (payload: {
      id: number
      patch: Partial<Pick<TaskRow, 'title' | 'status' | 'priority' | 'due_at' | 'estimated_minutes'>>
    }) => Promise<TaskRow | null>
    deleteTask: (id: number) => Promise<boolean>
    getStatus: () => Promise<StatusSnapshot>
    collectNow: () => Promise<ForegroundInfo | null>
    getAgentStatus: () => Promise<AgentStatusInfo>
  }
}
