import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('desktop', {
  closePreview: (): Promise<void> => ipcRenderer.invoke('preview:close')
})
