# -*- coding: utf-8 -*-
"""
智伴桌面 演示行为数据生成器（设计文档 11.4）

按「学习日 / 娱乐日 / DDL 前 / 考试周」模板生成 14-30 天分钟级行为数据，
写入与桌面应用相同的 SQLite 表（app_sessions / activity_ticks / file_events /
behavior_labels / calendar_events / tasks），用于：
  1. 行为 Transformer 训练数据
  2. 规则引擎与提醒链路的演示（验收 A7）

时间约定：本地时区、无时区后缀的 ISO 字符串（与 Node 侧 utils/time.ts 一致）。

用法：
  python generate_demo.py --db <smartdesk.db 路径> [--days 21] [--seed 42] [--demo]
"""
import argparse
import random
import sqlite3
from datetime import datetime, timedelta

# ── 应用模板池：category → [(process_name, [window titles])] ──
APPS = {
    "study_document": [
        ("WINWORD.EXE", ["实验报告v2.docx - Word", "课程论文.docx - Word", "实习总结.docx - Word"]),
        ("SUMATRA_PDF.exe", ["机器学习基础.pdf - SumatraPDF", "数据结构讲义.pdf", "操作系统复习.pdf - SumatraPDF"]),
        ("Notion.exe", ["Notion - 课程笔记", "Notion - 每日复盘"]),
        ("Obsidian.exe", ["学习笔记 - Obsidian"]),
    ],
    "study_code": [
        ("Code.exe", ["collector.ts - smartdesk - Visual Studio Code", "train.py - python-training - VS Code", "leetcode - VS Code"]),
        ("pycharm64.exe", ["算法实验 – main.py - PyCharm"]),
    ],
    "study_video": [
        ("msedge.exe", ["中国大学MOOC_数据结构", "哔哩哔哩_操作系统网课", "慕课_线性代数"]),
    ],
    "communication": [
        ("WeChat.exe", ["微信"]),
        ("DingTalk.exe", ["钉钉_班级群"]),
    ],
    "entertainment": [
        ("msedge.exe", ["爱奇艺_热播剧", "抖音精选", "腾讯视频", "虎牙直播"]),
        ("RelicCardinal.exe", ["Age of Empires IV "]),
        ("steam.exe", ["Steam 库"]),
    ],
    "music": [
        ("cloudmusic.exe", ["网易云音乐"]),
    ],
    "browsing_other": [
        ("chrome.exe", ["谷歌搜索", "知乎热榜", "新标签页"]),
    ],
}

COURSES = ["高等数学", "数据结构", "大学英语", "数字电路", "线性代数", "大学物理"]

# 状态 → 活跃比例范围
ACTIVITY_RANGE = {
    "study_document": (0.55, 0.92),
    "study_code": (0.6, 0.95),
    "study_video": (0.15, 0.5),
    "communication": (0.3, 0.8),
    "entertainment": (0.15, 0.65),
    "music": (0.05, 0.4),
    "browsing_other": (0.2, 0.7),
    "unknown": (0.1, 0.5),
}


def iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%S")


def pick_session(rng, category):
    proc, titles = rng.choice(APPS[category])
    return proc, rng.choice(titles)


class Day:
    """一天的会话序列 [(start_dt, end_dt, category, proc, title, ratio)]"""

    def __init__(self, rng, date):
        self.rng = rng
        self.date = date
        self.blocks = []

    def add_block(self, start, minutes, category):
        proc, title = pick_session(self.rng, category)
        end = start + timedelta(minutes=minutes)
        lo, hi = ACTIVITY_RANGE[category]
        ratio = round(self.rng.uniform(lo, hi), 3)
        self.blocks.append((start, end, category, proc, title, ratio))
        return end

    def gap(self, end, lo=3, hi=14):
        return end + timedelta(minutes=self.rng.randint(lo, hi))

    def fill_study_block(self, start, minutes, weekend=False):
        """一段学习时间：以学习类为主，穿插微信/浏览/音乐"""
        cur = start
        remain = minutes
        while remain > 5:
            r = self.rng.random()
            if r < 0.52:
                cat = self.rng.choice(["study_document", "study_code", "study_document"])
                dur = min(remain, self.rng.randint(25, 55))
            elif r < 0.66:
                cat = "study_video"
                dur = min(remain, self.rng.randint(20, 45))
            elif r < 0.74:
                cat = "communication"
                dur = self.rng.randint(3, 10)
            elif r < 0.84:
                cat = "browsing_other"
                dur = self.rng.randint(4, 15)
            elif r < 0.92 and not weekend:
                cat = "music"
                dur = self.rng.randint(10, 30)
            else:
                cat = "entertainment"
                dur = self.rng.randint(5, 20)  # 学习日的短暂摸鱼
            cur = self.add_block(cur, dur, cat)
            remain -= dur
            cur = self.gap(cur, 1, 6)

    def fill_entertainment_block(self, start, minutes):
        cur = start
        remain = minutes
        while remain > 5:
            cat = self.rng.choice(["entertainment", "entertainment", "browsing_other", "music"])
            dur = min(remain, self.rng.randint(15, 60))
            cur = self.add_block(cur, dur, cat)
            remain -= dur
            cur = self.gap(cur, 1, 5)


def build_day(rng, date, day_type, ddl_pressure=False):
    """day_type: study / entertainment / ddl_pre / exam_week"""
    weekend = date.weekday() >= 5
    day = Day(rng, date)
    wake = date.replace(
        hour=rng.randint(9 if weekend else 7, 10 if weekend else 9),
        minute=rng.randint(0, 45),
        second=0,
        microsecond=0,
    )
    sleep_h = rng.randint(23, 24) % 24

    if day_type == "study":
        day.fill_study_block(wake, rng.randint(180, 300), weekend)
        cur = day.gap(day.blocks[-1][1], 40, 80)  # 午饭
        day.fill_study_block(cur, rng.randint(180, 320), weekend)
        if rng.random() < 0.4:  # 部分晚上娱乐
            cur = day.gap(day.blocks[-1][1], 30, 60)
            day.fill_entertainment_block(cur, rng.randint(60, 120))
    elif day_type == "entertainment":
        day.fill_study_block(wake, rng.randint(60, 150), weekend)
        cur = day.gap(day.blocks[-1][1], 20, 50)
        day.fill_entertainment_block(cur, rng.randint(240, 420))
    elif day_type == "ddl_pre":
        # 白天拖延，晚上在 DDL 压力下仍长时间娱乐（演示核心场景）
        day.fill_study_block(wake, rng.randint(60, 140), weekend)
        cur = day.gap(day.blocks[-1][1], 20, 40)
        evening = date.replace(hour=20, minute=rng.choice([10, 30]), second=0, microsecond=0)
        if cur < evening:
            day.fill_entertainment_block(cur, int((evening - cur).total_seconds() // 60))
        day.fill_entertainment_block(evening, rng.randint(90, 150))
    else:  # exam_week
        day.fill_study_block(wake, rng.randint(300, 420), weekend)
        cur = day.gap(day.blocks[-1][1], 40, 60)
        day.fill_study_block(cur, rng.randint(240, 360), weekend)

    if ddl_pressure and day_type == "study":
        # DDL 压力日：晚间强化学习
        cur = day.gap(day.blocks[-1][1], 15, 40)
        day.fill_study_block(cur, rng.randint(120, 220), weekend)

    return day


def write_day(conn, day):
    rng_avg_idle = 90
    cur_date = day.date
    # 夜间 locked ticks（00:00 - 首个会话前）
    first_start = day.blocks[0][0] if day.blocks else cur_date.replace(hour=23)
    rows = []
    t = cur_date
    while t < first_start:
        rows.append((iso(t), 0.0, rng_avg_idle + 3000, 1))
        t += timedelta(minutes=1)
    conn.executemany(
        "INSERT OR IGNORE INTO activity_ticks (tick_time, input_active, idle_seconds, is_locked) VALUES (?,?,?,?)",
        rows,
    )

    # 会话 + 会话间空隙 ticks + 标注
    for start, end, category, proc, title, ratio in day.blocks:
        conn.execute(
            "INSERT INTO app_sessions (started_at, ended_at, app_name, process_id, window_title, category, activity_ratio) VALUES (?,?,?,?,?,?,?)",
            (iso(start), iso(end), proc, 1000, title, category, ratio),
        )
        label = (
            "focused" if category.startswith("study_")
            else "distracted" if category in ("entertainment",)
            else "other"
        )
        conn.execute(
            "INSERT INTO behavior_labels (start_time, end_time, label, source) VALUES (?,?,?,?)",
            (iso(start), iso(end), label, "weak"),
        )
        # 会话内分钟 ticks + 会话间空闲
        rows = []
        t = start
        while t < end:
            active = min(1.0, max(0.0, ratio + rng_jitter(day.rng, 0.15)))
            rows.append((iso(t), round(active, 3), day.rng.randint(2, 40), 0))
            t += timedelta(minutes=1)
        conn.executemany(
            "INSERT OR IGNORE INTO activity_ticks (tick_time, input_active, idle_seconds, is_locked) VALUES (?,?,?,?)",
            rows,
        )
        gap_rows = []
        g = end
        nxt = min(
            (b[0] for b in day.blocks if b[0] > end), default=end + timedelta(minutes=5)
        )
        while g < nxt:
            gap_rows.append((iso(g), 0.0, day.rng.randint(60, 1500), 0))
            g += timedelta(minutes=1)
        conn.executemany(
            "INSERT OR IGNORE INTO activity_ticks (tick_time, input_active, idle_seconds, is_locked) VALUES (?,?,?,?)",
            gap_rows,
        )


def rng_jitter(rng, amp):
    return rng.uniform(-amp, amp)


def seed_calendar_and_tasks(conn, now, demo):
    """课程表 + 考试/作业 + 任务（演示场景：实验报告 48h 内截止）"""
    # 未来 14 天的工作日课程（按 课程序号 = 日期序数*3 + 场次 取模，保证同日不重复）
    for offset in range(-14, 15):
        d = (now + timedelta(days=offset)).date()
        if d.weekday() >= 5:
            continue
        for slot, (hour, minute, dur) in enumerate([(8, 0, 100), (14, 0, 100), (19, 0, 90)]):
            course = COURSES[(d.toordinal() * 3 + slot) % len(COURSES)]
            start = datetime(d.year, d.month, d.day, hour, minute)
            conn.execute(
                "INSERT INTO calendar_events (title, source_type, start_at, end_at, all_day, location) VALUES (?,?,?,?,0,?)",
                (course, "course", iso(start), iso(start + timedelta(minutes=dur)), "B203"),
            )
    exam_at = now + timedelta(days=11)
    conn.execute(
        "INSERT INTO calendar_events (title, source_type, start_at, end_at, all_day, location) VALUES (?,?,?,?,0,?)",
        ("数据结构期末考试", "exam", iso(exam_at.replace(hour=9, minute=0)), iso(exam_at.replace(hour=11, minute=0)), "A101"),
    )

    lab_due = now + timedelta(days=2, hours=7)
    math_due = now + timedelta(days=5, hours=7)
    for title, due, src in [("实验报告", lab_due, "assignment"), ("高数作业", math_due, "assignment")]:
        cur = conn.execute(
            "INSERT INTO tasks (title, source_type, due_at, estimated_minutes, status, priority) VALUES (?,?,?,?, 'open', 'high')",
            (title, src, iso(due), 120),
        )
        conn.execute(
            "INSERT INTO calendar_events (title, source_type, start_at, all_day, location) VALUES (?,?,?,1,'')",
            (title, src, iso(due)),
        )
        if demo:
            # 演示锚点：让风险弹窗有明确对象
            conn.execute(
                "INSERT INTO user_profile (id, updated_at, data) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
                (iso(now), '{"avg_focus_minutes": 42, "peak_hours": [9,10,15,20]}'),
            )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True)
    ap.add_argument("--days", type=int, default=21)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--demo", action="store_true", help="附加竞赛演示场景（DDL + 拖延模板）")
    args = ap.parse_args()

    rng = random.Random(args.seed)
    now = datetime.now().replace(second=0, microsecond=0)
    conn = sqlite3.connect(args.db)
    conn.execute("PRAGMA journal_mode = WAL")

    days = []
    for offset in range(args.days, 0, -1):  # 完整历史天
        d = (now - timedelta(days=offset)).replace(hour=0, minute=0, second=0, microsecond=0)
        r = rng.random()
        if offset <= 1 and args.demo:
            day_type = "ddl_pre"
        elif r < 0.62:
            day_type = "study"
        elif r < 0.80:
            day_type = "exam_week"
        else:
            day_type = "entertainment"
        days.append(build_day(rng, d, day_type))

    # 今天（只生成到当前时刻之前，避免未来数据）
    today = now.replace(hour=0, minute=0)
    today_day = build_day(rng, today, "ddl_pre" if args.demo else "study")
    today_day.blocks = [(s, e, c, p, t, r) for (s, e, c, p, t, r) in today_day.blocks if s < now]
    days.append(today_day)

    for day in days:
        if day.blocks:
            write_day(conn, day)

    seed_calendar_and_tasks(conn, now, args.demo)
    conn.commit()

    n_sess = conn.execute("SELECT COUNT(*) FROM app_sessions").fetchone()[0]
    n_ticks = conn.execute("SELECT COUNT(*) FROM activity_ticks").fetchone()[0]
    n_labels = conn.execute("SELECT COUNT(*) FROM behavior_labels").fetchone()[0]
    print(f"OK days={len(days)} sessions={n_sess} ticks={n_ticks} labels={n_labels}")
    conn.close()


if __name__ == "__main__":
    main()
