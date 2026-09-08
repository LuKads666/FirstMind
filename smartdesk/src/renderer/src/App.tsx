import { useCallback, useEffect, useRef, useState } from 'react'
import AlertPage from './components/AlertPage'
import Companion from './components/Companion'
import ConsolePage from './components/ConsolePage'
import DailyStats from './components/DailyStats'
import DeadlineBoard from './components/DeadlineBoard'
import FocusCard from './components/FocusCard'
import MusicBar from './components/MusicBar'
import ScheduleTimeline from './components/ScheduleTimeline'
import TodayCard from './components/TodayCard'
import WallpaperPicker, { THEME_CSS, useWallpaper } from './components/WallpaperPicker'
import WidgetShell, {
  type WidgetLayout,
  type WidgetLayoutItem,
  type WidgetPos
} from './components/WidgetShell'
import { LayoutGrid, RotateCcw, Settings2 } from 'lucide-react'
import { type TaskItem } from './data/mock'
import { dueText } from './data/real'

const windowMode = new URLSearchParams(window.location.search).get('window')

export default function App(): React.JSX.Element {
  if (windowMode === 'alert') return <AlertPage />
  if (windowMode === 'console') return <ConsolePage />
  return <DesktopScreen />
}

interface TaskRow {
  id: number
  title: string
  due_at: string | null
  status: string
}

function rowToItem(row: TaskRow): TaskItem {
  return {
    id: String(row.id),
    title: row.title,
    meta: dueText(row.due_at),
    tone:
      row.status === 'done'
        ? 'done'
        : row.due_at && new Date(row.due_at).getTime() - Date.now() < 72 * 3600000
          ? 'warn'
          : 'normal'
  }
}

const WIDGET_TITLES: Record<string, string> = {
  today: '今日任务',
  schedule: '今日日程',
  deadline: '截止日期',
  focus: '专注计时',
  stats: '数据统计',
  music: '音乐播放器'
}
const WIDGET_IDS = Object.keys(WIDGET_TITLES)

function DesktopScreen(): React.JSX.Element {
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const { wallpaper, applyTheme, chooseImage, syncFromSystem } = useWallpaper()
  const [layout, setLayout] = useState<WidgetLayout | null>(null)
  const [editing, setEditing] = useState(false)
  const layoutSaveTimer = useRef<number | null>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        void window.desktop.closePreview()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const reloadTasks = (): void => {
    void window.desktop
      .listTasks()
      .then((rows) => setTasks(rows.map(rowToItem)))
      .catch(() => {})
  }

  useEffect(() => {
    reloadTasks()
    const timer = window.setInterval(reloadTasks, 15000)
    return () => window.clearInterval(timer)
  }, [])

  // 载入已保存的布局
  useEffect(() => {
    void window.desktop
      .getSetting('widget_layout', null)
      .then((saved) => {
        if (saved && typeof saved === 'object') setLayout(saved as WidgetLayout)
      })
      .catch(() => {})
  }, [])

  const persistLayout = useCallback((next: WidgetLayout | null): void => {
    if (layoutSaveTimer.current !== null) window.clearTimeout(layoutSaveTimer.current)
    layoutSaveTimer.current = window.setTimeout(() => {
      void window.desktop.setSetting('widget_layout', next).catch(() => {})
    }, 250)
  }, [])

  const measureNatural = (id: string): WidgetPos | null => {
    const el = document.querySelector<HTMLElement>(`[data-widget="${id}"]`)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return {
      x: Math.round((r.left / window.innerWidth) * 1000) / 10,
      y: Math.round((r.top / window.innerHeight) * 1000) / 10
    }
  }

  const enterEditing = (): void => {
    const base: WidgetLayout = { ...(layout ?? {}) }
    for (const id of WIDGET_IDS) {
      if (!base[id]) {
        const pos = measureNatural(id)
        base[id] = { x: pos?.x ?? 60, y: pos?.y ?? 5, visible: true }
      }
    }
    setLayout(base)
    persistLayout(base)
    setEditing(true)
  }

  const exitEditing = (): void => {
    setEditing(false)
    if (layout) persistLayout(layout)
  }

  const resetLayout = (): void => {
    setLayout(null)
    persistLayout(null)
    setEditing(false)
  }

  const moveWidget = (id: string, pos: WidgetPos): void => {
    setLayout((current) => {
      const prev: WidgetLayout = current ?? {}
      const item: WidgetLayoutItem = {
        x: pos.x,
        y: pos.y,
        visible: prev[id]?.visible ?? true
      }
      const next = { ...prev, [id]: item }
      persistLayout(next)
      return next
    })
  }

  const hideWidget = (id: string): void => {
    setLayout((current) => {
      const prev: WidgetLayout = current ?? {}
      const item = prev[id] ?? { x: 60, y: 5 }
      const next = { ...prev, [id]: { ...item, visible: false } }
      persistLayout(next)
      return next
    })
  }

  const restoreWidget = (id: string): void => {
    setLayout((current) => {
      const prev: WidgetLayout = current ?? {}
      const item = prev[id] ?? { x: 60, y: 5 }
      const next = { ...prev, [id]: { ...item, visible: true } }
      persistLayout(next)
      return next
    })
  }

  const toggleTask = (taskId: string): void => {
    const numericId = Number(taskId)
    const target = tasks.find((t) => t.id === taskId)
    if (!target || Number.isNaN(numericId)) return
    const nextTone = target.tone === 'done' ? 'normal' : 'done'
    setTasks((current) =>
      current.map((t) => (t.id === taskId ? { ...t, tone: nextTone } : t))
    )
    void window.desktop
      .updateTask({ id: numericId, patch: { status: nextTone === 'done' ? 'done' : 'open' } })
      .then(reloadTasks)
  }

  const updateTask = (
    taskId: string,
    patch: Partial<Pick<TaskItem, 'title' | 'meta' | 'tone'>>
  ): void => {
    setTasks((current) =>
      current.map((task) => (task.id === taskId ? { ...task, ...patch } : task))
    )
    if (patch.title !== undefined) {
      void window.desktop.updateTask({ id: Number(taskId), patch: { title: patch.title } })
    }
  }

  const addTask = (): void => {
    void window.desktop.createTask({ title: '新任务' }).then(reloadTasks)
  }

  const deleteTask = (taskId: string): void => {
    setTasks((current) => current.filter((task) => task.id !== taskId))
    const numericId = Number(taskId)
    if (!Number.isNaN(numericId)) void window.desktop.deleteTask(numericId)
  }

  const shellProps = (id: string) => ({
    id,
    title: WIDGET_TITLES[id],
    editing,
    layout: layout?.[id],
    onMove: moveWidget,
    onHide: hideWidget
  })

  const hiddenWidgets = WIDGET_IDS.filter((id) => layout?.[id] && layout[id].visible === false)

  return (
    <div className="desktop">
      {wallpaper.type === 'image' && wallpaper.path ? (
        <img
          className="wallpaper"
          src={window.desktop.musicUrl(wallpaper.path)}
          alt=""
          draggable={false}
        />
      ) : (
        <div
          className="wallpaper wallpaper-theme"
          style={{ backgroundImage: THEME_CSS[wallpaper.id ?? 'aurora'] ?? THEME_CSS.aurora }}
        />
      )}
      <div className="wallpaper-veil" />
      <div className="drag-handle" />
      <div className="top-left-tools">
        <WallpaperPicker
          wallpaper={wallpaper}
          onApplyTheme={applyTheme}
          onChooseImage={chooseImage}
          onSyncFromSystem={syncFromSystem}
        />
        <button
          className="import-btn"
          type="button"
          aria-label="导入课程表或作业"
          onClick={() => void window.desktop.importFile()}
        >
          导入日程
        </button>
        <button
          className={`import-btn ${editing ? 'is-active' : ''}`}
          type="button"
          aria-label={editing ? '完成布局编辑' : '编辑组件布局'}
          onClick={() => (editing ? exitEditing() : enterEditing())}
        >
          <LayoutGrid size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />
          {editing ? '完成布局' : '编辑布局'}
        </button>
        {editing && (
          <button
            className="import-btn"
            type="button"
            aria-label="恢复默认布局"
            onClick={resetLayout}
          >
            <RotateCcw size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />
            恢复默认
          </button>
        )}
        <button
          className="import-btn"
          type="button"
          aria-label="打开主控台"
          onClick={() => void window.desktop.openConsole()}
        >
          <Settings2 size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />
          主控台
        </button>
      </div>

      {editing && hiddenWidgets.length > 0 && (
        <div className="hidden-bar">
          <small>已隐藏：</small>
          {hiddenWidgets.map((id) => (
            <button key={id} type="button" onClick={() => restoreWidget(id)}>
              恢复{WIDGET_TITLES[id]}
            </button>
          ))}
        </div>
      )}

      <div className="right-stack">
        <WidgetShell {...shellProps('today')} naturalRect={null}>
          <TodayCard
            tasks={tasks}
            onToggleTask={toggleTask}
            onUpdateTask={updateTask}
            onAddTask={addTask}
            onDeleteTask={deleteTask}
          />
        </WidgetShell>
        <WidgetShell {...shellProps('schedule')} naturalRect={null}>
          <ScheduleTimeline />
        </WidgetShell>
        <WidgetShell {...shellProps('deadline')} naturalRect={null}>
          <DeadlineBoard />
        </WidgetShell>
        <WidgetShell {...shellProps('focus')} naturalRect={null}>
          <FocusCard />
        </WidgetShell>
        <WidgetShell {...shellProps('stats')} naturalRect={null}>
          <DailyStats tasks={tasks} />
        </WidgetShell>
      </div>

      <div className="bottom-cluster">
        <WidgetShell {...shellProps('music')} naturalRect={null}>
          <MusicBar />
        </WidgetShell>
        <Companion />
      </div>
    </div>
  )
}
