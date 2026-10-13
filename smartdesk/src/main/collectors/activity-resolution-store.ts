import { getDatabase } from '../storage/database'
import type { AppCategory } from './category-mapper'
import type { LearnedRule, ResolutionStore } from './activity-resolver'

export const activityResolutionStore: ResolutionStore = {
  findExact(appName, title) {
    const row = getDatabase()
      .prepare('SELECT category FROM activity_resolution_cache WHERE app_name = ? AND window_title = ?')
      .get(appName, title) as { category: AppCategory } | undefined
    return row?.category ?? null
  },
  saveExact(appName, title, category, source) {
    getDatabase()
      .prepare(`INSERT INTO activity_resolution_cache (app_name, window_title, category, source)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(app_name, window_title) DO UPDATE SET category = excluded.category, source = excluded.source`)
      .run(appName, title, category, source)
  },
  findLearned(appName) {
    return getDatabase()
      .prepare(`SELECT keyword, category, confidence FROM activity_learned_rules
        WHERE app_name = ? ORDER BY confidence DESC, length(keyword) DESC`)
      .all(appName) as LearnedRule[]
  },
  saveLearned(appName, keyword, category, confidence) {
    getDatabase()
      .prepare(`INSERT INTO activity_learned_rules (app_name, keyword, category, confidence)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(app_name, keyword) DO UPDATE SET
          confidence = CASE WHEN category = excluded.category THEN max(confidence, excluded.confidence) ELSE confidence END`)
      .run(appName, keyword, category, confidence)
  }
}
