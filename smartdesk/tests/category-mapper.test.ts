import { describe, expect, it } from 'vitest'
import { mapCategory } from '../src/main/collectors/category-mapper'

describe('mapCategory 窗口标题/进程名 → 应用类别', () => {
  it('识别代码编辑器', () => {
    expect(mapCategory('Code.exe', 'collector.ts - smartdesk - Visual Studio Code')).toBe(
      'study_code'
    )
  })

  it('识别文档类（中文标题）', () => {
    expect(mapCategory('WINWORD.EXE', '实验报告v3.docx - Word')).toBe('study_document')
    expect(mapCategory('Acrobat.exe', '机器学习综述.pdf')).toBe('study_document')
  })

  it('识别娱乐类（视频网站与游戏）', () => {
    expect(mapCategory('msedge.exe', '哔哩哔哩 (゜-゜)つロ 干杯~-bilibili')).toBe('study_video')
    expect(mapCategory('RelicCardinal.exe', 'Age of Empires IV ')).toBe('entertainment')
    expect(mapCategory('steam.exe', 'Steam 大奖')).toBe('entertainment')
  })

  it('识别通讯类', () => {
    expect(mapCategory('WeChat.exe', '微信')).toBe('communication')
    expect(mapCategory('DingTalk.exe', '钉钉群聊')).toBe('communication')
  })

  it('普通浏览器归类为 browsing_other', () => {
    expect(mapCategory('chrome.exe', '谷歌搜索')).toBe('browsing_other')
    expect(mapCategory('msedge.exe', '必应')).toBe('browsing_other')
  })

  it('音乐软件归类为 music', () => {
    expect(mapCategory('cloudmusic.exe', '网易云音乐')).toBe('music')
  })

  it('锁屏标题归类为 away', () => {
    expect(mapCategory('system.exe', '锁定')).toBe('away')
  })

  it('未知进程归为 unknown', () => {
    expect(mapCategory('whatever_app.exe', '随便什么窗口')).toBe('unknown')
    expect(mapCategory('', '')).toBe('unknown')
  })
})
