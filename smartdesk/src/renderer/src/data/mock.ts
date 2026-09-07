export type TaskTone = 'normal' | 'warn' | 'done'

export interface TaskItem {
  id: string
  title: string
  meta: string
  tone: TaskTone
}

export interface Track {
  title: string
  artist: string
  duration: string
  durationSeconds: number
}

export interface ScheduleItem {
  id: string
  time: string
  title: string
  subtitle: string
  state: 'done' | 'next' | 'later'
}

export interface DeadlineItem {
  id: string
  title: string
  dueText: string
  daysLeft: number
}

export const mockTasks: TaskItem[] = [
  { id: 'report', title: '实验报告', meta: '剩 2 天', tone: 'warn' },
  { id: 'math', title: '高数习题', meta: '剩 5 天', tone: 'normal' },
  { id: 'english', title: '英语听力', meta: '今晚', tone: 'done' }
]

export const mockFocusLabel = '高数复习'
export const mockFocusMinutes = 25
export const mockFocusedMinutes = 42
export const mockFocusTarget = 120

export const mockSchedule: ScheduleItem[] = [
  {
    id: 'digital',
    time: '09:00-10:40',
    title: '数字电路',
    subtitle: 'B203',
    state: 'done'
  },
  {
    id: 'math-class',
    time: '14:00-15:40',
    title: '高等数学',
    subtitle: 'A305',
    state: 'done'
  },
  {
    id: 'report',
    time: '19:00-20:40',
    title: '实验报告',
    subtitle: '自习',
    state: 'next'
  },
  {
    id: 'english',
    time: '21:00-21:25',
    title: '英语听力',
    subtitle: '复习',
    state: 'later'
  }
]

export const mockDeadlines: DeadlineItem[] = [
  {
    id: 'lab-deadline',
    title: '实验报告',
    dueText: '9月9日',
    daysLeft: 2
  },
  {
    id: 'math-homework',
    title: '高数作业',
    dueText: '9月12日',
    daysLeft: 5
  },
  {
    id: 'cet4',
    title: '四级模拟',
    dueText: '11月15日',
    daysLeft: 69
  }
]

export const mockPlaylist: Track[] = [
  {
    title: '雨天自习室',
    artist: '本地音乐',
    duration: '04:48',
    durationSeconds: 288
  },
  {
    title: '清晨图书馆',
    artist: '本机音乐',
    duration: '03:32',
    durationSeconds: 212
  },
  {
    title: '傍晚白噪音',
    artist: '本机音乐',
    duration: '05:10',
    durationSeconds: 310
  }
]
