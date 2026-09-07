import { Image as ImageIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

// 壁纸选择（设计文档 6.3 阶段 1）：内置主题 + 本机图片（同时更新系统壁纸）

export interface WallpaperSetting {
  type: 'theme' | 'image'
  id?: string
  path?: string
}

export const THEME_CSS: Record<string, string> = {
  aurora: 'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
  dusk: 'linear-gradient(135deg, #17232a 0%, #35506b 55%, #6c5b7b 100%)',
  midnight: 'linear-gradient(160deg, #10181c 0%, #17232a 60%, #1d2f36 100%)'
}

export function useWallpaper(): {
  wallpaper: WallpaperSetting
  applyTheme: (id: string) => void
  chooseImage: () => void
} {
  const [wallpaper, setWallpaper] = useState<WallpaperSetting>({ type: 'theme', id: 'aurora' })

  useEffect(() => {
    void window.desktop
      .wallpaperGet()
      .then((w) => setWallpaper(w))
      .catch(() => {})
  }, [])

  const applyTheme = (id: string): void => {
    setWallpaper({ type: 'theme', id })
    void window.desktop.wallpaperSetTheme(id).catch(() => {})
  }

  const chooseImage = (): void => {
    void window.desktop
      .wallpaperChooseImage()
      .then((w) => {
        if (w) setWallpaper(w)
      })
      .catch(() => {})
  }

  return { wallpaper, applyTheme, chooseImage }
}

function WallpaperPicker(): React.JSX.Element {
  const { wallpaper, applyTheme, chooseImage } = useWallpaper()

  return (
    <div className="wallpaper-picker" role="toolbar" aria-label="壁纸选择">
      {Object.keys(THEME_CSS).map((id) => (
        <button
          key={id}
          type="button"
          className={`wallpaper-dot ${wallpaper.type === 'theme' && wallpaper.id === id ? 'is-active' : ''}`}
          style={{ backgroundImage: THEME_CSS[id] }}
          aria-label={`主题壁纸 ${id}`}
          onClick={() => applyTheme(id)}
        />
      ))}
      <button
        type="button"
        className={`wallpaper-dot image ${wallpaper.type === 'image' ? 'is-active' : ''}`}
        aria-label="选择本机图片"
        onClick={chooseImage}
      >
        <ImageIcon size={12} />
      </button>
    </div>
  )
}

export default WallpaperPicker
