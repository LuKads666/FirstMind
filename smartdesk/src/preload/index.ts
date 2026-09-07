import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannels } from '../main/ipc/channels'

// preload：向渲染层暴露类型化的最小能力面（设计文档 5 架构规则）
contextBridge.exposeInMainWorld('desktop', {
  closePreview: (): Promise<void> => ipcRenderer.invoke(IpcChannels.PreviewClose),

  listTasks: (): Promise<unknown> => ipcRenderer.invoke(IpcChannels.TasksList),
  createTask: (payload: unknown): Promise<unknown> =>
    ipcRenderer.invoke(IpcChannels.TaskCreate, payload),
  updateTask: (payload: unknown): Promise<unknown> =>
    ipcRenderer.invoke(IpcChannels.TaskUpdate, payload),
  deleteTask: (id: number): Promise<boolean> => ipcRenderer.invoke(IpcChannels.TaskDelete, id),

  getStatus: (): Promise<unknown> => ipcRenderer.invoke(IpcChannels.StatusSnapshot),
  getTodayStats: (): Promise<unknown> => ipcRenderer.invoke(IpcChannels.StatsToday),
  getScheduleToday: (): Promise<unknown> => ipcRenderer.invoke(IpcChannels.ScheduleToday),
  getDeadlines: (): Promise<unknown> => ipcRenderer.invoke(IpcChannels.DeadlinesList),
  collectNow: (): Promise<unknown> => ipcRenderer.invoke(IpcChannels.CollectNow),
  getAgentStatus: (): Promise<unknown> => ipcRenderer.invoke(IpcChannels.AgentStatus),
  evaluateRisks: (): Promise<unknown> => ipcRenderer.invoke(IpcChannels.RiskEvaluate),

  getSetting: (key: string): Promise<unknown> => ipcRenderer.invoke(IpcChannels.GetSetting, key),
  setSetting: (key: string, value: unknown): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.SetSetting, key, value),

  respondRisk: (payload: { id: number; action: string }): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.RiskRespond, payload),

  onRiskShow: (cb: (payload: unknown) => void): (() => void) => subscribe('risk:show', cb),
  onRiskRaised: (cb: (payload: unknown) => void): (() => void) => subscribe('risk:raised', cb)
})

function subscribe(channel: string, cb: (payload: unknown) => void): () => void {
  const handler = (_event: unknown, payload: unknown): void => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}
