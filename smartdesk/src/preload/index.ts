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
  collectNow: (): Promise<unknown> => ipcRenderer.invoke(IpcChannels.CollectNow),
  getAgentStatus: (): Promise<unknown> => ipcRenderer.invoke(IpcChannels.AgentStatus)
})
