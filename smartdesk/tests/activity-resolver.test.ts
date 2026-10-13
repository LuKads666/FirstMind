import { describe, expect, it } from 'vitest'
import { ActivityResolver, type LearnedRule, type ResolutionStore } from '../src/main/collectors/activity-resolver'
import type { AppCategory } from '../src/main/collectors/category-mapper'

class MemoryResolutionStore implements ResolutionStore {
  exact = new Map<string, AppCategory>()
  learned = new Map<string, LearnedRule[]>()
  key(app: string, title: string): string { return `${app}\0${title}` }
  findExact(app: string, title: string): AppCategory | null { return this.exact.get(this.key(app, title)) ?? null }
  saveExact(app: string, title: string, category: AppCategory): void { this.exact.set(this.key(app, title), category) }
  findLearned(app: string): LearnedRule[] { return this.learned.get(app) ?? [] }
  saveLearned(app: string, keyword: string, category: AppCategory, confidence: number): void {
    this.learned.set(app, [...this.findLearned(app), { keyword, category, confidence }])
  }
}

describe('FirstMind activity resolution in SmartDesk', () => {
  it('uses title context to distinguish a course from entertainment on the same video site', () => {
    const resolver = new ActivityResolver(new MemoryResolutionStore())
    expect(resolver.resolve('msedge.exe', '线性代数课程 - 哔哩哔哩').category).toBe('study_video')
    expect(resolver.resolve('msedge.exe', '搞笑番剧 - 哔哩哔哩').category).toBe('entertainment')
  })

  it('learns a specific keyword for later titles from the same app', () => {
    const store = new MemoryResolutionStore()
    const resolver = new ActivityResolver(store)
    expect(resolver.learn('msedge.exe', '李永乐微积分强化班 第1讲 - 哔哩哔哩', {
      category: 'study_video', confidence: 0.96, keywords: ['李永乐微积分', '哔哩哔哩']
    })).toBe(true)
    expect(store.findLearned('msedge.exe').map((rule) => rule.keyword)).toEqual(['李永乐微积分'])
    expect(resolver.resolve('msedge.exe', '李永乐微积分复习 第2讲').source).toBe('learned_rule')
    expect(resolver.resolve('chrome.exe', '李永乐微积分复习 第2讲').source).toBe('fallback')
  })

  it('rejects low-confidence judgments and keeps known code apps stable', () => {
    const store = new MemoryResolutionStore()
    const resolver = new ActivityResolver(store)
    expect(resolver.learn('msedge.exe', '随便的页面', {
      category: 'entertainment', confidence: 0.6, keywords: ['随便']
    })).toBe(false)
    expect(store.exact.size).toBe(0)
    expect(resolver.resolve('Code.exe', '电影项目 - Visual Studio Code').category).toBe('study_code')
  })
})
