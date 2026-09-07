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
    getTodayStats: () => Promise<{
      focus_minutes: number
      entertainment_minutes: number
      study_minutes: number
      active_minutes: number
      session_count: number
      current_category: string
    }>
    getScheduleToday: () => Promise<
      Array<{
        id: number
        title: string
        source_type: string
        start_at: string
        end_at: string | null
        location: string
      }>
    >
    getDeadlines: () => Promise<
      Array<{
        id: number
        title: string
        due_at: string
        due_in_hours: number
        source_type: string
      }>
    >
    collectNow: () => Promise<ForegroundInfo | null>
    getAgentStatus: () => Promise<AgentStatusInfo>
    evaluateRisks: () => Promise<{ dispatched: number }>
    getSetting: (key: string) => Promise<unknown>
    setSetting: (key: string, value: unknown) => Promise<boolean>
    respondRisk: (payload: { id: number; action: string }) => Promise<boolean>
    musicChooseFolder: () => Promise<{ folder: string | null; tracks: number }>
    musicList: () => Promise<
      Array<{ id: string; title: string; artist: string; path: string }>
    >
    musicUrl: (path: string) => string
    chatSend: (text: string) => Promise<{ reply: string; source: string }>
    chatHistory: () => Promise<Array<{ role: string; content: string; created_at: string }>>
    importFile: () => Promise<{ imported: number; tasksCreated: number; warnings: string[] } | null>
    wallpaperGet: () => Promise<{ type: 'theme' | 'image'; id?: string; path?: string }>
    wallpaperSetTheme: (id: string) => Promise<unknown>
    wallpaperChooseImage: () => Promise<{ type: 'image'; path: string } | null>
    onRiskShow: (cb: (payload: unknown) => void) => () => void
    onRiskRaised: (cb: (payload: unknown) => void) => () => void
  }
}
