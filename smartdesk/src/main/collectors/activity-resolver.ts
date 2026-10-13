import { mapCategory, type AppCategory } from './category-mapper'

// Adapted from the FirstMind activity-resolver: exact-title cache, title rules,
// and app-scoped keywords learned from a local model.
export type ResolutionSource = 'fallback' | 'title_rule' | 'learned_rule' | 'cache'

export interface Resolution {
  category: AppCategory
  source: ResolutionSource
  needsModel: boolean
}

export interface LearnedRule {
  keyword: string
  category: AppCategory
  confidence: number
}

export interface ResolutionStore {
  findExact(appName: string, title: string): AppCategory | null
  saveExact(appName: string, title: string, category: AppCategory, source: string): void
  findLearned(appName: string): LearnedRule[]
  saveLearned(appName: string, keyword: string, category: AppCategory, confidence: number): void
}

export interface ModelVerdict {
  category: AppCategory
  confidence: number
  keywords: string[]
}

const CATEGORIES = new Set<AppCategory>([
  'study_document', 'study_code', 'study_video', 'communication',
  'entertainment', 'music', 'browsing_other', 'away', 'unknown'
])

const TITLE_RULES: Array<{ category: AppCategory; keywords: string[] }> = [
  { category: 'study_code', keywords: ['github', 'gitlab', 'stackoverflow', 'typescript', 'pytorch', '开发文档'] },
  { category: 'study_video', keywords: ['高等数学', '概率论', '线性代数', '线代', '考研', '网课', '慕课', '课程', 'lecture', 'course', 'lesson'] },
  { category: 'entertainment', keywords: ['番剧', '电影', '电视剧', '综艺', '搞笑', '游戏直播'] }
]

const GENERIC_KEYWORDS = new Set([
  '浏览器', '网页', '页面', '首页', '新建标签页', '视频', '直播', '音乐',
  '学习', '娱乐', '游戏', '工作', '资料', '内容', 'bilibili', '哔哩哔哩',
  'edge', 'chrome', 'www', 'com', '强化班', '基础班', '冲刺班'
])

function isContextSensitive(category: AppCategory): boolean {
  return category === 'browsing_other' || category === 'study_video' || category === 'unknown'
}

function titleRule(title: string): AppCategory | null {
  const matched = TITLE_RULES.filter((rule) => rule.keywords.some((word) => title.includes(word)))
  return matched.length === 1 ? matched[0].category : null
}

export function isValidLearnedKeyword(keyword: string, appName: string, title: string): boolean {
  const word = keyword.trim().toLowerCase()
  if (word.length < 2 || word.length > 30 || !title.toLowerCase().includes(word)) return false
  if (word === appName.toLowerCase() || GENERIC_KEYWORDS.has(word) || /^\d+$/.test(word)) return false
  if (/^第?[0-9一二三四五六七八九十百零两]+[讲课章节集期季篇部]$/.test(word)) return false
  if (/^\d{1,2}[:：]\d{2}$/.test(word)) return false
  if (/^[\u4e00-\u9fff]{2}$/.test(word) && !['线代', '高数', '考研'].includes(word)) return false
  return true
}

export class ActivityResolver {
  constructor(private readonly store: ResolutionStore) {}

  resolve(processName: string, windowTitle: string): Resolution {
    const appName = processName.trim().toLowerCase()
    const title = windowTitle.trim().toLowerCase()
    const fallback = mapCategory(processName, windowTitle)
    if (!title || fallback === 'away') return { category: fallback, source: 'fallback', needsModel: false }

    const cached = this.store.findExact(appName, title)
    if (cached && CATEGORIES.has(cached)) return { category: cached, source: 'cache', needsModel: false }
    if (!isContextSensitive(fallback)) return { category: fallback, source: 'fallback', needsModel: false }

    const byTitle = titleRule(title)
    if (byTitle) {
      this.store.saveExact(appName, title, byTitle, 'title_rule')
      return { category: byTitle, source: 'title_rule', needsModel: false }
    }

    for (const rule of this.store.findLearned(appName)) {
      if (rule.confidence >= 0.9 && rule.category !== 'away' && title.includes(rule.keyword.toLowerCase())) {
        this.store.saveExact(appName, title, rule.category, 'learned_rule')
        return { category: rule.category, source: 'learned_rule', needsModel: false }
      }
    }

    return { category: fallback, source: 'fallback', needsModel: true }
  }

  learn(processName: string, windowTitle: string, verdict: ModelVerdict): boolean {
    const appName = processName.trim().toLowerCase()
    const title = windowTitle.trim().toLowerCase()
    if (!title || !CATEGORIES.has(verdict.category) || verdict.category === 'away' ||
        verdict.category === 'unknown' || !Number.isFinite(verdict.confidence) || verdict.confidence < 0.85) return false

    this.store.saveExact(appName, title, verdict.category, 'ollama')
    if (verdict.confidence >= 0.9) {
      for (const keyword of verdict.keywords.slice(0, 3)) {
        if (isValidLearnedKeyword(keyword, appName, title)) {
          this.store.saveLearned(appName, keyword.trim().toLowerCase(), verdict.category, verdict.confidence)
        }
      }
    }
    return true
  }
}
