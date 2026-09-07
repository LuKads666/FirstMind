# -*- coding: utf-8 -*-
"""
特征工程（设计文档 10）：从 SQLite 行为数据构建 128 分钟行为序列样本。

每分钟特征（与 resources/onnx/feature_config.json 保持一致）：
  x_num  [7]  = hour_sin, hour_cos, is_weekend, input_active, idle_norm, is_locked, file_events
  x_cat  [1]  = app_category_id  (见 CATEGORY_LIST)
标签：
  y_act  = 序列末分钟活动类别 id
  y_dis  = 分心二分类（末分钟为娱乐/无目的浏览）
  y_dur  = 该会话剩余分钟 / 120
"""
import sqlite3
from datetime import datetime, timedelta

import numpy as np

CATEGORY_LIST = [
    "study_document",
    "study_code",
    "study_video",
    "communication",
    "entertainment",
    "music",
    "browsing_other",
    "away",
    "unknown",
]
CATEGORY_ID = {c: i for i, c in enumerate(CATEGORY_LIST)}
DISTRACTED_SET = {"entertainment", "browsing_other"}

SEQ_LEN = 128
NUM_FEATURES = 7


def _parse(s):
    return datetime.fromisoformat(s)


def load_minute_table(conn):
    """构建 minute → (category_id, input_active, idle_seconds, is_locked) 的映射"""
    minutes = {}

    for row in conn.execute(
        "SELECT started_at, ended_at, category FROM app_sessions WHERE category IS NOT NULL"
    ):
        start, end, cat = row[0], row[1], row[2]
        s = _parse(start)
        e = _parse(end) if end else None
        cid = CATEGORY_ID.get(cat, CATEGORY_ID["unknown"])
        t = s.replace(second=0)
        while e is None or t < e:
            minutes[t] = [cid, None, None, 0]
            t += timedelta(minutes=1)

    for tick_time, active, idle, locked in conn.execute(
        "SELECT tick_time, input_active, idle_seconds, is_locked FROM activity_ticks"
    ):
        t = _parse(tick_time)
        if t in minutes:
            minutes[t][1] = float(active or 0)
            minutes[t][2] = int(idle or 0)
        else:
            minutes[t] = [CATEGORY_ID["unknown"], float(active or 0), int(idle or 0), int(locked or 0)]

    for key in minutes:
        if minutes[key][1] is None:
            minutes[key][1] = 0.0
        if minutes[key][2] is None:
            minutes[key][2] = 120
        minutes[key][3] = int(minutes[key][3] or 0)

    # 会话结束时间表（用于剩余时长标签）
    sessions = []
    for row in conn.execute(
        "SELECT started_at, ended_at FROM app_sessions WHERE ended_at IS NOT NULL"
    ):
        sessions.append((_parse(row[0]), _parse(row[1])))

    return minutes, sessions


def _features_for(t: datetime, minute_row):
    cid, active, idle, locked = minute_row
    hour = t.hour + t.minute / 60
    return [
        float(np.sin(2 * np.pi * hour / 24)),
        float(np.cos(2 * np.pi * hour / 24)),
        1.0 if t.weekday() >= 5 else 0.0,
        float(active),
        min(idle, 1800) / 1800.0,
        float(locked),
        0.0,
    ]


def build_windows(
    conn,
    seq_len: int = SEQ_LEN,
    stride: int = 3,
    max_windows: int | None = None,
    rng: np.random.Generator | None = None,
):
    minutes, sessions = load_minute_table(conn)
    times = sorted(t for t in minutes)
    if len(times) < seq_len + 1:
        return None

    xs_num, xs_cat, ys_act, ys_dis, ys_dur = [], [], [], [], []
    for i in range(0, len(times) - seq_len, stride):
        window = times[i : i + seq_len]
        target_t = times[i + seq_len]
        target_row = minutes.get(target_t)
        if target_row is None:
            continue

        num = np.zeros((seq_len, NUM_FEATURES), dtype=np.float32)
        cat = np.zeros((seq_len,), dtype=np.int64)
        for j, t in enumerate(window):
            f = _features_for(t, minutes[t])
            num[j] = f
            cat[j] = minutes[t][0]

        # 剩余时长：目标分钟所在会话的 end - target
        duration = 0.0
        for s, e in sessions:
            if s <= target_t < e:
                duration = min(120.0, (e - target_t).total_seconds() / 60)
                break

        xs_num.append(num)
        xs_cat.append(cat)
        ys_act.append(target_row[0])
        ys_dis.append(1 if CATEGORY_LIST[target_row[0]] in DISTRACTED_SET else 0)
        ys_dur.append(duration / 120.0)

    if not xs_num:
        return None

    X_num = np.stack(xs_num)
    X_cat = np.stack(xs_cat)
    y_act = np.array(ys_act, dtype=np.int64)
    y_dis = np.array(ys_dis, dtype=np.float32)
    y_dur = np.array(ys_dur, dtype=np.float32)

    if max_windows is not None and len(X_num) > max_windows and rng is not None:
        idx = rng.choice(len(X_num), size=max_windows, replace=False)
        X_num, X_cat = X_num[idx], X_cat[idx]
        y_act, y_dis, y_dur = y_act[idx], y_dis[idx], y_dur[idx]

    return X_num, X_cat, y_act, y_dis, y_dur


def split_by_day(X_num, X_cat, y_act, y_dis, y_dur, times=None, test_ratio=0.2):
    """按时间顺序切分（避免同一时段切片泄漏），尾部作为测试集"""
    n = len(X_num)
    cut = int(n * (1 - test_ratio))
    return (
        (X_num[:cut], X_cat[:cut], y_act[:cut], y_dis[:cut], y_dur[:cut]),
        (X_num[cut:], X_cat[cut:], y_act[cut:], y_dis[cut:], y_dur[cut:]),
    )
