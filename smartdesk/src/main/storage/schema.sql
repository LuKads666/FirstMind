-- 智伴桌面 本地数据库结构
-- 对应《详细设计文档》第 9 节，数据默认仅存本机

-- 前台应用会话
CREATE TABLE IF NOT EXISTS app_sessions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at     TEXT    NOT NULL,                -- ISO 时间
  ended_at       TEXT,                            -- 为空表示进行中
  app_name       TEXT    NOT NULL DEFAULT '',
  process_id     INTEGER,
  window_title   TEXT    NOT NULL DEFAULT '',
  category       TEXT    NOT NULL DEFAULT 'unknown',
  activity_ratio REAL    NOT NULL DEFAULT 0       -- 0-1 输入活跃比例
);
CREATE INDEX IF NOT EXISTS idx_app_sessions_started ON app_sessions (started_at);
CREATE INDEX IF NOT EXISTS idx_app_sessions_category ON app_sessions (category);

-- FirstMind activity resolver: exact title cache and app-scoped learned keywords
CREATE TABLE IF NOT EXISTS activity_resolution_cache (
  app_name     TEXT NOT NULL,
  window_title TEXT NOT NULL,
  category     TEXT NOT NULL,
  source       TEXT NOT NULL,
  PRIMARY KEY (app_name, window_title)
);
CREATE TABLE IF NOT EXISTS activity_learned_rules (
  app_name   TEXT NOT NULL,
  keyword    TEXT NOT NULL,
  category   TEXT NOT NULL,
  confidence REAL NOT NULL,
  PRIMARY KEY (app_name, keyword)
);

-- 每分钟活跃度时间片
CREATE TABLE IF NOT EXISTS activity_ticks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  tick_time     TEXT    NOT NULL UNIQUE,          -- 精确到分钟的 ISO 时间
  input_active  REAL    NOT NULL DEFAULT 0,       -- 0-1 活跃比例
  idle_seconds  INTEGER NOT NULL DEFAULT 0,
  is_locked     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_activity_ticks_time ON activity_ticks (tick_time);

-- 文件事件
CREATE TABLE IF NOT EXISTS file_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  event_time TEXT    NOT NULL,
  action     TEXT    NOT NULL,                     -- created/modified/deleted/moved
  path       TEXT    NOT NULL,
  extension  TEXT    NOT NULL DEFAULT '',
  category   TEXT    NOT NULL DEFAULT 'other'      -- document/code/image/other
);
CREATE INDEX IF NOT EXISTS idx_file_events_time ON file_events (event_time);

-- 日程（课程/考试/作业/普通日程统一存储）
CREATE TABLE IF NOT EXISTS calendar_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  source_type TEXT    NOT NULL DEFAULT 'manual',  -- course/exam/assignment/manual
  start_at    TEXT    NOT NULL,
  end_at      TEXT,
  all_day     INTEGER NOT NULL DEFAULT 0,
  location    TEXT    NOT NULL DEFAULT '',
  imported_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_calendar_events_start ON calendar_events (start_at);

-- 可执行任务
CREATE TABLE IF NOT EXISTS tasks (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  title             TEXT    NOT NULL,
  source_type       TEXT    NOT NULL DEFAULT 'manual',
  source_id         INTEGER,
  due_at            TEXT,
  estimated_minutes INTEGER,
  status            TEXT    NOT NULL DEFAULT 'open',     -- open/in_progress/done/cancelled
  priority          TEXT    NOT NULL DEFAULT 'medium',   -- high/medium/low
  created_at        TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks (due_at);

-- 行为状态标注（训练数据 / 用户修正）
CREATE TABLE IF NOT EXISTS behavior_labels (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  start_time   TEXT NOT NULL,
  end_time     TEXT NOT NULL,
  label        TEXT NOT NULL,                        -- focused/distracted/entertainment/away...
  source       TEXT NOT NULL DEFAULT 'weak'          -- weak(弱标签)/manual/model
);

-- 模型推理结果
CREATE TABLE IF NOT EXISTS model_predictions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  predicted_at     TEXT    NOT NULL,
  window_end       TEXT    NOT NULL,                 -- 特征序列末端时间
  activity         TEXT    NOT NULL DEFAULT '',
  distraction_prob REAL    NOT NULL DEFAULT 0,
  focus_remaining  REAL,
  model_version    TEXT    NOT NULL DEFAULT ''
);

-- 风险事件
CREATE TABLE IF NOT EXISTS risk_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  raised_at    TEXT    NOT NULL,
  risk_type    TEXT    NOT NULL,             -- ddl_near/activity_mismatch/...
  risk_score   REAL    NOT NULL DEFAULT 0,
  level        TEXT    NOT NULL DEFAULT 'info',  -- info/desktop/bubble/alert
  task_id      INTEGER,
  detail       TEXT    NOT NULL DEFAULT '',
  resolved_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_risk_events_raised ON risk_events (raised_at);

-- 专注会话
CREATE TABLE IF NOT EXISTS focus_sessions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at  TEXT    NOT NULL,
  ended_at    TEXT,
  task_id     INTEGER,
  minutes     REAL    NOT NULL DEFAULT 0,
  completed   INTEGER NOT NULL DEFAULT 0
);

-- 已发出的提醒
CREATE TABLE IF NOT EXISTS notifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sent_at     TEXT    NOT NULL,
  channel     TEXT    NOT NULL DEFAULT 'bubble',  -- desktop/bubble/alert/voice
  title       TEXT    NOT NULL,
  body        TEXT    NOT NULL DEFAULT '',
  risk_id     INTEGER,
  user_action TEXT    NOT NULL DEFAULT ''         -- accepted/snoozed/ignored/helpful/not_helpful
);

-- 与小策的对话
CREATE TABLE IF NOT EXISTS chat_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT    NOT NULL,
  role       TEXT    NOT NULL,                    -- user/assistant
  content    TEXT    NOT NULL,
  source     TEXT    NOT NULL DEFAULT 'text'      -- text/voice
);

-- 长期画像（单行 JSON，随画像更新整体覆盖）
CREATE TABLE IF NOT EXISTS user_profile (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  updated_at TEXT,
  data       TEXT NOT NULL DEFAULT '{}'            -- JSON: peak_hours/avg_focus_minutes/...
);

-- 用户反馈（提醒有用性、任务调整等）
CREATE TABLE IF NOT EXISTS user_feedback (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT    NOT NULL,
  kind       TEXT    NOT NULL,                    -- reminder/task/category
  ref_id     INTEGER,
  value      TEXT    NOT NULL DEFAULT ''
);

-- 应用设置（壁纸、组件布局、勿扰时段等）
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL                            -- JSON
);
