// 应用类别映射（设计文档 8.5）
// 纯逻辑，进程名 + 窗口标题 → 类别。允许后续加用户修正表。

export type AppCategory =
  | 'study_document'
  | 'study_code'
  | 'study_video'
  | 'communication'
  | 'entertainment'
  | 'music'
  | 'browsing_other'
  | 'away'
  | 'unknown'

const CATEGORY_RULES: Array<{ category: AppCategory; keywords: string[] }> = [
  {
    category: 'study_document',
    keywords: ['.doc', '.docx', '.pdf', '.ppt', '.pptx', '.xlsx', 'word', 'notion', 'obsidian', 'typora', '报告', '论文', '笔记', '文献']
  },
  {
    category: 'study_code',
    keywords: ['visual studio code', 'vscode', 'intellij idea', 'pycharm', 'webstorm', 'clion', 'visual studio', 'dev-c', 'codeblocks', 'git bash', 'cmd.exe', 'powershell', '终端', '终端']
  },
  {
    category: 'study_video',
    keywords: ['mooc', '慕课', '网课', '中国大学', '网易云课堂', '学堂在线', 'bilibili', '哔哩哔哩']
  },
  {
    category: 'communication',
    keywords: ['wechat', '微信', 'qq', '钉钉', 'dingtalk', 'outlook', '飞书', 'feishu', 'teams', 'foxmail', 'thunder']
  },
  {
    category: 'entertainment',
    keywords: ['youtube', 'netflix', 'iqiyi', '爱奇艺', '腾讯视频', '优酷', 'youku', '抖音', 'douyin', '快手', 'steam', 'epic games', '游戏', '英雄联盟', '王者荣耀', 'age of empires', 'reliccardinal']
  },
  {
    category: 'music',
    keywords: ['spotify', 'cloudmusic', '网易云音乐', 'qqmusic', 'qq音乐', 'kugou', '酷狗', 'kuwo', '酷我', 'foobar', 'foobar2000']
  }
]

const BROWSERS = ['chrome.exe', 'msedge.exe', 'firefox.exe', 'browser.exe', 'brave.exe', 'opera.exe']

export function mapCategory(processName: string, windowTitle: string): AppCategory {
  const exe = (processName || '').toLowerCase()
  const title = (windowTitle || '').toLowerCase()

  if (exe === 'explorer.exe' && title === '') return 'unknown'
  if (title.includes('锁定') || title.includes('锁屏') || title === 'windows 默认锁屏屏幕') {
    return 'away'
  }

  const hay = `${exe} ${title}`
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((k) => hay.includes(k))) return rule.category
  }

  if (BROWSERS.includes(exe)) return 'browsing_other'
  if (exe.includes('chrome') && !exe.includes('chromium')) return 'browsing_other'

  return 'unknown'
}
