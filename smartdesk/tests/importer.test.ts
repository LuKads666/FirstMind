import { describe, expect, it } from 'vitest'
import { parseIcs, parseCsv } from '../src/main/importers/importer'

describe('parseIcs', () => {
  it('解析 VEVENT（UTC 时间转本地、折叠行、地点）', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'SUMMARY:数据结构期末考试',
      'DTSTART:20261115T010000Z',
      'DTEND:20261115T030000Z',
      'LOCATION:A101',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'SUMMARY:实',
      ' 验报告提交',
      'DTSTART;VALUE=DATE:20260909',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n')

    const events = parseIcs(ics)
    expect(events).toHaveLength(2)

    // UTC 01:00 + 8h = 本地 09:00（机器为 UTC+8）
    expect(events[0].title).toBe('数据结构期末考试')
    expect(events[0].source_type).toBe('exam')
    expect(events[0].start_at.endsWith('T09:00:00')).toBe(true)
    expect(events[0].location).toBe('A101')

    // 折叠行还原 + 全天日期
    expect(events[1].title).toBe('实验报告提交')
    expect(events[1].all_day).toBe(true)
  })
})

describe('parseCsv', () => {
  it('解析中文表头 CSV（标题/截止时间/地点）', () => {
    const csv = [
      '名称,截止时间,地点',
      '实验报告,2026/09/09 23:59,B203',
      '高数作业,2026-09-12,',
      '数据结构期末考试,2026/11/15 09:00,A101'
    ].join('\n')

    const { events, warnings } = parseCsv(csv)
    expect(warnings).toHaveLength(0)
    expect(events).toHaveLength(3)
    expect(events[0].title).toBe('实验报告')
    expect(events[0].source_type).toBe('assignment')
    expect(events[0].start_at).toBe('2026-09-09T23:59:00')
    expect(events[2].source_type).toBe('exam')
    expect(events[2].location).toBe('A101')
  })

  it('解析课程表 CSV（开始/结束时间 + 类型列）', () => {
    const csv = [
      'title,start,end,location,type',
      '高等数学,2026/9/7 14:00,2026/9/7 15:40,A305,course',
      '"统计,入门",2026/9/8 08:00,2026/9/8 09:40,B201,course'
    ].join('\n')

    const { events } = parseCsv(csv, 'course')
    expect(events).toHaveLength(2)
    expect(events[0].start_at).toBe('2026-09-07T14:00:00')
    expect(events[0].end_at).toBe('2026-09-07T15:40:00')
    expect(events[1].title).toBe('统计,入门')
  })

  it('缺表头或时间列时给出警告', () => {
    expect(parseCsv('foo,bar\n1,2').events).toHaveLength(0)
    expect(parseCsv('名称,备注\n实验报告,重要').warnings.length).toBeGreaterThan(0)
  })
})
