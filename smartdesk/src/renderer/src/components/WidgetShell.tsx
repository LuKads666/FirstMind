import { GripHorizontal, X } from 'lucide-react'
import { useRef } from 'react'

export interface WidgetPos {
  x: number // 视口宽度百分比 0-100
  y: number // 视口高度百分比 0-100
}

export interface WidgetLayoutItem extends WidgetPos {
  visible: boolean
}

export type WidgetLayout = Record<string, WidgetLayoutItem>

interface WidgetShellProps {
  id: string
  title: string
  editing: boolean
  layout?: WidgetLayoutItem
  naturalRect: { xPct: number; yPct: number } | null
  onMove: (id: string, pos: WidgetPos) => void
  onHide: (id: string) => void
  children: React.ReactNode
}

// 组件外壳：布局编辑模式下支持拖动与隐藏；编辑时绝对定位（保存过或取自然位置）
export function WidgetShell({
  id,
  title,
  editing,
  layout,
  naturalRect,
  onMove,
  onHide,
  children
}: WidgetShellProps): React.JSX.Element {
  const draggingRef = useRef(false)

  const absolute = editing || layout !== undefined
  const pos: WidgetPos = layout ?? {
    x: naturalRect?.xPct ?? 60,
    y: naturalRect?.yPct ?? 5
  }

  const startDrag = (down: React.PointerEvent): void => {
    if (!editing) return
    down.preventDefault()
    draggingRef.current = true
    const startX = down.clientX
    const startY = down.clientY
    const startPos = { ...pos }

    const onPointerMove = (move: PointerEvent): void => {
      if (!draggingRef.current) return
      const dxPct = ((move.clientX - startX) / window.innerWidth) * 100
      const dyPct = ((move.clientY - startY) / window.innerHeight) * 100
      const next = {
        x: clamp(startPos.x + dxPct, 0, 92),
        y: clamp(startPos.y + dyPct, 0, 92)
      }
      onMove(id, next)
    }
    const onPointerUp = (): void => {
      draggingRef.current = false
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  const hidden = layout?.visible === false
  if (hidden) return <></>

  return (
    <div
      data-widget={id}
      className={`widget-shell ${editing ? 'is-editing' : ''} ${absolute ? 'is-absolute' : ''}`}
      style={
        absolute
          ? { left: `${pos.x}%`, top: `${pos.y}%` }
          : undefined
      }
    >
      {editing && (
        <div className="widget-drag-bar" onPointerDown={startDrag}>
          <GripHorizontal size={13} />
          <span>{title}</span>
          <button
            type="button"
            className="widget-hide-btn"
            aria-label={`隐藏${title}`}
            onClick={() => onHide(id)}
          >
            <X size={12} />
          </button>
        </div>
      )}
      {children}
    </div>
  )
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

export default WidgetShell
