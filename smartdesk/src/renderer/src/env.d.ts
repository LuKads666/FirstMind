/// <reference types="vite/client" />

interface Window {
  desktop: {
    closePreview: () => Promise<void>
  }
}
