# 智伴桌面 Agent 详细设计文档

> 文档版本：V0.2  
> 编写日期：2026-09-07  
> 文档状态：立项设计稿，技术路线已确认  
> 暂定产品名：智伴桌面  
> 角色名：小策  


## 1.1 技术路线（已确认）

项目采用 Electron + Node + Python 训练工作区的混合架构：

| 层 | 技术 | 职责 |
|---|---|---|
| 桌面界面 | Electron + React + TypeScript | 壁纸、小组件、角色、对话、音乐、设置 |
| 桌面控制 | Electron Main Process（Node） | 窗口管理、托盘、生命周期、IPC、系统集成 |
| 行为采集 | Node Utility Process + Win32 | 前台窗口、窗口标题、活跃度、文件事件 |
| 本地存储 | better-sqlite3 | 行为、日程、预测、提醒、画像 |
| 行为模型训练 | Python + PyTorch | 训练轻量 Transformer，导出 ONNX |
| 行为模型推理 | Node + onnxruntime-node | 运行导出的 ONNX 行为模型 |
| 语言 Agent | Node 调用 Ollama + Qwen | 对话、任务拆解、计划与总结 |
| 语音 ASR/TTS | Node + sherpa-onnx-node | 本地中文语音识别与合成 |
| 打包 | electron-builder | Windows 桌面程序 |

说明：行为 Transformer 不在 Electron 中训练，训练阶段使用 Python；运行阶段只依赖 ONNX 模型文件，Node 负责推理，因此最终交付程序不需要附带完整 Python 训练环境。

## 2. 产品定位

### 2.1 一句话定义

智伴桌面是一个运行在 Windows 桌面的智能学习同伴：

它通过可更换壁纸、桌面小组件、本地音乐播放器和角色化 Agent，形成用户每天都会使用的“智能桌面层”；同时在后台持续采集应用使用、窗口切换、文件活动、键鼠活跃度等行为元数据，结合课程表、作业、考试与日历，识别学习状态、分析个人习惯、预判拖延风险，并用本地大模型和语音完成主动提醒与自然对话。

### 2.2 核心价值

| 用户痛点 | 产品价值 |
|---|---|
| 计划经常与执行脱节 | 通过行为识别发现“计划做 A、实际做 B” |
| 学习软件只统计时长 | 通过行为序列识别专注、低效切换、娱乐状态 |
| 提醒太生硬 | 通过角色化 Agent 在合适时机给出温和提醒 |
| 不了解自己的真实节奏 | 通过长期画像提供个人耗时基线 |
| 桌面上工具碎片化 | 将壁纸、任务、音乐、Agent 整合到一个桌面 |

### 2.3 目标用户

第一版以普通高校在校本专科生为主，使用 Windows 10/11 桌面电脑。

## 3. 范围界定

### 3.1 MVP 范围内

- Windows 10/11 桌面应用，支持托盘常驻和开机后手动启动。
- 可更换静态壁纸，提供内置主题与本机图片两种来源。
- 可显示、拖动、隐藏多个桌面小组件。
- 内置组件：今日任务、专注状态、DDL 倒计时、小策角色、本地音乐播放器。
- 本地 SQLite 保存行为数据、日程数据、提醒记录。
- 行为采集只记录元数据，不记录按键内容和屏幕内容。
- 基于 PyTorch 训练的轻量行为序列 Transformer，导出 ONNX 后在 Node 中推理。
- 规则引擎先保证基础提醒能力，模型概率用于调节提醒等级。
- Ollama 运行本地 Qwen 模型，提供任务拆解、晚间安排、对话总结。
- 本地 ASR/TTS 实现语音输入输出，文本输入为兜底。
- 支持 ICS/Excel/CSV 导入课程表、考试、作业、普通日程。
- 使用 electron-builder 打包为可运行 Windows 桌面程序。

### 3.2 MVP 不包含

- 真实 WorkerW 动态壁纸、视频壁纸、HTML 壁纸。
- Live2D 高级角色动画。
- 第三方小组件市场与开放生态。
- 手机端、macOS/Linux 支持。
- 自动连接教务系统获取课表。
- 在线音乐、歌单推荐、音乐版权内容。
- 云端账号、云同步、多人协作。
- Agent 未经用户确认自动修改任务、发送邮件、关闭软件。
- 从零预训练大语言模型。

## 4. 典型使用场景

### 4.1 场景一：桌面常驻

用户启动应用后进入桌面模式。桌面背景为内置学习主题，右下角显示小策，左上角显示今日任务，右上角显示当前专注状态。用户不需要打开主窗口即可看到当天任务与最近考试倒计时。

### 4.2 场景二：拖延风险提醒

用户导入课程表和作业“实验报告：9 月 26 日前提交”。晚上 20:30 用户开始浏览视频网站。

系统流程：

1. 前台窗口识别为视频网站，窗口类别进入娱乐类。
2. 活动状态连续超过 15 分钟为娱乐状态。
3. 风险引擎发现 48 小时内存在作业 DDL，且当前状态与任务不匹配。
4. 行为模型输出分心概率较高。
5. Agent 生成提醒话术并调用 TTS。
6. 小策在当前窗口上方弹出轻提醒：“报告还剩两天，按你平时速度还需要约 2 小时，现在先做 25 分钟摘要吗？”
7. 用户点击“开始专注”，系统打开专注计时组件，记录一段专注会话。

### 4.3 场景三：晚间安排

用户点击小策并输入“今晚怎么安排”。Agent 读取当天剩余任务、行为画像和考试时间，输出不超过三件事的晚间计划，并在用户确认后写入今日任务视图。

### 4.4 场景四：专注陪伴

用户开始写作任务后，专注组件显示计时；系统按 5 分钟粒度生成行为序列；当用户长时间无输入时，组件提示是否仍在专注；达到个人历史最长专注时长后，小策建议休息 5 分钟。

## 5. 总体架构

```text
+-------------------------- Electron 渲染层 --------------------------+
|  [Task] [Focus] [DDL]  [小策] [Music] 各窗口由 React/TS 渲染       |
+----------------------------------------------------------------------+
|  Electron Main Process（Node）                                      |
|  窗口与托盘 | 系统集成 | 采集调度 | SQLite | IPC                    |
+----------------------------------------------------------------------+
|  Node Utility Process                                               |
|  行为采集 | ONNX Transformer 推理 | 风险引擎 | Agent | ASR/TTS     |
+----------------------------------------------------------------------+
|  外部本地服务：Ollama + Qwen；可选 Python 训练脚本                  |
+----------------------------------------------------------------------+
```

架构规则：

- 所有 UI 窗口是 Electron BrowserWindow，主进程负责窗口与系统集成。
- 行为采集、模型推理、Agent 请求、语音处理放在 Node Utility Process 或 worker 中，避免阻塞主进程。
- 渲染进程不直接访问数据库和 Win32 API，统一通过 preload 暴露的类型化 IPC 调用主进程能力。
- ONNX 行为模型由 onnxruntime-node 在 Node 中执行。
- Qwen 通过 Ollama 本地 HTTP API 调用；行为数据不发送到外部网络。

## 6. 桌面展示层设计

### 6.1 窗口类型

Electron 中每个窗口都是一个独立的 BrowserWindow。

| 窗口 | 作用 | 窗口配置 |
|---|---|---|
| DesktopWidgetWindow | 桌面小组件 | transparent、frameless、skipTaskbar、置底 |
| AlertWindow | 主动提醒 | transparent、frameless、临时置顶 |
| ChatWindow | 与小策对话 | 无边框弹出层或普通窗口 |
| MainConsoleWindow | 设置、导入、周报 | 普通应用主窗口 |
| SystemTray | 常驻控制 | Windows 托盘 |

桌面组件窗口使用 `setIgnoreMouseEvents(ignore, { forward: true })` 处理鼠标穿透，组件自身可点击区域通过 IPC 或渲染层命中测试实现。

### 6.2 桌面小组件框架

组件定义为 React/TypeScript 页面，由主进程中的 `WidgetManager` 统一管理。

组件描述结构：

```json
{
  "id": "focus_card",
  "name": "专注状态",
  "version": "1.0",
  "component": "FocusCard",
  "route": "/widgets/focus-card",
  "x": 1200,
  "y": 80,
  "width": 280,
  "height": 160,
  "visible": true,
  "opacity": 0.92
}
```

WidgetManager 职责：

- 加载 `widgets.json` 中的组件配置。
- 为每个组件创建一个独立 BrowserWindow，并加载对应 React 路由。
- 支持拖动、保存位置、显示/隐藏。
- 使用 `setIgnoreMouseEvents` 实现组件区域外鼠标穿透。
- 通过统一数据模型向组件推送任务、状态、提醒和音乐信息。
- 所有窗口数据通过主进程 IPC 广播，不在每个渲染进程中重复连接后台服务。

第一版内置组件：

| 组件 | 显示内容 | 主要交互 |
|---|---|---|
| TaskWidget | 今日任务进度、最近 DDL | 点击查看任务详情 |
| FocusWidget | 当前状态、专注时长 | 开始/暂停专注 |
| DeadlineWidget | 最近考试与作业倒计时 | 展开日程 |
| CharacterWidget | 小策角色与状态动画 | 点击打开对话 |
| MusicWidget | 歌曲信息、播放控制 | 播放/暂停/上一首/下一首 |

### 6.3 壁纸层设计

壁纸能力分为三个阶段：

#### 阶段 1：静态图片壁纸

用户在壁纸管理页选择内置主题或本机图片。应用通过 Windows `SystemParametersInfoW` 更新系统壁纸，并将选择结果保存到本地配置。桌面小组件作为独立窗口显示。

优点：实现简单、稳定，不会与桌面图标和窗口层发生冲突。

#### 阶段 2：应用渲染壁纸层

当需要动态壁纸时，创建无边框 BrowserWindow 并嵌入 Windows 桌面 `WorkerW`，使应用渲染内容显示在桌面图标之下。

实现要点：

- 使用 Win32 API 找到 `Progman` 及包含 `SHELLDLL_DefView` 的 `WorkerW`。
- 通过 `win.getNativeWindowHandle()` 获取 BrowserWindow 的 Win32 句柄。
- 使用 `koffi` 调用 Win32 `SetParent`，将该句柄设置为 WorkerW 的子窗口。
- 覆盖虚拟桌面范围，支持多显示器。
- 如果嵌入失败，回退到阶段 1。

#### 阶段 3：动态主题

将动态壁纸封装为“壁纸场景”，例如轻量粒子、时间渐变、校园主题动画。该阶段不作为 9 月 30 日提交的强制能力。

### 6.4 主控台

主控台包含以下页面：

| 页面 | 功能 |
|---|---|
| 今日 | 今日任务、专注记录、风险提示 |
| 日程 | 课表、考试、作业、普通日程 |
| 壁纸 | 选择主题、添加本机图片 |
| 组件 | 显示/隐藏/添加组件、恢复默认布局 |
| 音乐 | 选择音乐文件夹、播放列表 |
| 对话 | 小策对话、Agent 设置 |
| 报告 | 周报、习惯数据、模型表现 |
| 设置 | 隐私、自启动、勿扰时段、模型选择 |

### 6.5 系统托盘

托盘菜单固定包含：

- 显示/隐藏桌面组件
- 打开主控台
- 打开小策对话
- 退出应用

## 7. 音乐播放器设计

### 7.1 功能范围

- 用户选择本地音乐文件夹，应用扫描常见音频格式。
- 支持 mp3、flac、wav、ogg。
- 播放、暂停、上一首、下一首、拖动进度、调整音量。
- 读取常见音频元数据：标题、艺术家、专辑、时长。
- 组件显示当前歌曲与播放状态。

### 7.2 技术方案

播放能力使用 Electron 渲染进程中的 HTML5 `<audio>`，音频文件路径由主进程读取并授权后提供给渲染层；文件扫描、播放列表和本地音频库管理在 Node 侧完成。

实现方式：

- 主进程使用文件对话框选择音乐文件夹，Node 扫描本地音频。
- 渲染进程通过 IPC 获取播放列表与文件地址。
- 渲染层使用 HTML5 Audio 播放，主进程不长期持有音频解码。
- 播放状态通过主进程广播，音乐组件与其他 UI 同步。

### 7.3 与系统的关系

- 音乐播放器是普通桌面组件，不影响学习感知链路。
- 用户进入其他应用时，播放器窗口可能被遮挡；可通过 Windows 媒体键控制，后续可增加全局快捷键。
- 小策对话时，播放器自动降低音量作为可选设置。

## 8. 行为采集设计

### 8.1 采集原则

- 只采集应用使用、窗口主题、文件操作类型、键鼠活跃度等元数据。
- 不采集键盘具体按键、剪贴板内容、浏览器网页正文、屏幕截图。
- 所有数据默认保存在本机 SQLite。
- 敏感目录或窗口标题可加入忽略列表。

### 8.2 前台应用采集

采集器运行在 Node Utility Process，每隔 1 秒读取当前前台窗口：

- `koffi` 调用 Win32 `GetForegroundWindow` 获取前台窗口句柄。
- `koffi` 调用 `GetWindowThreadProcessId` 获取进程 ID。
- `active-win` 或进程信息获取应用名称。
- `koffi` 调用 `GetWindowTextW` 获取窗口标题。
- 窗口标题仅用于归类，例如标题含“报告.pdf”归为文档类。

窗口标题含用户文件名，因此本地存储并默认不显示在组件中；如用户开启“显示窗口细节”，才在周报中展示聚合结果。

### 8.3 活跃度采集

通过 `koffi` 调用 Win32 `GetLastInputInfo`，获取距最后一次键鼠输入的时间，从而计算：

- 当前是否活跃。
- 已空闲时长。
- 一个时间片内的活跃比例。

该方案不注册键盘钩子，不读取输入内容，降低杀毒软件误报与隐私风险。

### 8.4 文件事件采集

使用 `chokidar` 监听用户选定的目录，默认包括桌面、文档、项目目录。

记录字段：

| 字段 | 说明 |
|---|---|
| event_time | 事件时间 |
| action | created/modified/deleted/moved |
| path | 文件路径 |
| extension | 文件扩展名 |
| category | 文档/代码/图片/其他 |

### 8.5 应用类别映射

应用类别由进程名与窗口标题共同决定：

| 类别 | 示例 |
|---|---|
| study_document | Word、PDF、笔记、课程文档 |
| study_code | IDE、代码编辑器 |
| study_video | 网课、教学视频 |
| communication | 微信、邮件、会议 |
| entertainment | 视频网站、游戏、短视频 |
| music | 音乐软件 |
| browsing_other | 其他浏览器页面 |
| away | 锁定、无人操作 |
| unknown | 暂未分类 |

类别表需要允许用户手动修正，修正记录会进入模型训练数据。

### 8.6 日程导入

支持导入：

- ICS 日历文件。
- Excel/CSV 课表。
- Excel/CSV 作业与考试清单。
- 手动添加。

统一转换为 `calendar_events` 表结构。

## 9. 数据存储设计

数据库采用 SQLite，开启 WAL 模式。数据目录位于应用本地数据目录。

主要数据表：

| 表名 | 用途 |
|---|---|
| app_sessions | 前台应用会话 |
| activity_ticks | 每分钟活跃度 |
| file_events | 文件事件 |
| calendar_events | 课程/考试/作业/日程 |
| tasks | 待办与任务 |
| behavior_labels | 行为状态标注 |
| model_predictions | 模型推理结果 |
| risk_events | 风险事件 |
| focus_sessions | 专注会话 |
| notifications | 已发出的提醒 |
| chat_logs | 与小策的对话 |
| user_profile | 长期画像 |
| user_feedback | 用户对提醒和任务的反馈 |

### 9.1 app_sessions

| 字段 | 说明 |
|---|---|
| id | 主键 |
| started_at | 会话开始时间 |
| ended_at | 会话结束时间 |
| app_name | 应用名称 |
| process_id | 进程 ID |
| window_title | 窗口标题 |
| category | 应用类别 |
| activity_ratio | 输入活跃比例 |

### 9.2 calendar_events 与 tasks

`calendar_events` 保存原始日程，`tasks` 保存可执行任务。

| tasks 字段 | 说明 |
|---|---|
| title | 任务名 |
| source_type | course/exam/assignment/manual |
| source_id | 来源日程 ID |
| due_at | 截止时间 |
| estimated_minutes | 预估耗时 |
| status | open/in_progress/done/cancelled |
| priority | 高/中/低 |

### 9.3 user_profile

画像字段：

| 字段 | 说明 |
|---|---|
| peak_hours | 高效时段 |
| avg_focus_minutes | 平均专注时长 |
| focus_curve | 不同时段的专注基线 |
| task_duration_estimate | 任务类型耗时估计 |
| entertainment_pattern | 娱乐高发时段 |
| productivity_score | 最近 7 天学习产出评分 |

## 10. 特征与行为序列设计

### 10.1 时间片定义

以 1 分钟为最小特征粒度，按小时与日期建立索引。

### 10.2 单分钟特征

| 特征 | 类型 | 说明 |
|---|---|---|
| weekday | 分类 | 周几 |
| hour_of_day | 数值 | 0-23 |
| is_weekend | 布尔 | 是否周末 |
| app_category_id | 分类 | 前台应用类别 |
| window_type_id | 分类 | 文档/代码/视频/浏览器等 |
| file_events | 数值 | 本分钟文件事件数 |
| input_active | 数值 | 活跃比例 |
| idle_seconds | 数值 | 当前连续空闲秒数 |
| is_locked | 布尔 | 是否离开 |

### 10.3 序列窗口

模型输入最近 128 个一分钟时间片，即约两小时行为上下文。滑动步长为 1 分钟。

## 11. 行为序列模型设计

### 11.1 模型角色

行为序列模型只负责理解行为，不负责自然语言生成。

任务：

- 当前活动分类。
- 分心风险概率。
- 当前专注会话剩余时长预测。
- 下一活动预测，用于短期提醒。

### 11.2 模型结构

采用轻量 Transformer：

| 参数 | 取值 |
|---|---|
| 编码器层数 | 4 |
| 注意力头数 | 4 |
| d_model | 128 |
| 前馈层维度 | 512 |
| dropout | 0.1 |
| 最大序列长度 | 128 |
| 参数量 | 约 1-3M |

结构：

```text
Input Features
      |
  Feature Embedding
      |
  Positional Encoding
      |
  Transformer Encoder x4
      |
  [CLS] Pooling
      |
  Activity Head | Distraction Head | Duration Head
```

类别特征使用 Embedding，数值特征归一化后拼接。

### 11.3 导出与运行

PyTorch 训练完成后导出为 ONNX 文件，字段名、归一化参数、类别映射表随模型一起保存。运行阶段由 Node 中的 onnxruntime-node 加载 ONNX 模型并执行推理。

导出内容包括：

- `behavior_model.onnx`：行为序列模型。
- `feature_config.json`：特征顺序与归一化参数。
- `category_map.json`：应用类别与活动类别映射。
- `model_card.json`：训练数据、指标、版本说明。

### 11.4 训练数据

数据来源：

- 团队真实电脑采集日志。
- 竞赛演示用脱敏行为流生成器。
- 基于窗口类别的弱标签。
- 人工标注若干完整日作为验证集。

演示数据生成器按“学习日、娱乐日、DDL 前、考试周”等模板生成 14-30 天模拟行为，并加入随机扰动，防止模型只记住固定序列。

### 11.5 训练与评估

- 按“天”划分训练集与测试集，避免同一日期切片泄漏。
- 活动分类评估宏平均 F1。
- 分心风险评估 AUC。
- 时长预测评估 MAE。
- 与“仅使用当前应用类别”的规则基线对比。

## 12. 风险与规则引擎

规则引擎负责稳定、可解释的基础提醒，模型概率用于调整提醒强度。

### 12.1 风险类型

| 风险 | 触发条件 |
|---|---|
| ddl_near | 任务 72 小时内截止 |
| activity_mismatch | 截止任务临近但当前状态不匹配 |
| task_not_started | 计划任务超过开始时间 30 分钟 |
| long_entertainment | 娱乐状态连续超过阈值且有待办 |
| focus_overrun | 专注时长超过个人历史均值 |
| schedule_conflict | 同一时间段存在冲突任务 |

### 12.2 风险评分

简化公式：

```text
risk_score = w1 * deadline_urgency
          + w2 * activity_mismatch
          + w3 * model_distraction_prob
          + w4 * historical_delay_factor
```

阈值分级：

- 0-0.3：不提醒。
- 0.3-0.6：仅桌面状态提示。
- 0.6-0.8：角色气泡 + 语音轻声提醒。
- 0.8 以上：置顶提醒并要求用户选择“开始任务/稍后再说/忽略今日”。

### 12.3 提醒纪律

- 同一风险事件冷却 30 分钟。
- 支持勿扰时段，默认 23:30-07:30 不主动提醒。
- 用户连续忽略同一任务 3 次后降级为桌面提示。

## 13. Agent 设计

### 13.1 Agent 能力

| 能力 | 说明 |
|---|---|
| 今日安排 | 根据剩余任务生成晚间/今日计划 |
| 任务拆解 | 将大任务拆为 25-45 分钟可执行片段 |
| 风险解释 | 解释为什么现在提醒 |
| 时间估计 | 基于用户画像估计任务耗时 |
| 周报总结 | 总结本周专注、拖延、完成情况 |
| 学习建议 | 仅基于用户自身数据提出调整建议 |

### 13.2 大模型选型

使用 Ollama 管理本地模型。

| 环境 | 模型 |
|---|---|
| 默认推荐 | qwen2.5:7b-instruct-q4_K_M |
| 低配电脑 | qwen2.5:3b-instruct |
| 模型不可用 | 内置模板回复 |

Agent 通过 Node 侧 `OllamaClient` 调用 Ollama 本地 HTTP API，不向外部发送个人信息。

### 13.3 工具调用

Agent 不直接访问数据库，而是通过 Node 侧注册工具获取数据：

| 工具 | 输入 | 输出 |
|---|---|---|
| get_today_context | 无 | 今日任务、日程、状态 |
| get_pending_risks | 无 | 当前风险事件 |
| get_profile_summary | 无 | 用户行为画像 |
| get_recent_focus | 天数 | 专注统计 |
| create_focus_plan | task_id | 拆分后的专注片段 |
| set_do_not_disturb | enabled | 更新勿扰状态 |

工具执行结果作为上下文注入提示词，由本地模型生成自然语言回复。

### 13.4 角色人设

小策人设建议：

- 语气：温和、简洁、不催促、不说教。
- 表达：先给结论，再给一个最小行动。
- 边界：不编造用户数据，不确定时给出“目前没有足够数据”。
- 对话内容不包含系统内部字段名。

## 14. 语音设计

### 14.1 语音识别

使用 `sherpa-onnx-node` 加载中文 Paraformer 模型，离线执行。

流程：

1. 用户在小组件中点击语音按钮或按全局快捷键。
2. Node 语音 Worker 采集麦克风音频。
3. sherpa-onnx-node 执行 ASR 并输出文本。
4. 文本进入 Agent 对话流程。

如麦克风不可用，直接使用文本输入。

### 14.2 语音合成

第一版使用 sherpa-onnx-node 提供的本地中文 VITS 模型生成提醒语音与回复语音。

音频播放由 Electron 渲染层 HTML5 Audio 完成，避免阻塞主进程。

### 14.3 降级规则

| 场景 | 处理 |
|---|---|
| Ollama 未启动 | 使用内置规则模板回复 |
| 语音模型未下载 | 仅显示文字 |
| 用户处于勿扰时段 | 不主动播放语音 |

## 15. 用户反馈与画像更新

用户反馈来源：

- 用户对提醒选择“有帮助/没有帮助”。
- 用户开始或放弃专注。
- 用户修改任务开始时间。
- 用户修改应用类别。

反馈写入 `user_feedback`，用于更新画像与后续模型微调。

## 16. 隐私与安全设计

| 项目 | 设计 |
|---|---|
| 数据存储 | 默认仅存本机 SQLite |
| 网络 | 本地模型优先，不上传行为数据 |
| 按键 | 不记录真实按键内容 |
| 屏幕 | 不保存屏幕截图 |
| 文件 | 只记录路径与事件，不读取文件正文 |
| 窗口标题 | 本地存储，可在设置中关闭 |
| 删除 | 设置中提供“清除全部行为数据” |
| 授权 | 首次启动必须完成隐私说明与授权 |
| 忽略列表 | 可忽略指定应用、目录、标题关键词 |

## 17. 软件工程结构

```text
smartdesk/
├ package.json
├ electron.vite.config.ts
├ tsconfig.json
├ README.md
├ configs/
│ ├ default-settings.json
│ └ widget-layout.json
├ src/
│ ├ main/
│ │ ├ index.ts
│ │ ├ tray.ts
│ │ ├ window-manager.ts
│ │ ├ wallpaper-manager.ts
│ │ ├ widget-manager.ts
│ │ ├ ipc/
│ │ │ ├ channels.ts
│ │ │ └ handlers.ts
│ │ └ utils/
│ ├ preload/
│ │ └ index.ts
│ ├ renderer/
│ │ ├ index.html
│ │ └ src/
│ │   ├ App.tsx
│ │   ├ pages/
│ │   │ ├ TodayPage.tsx
│ │   │ ├ SettingsPage.tsx
│ │   │ └ ReportPage.tsx
│ │   ├ widgets/
│ │   │ ├ TaskWidget.tsx
│ │   │ ├ FocusWidget.tsx
│ │   │ ├ DeadlineWidget.tsx
│ │   │ ├ MusicWidget.tsx
│ │   │ └ CharacterWidget.tsx
│ │   ├ stores/
│ │   ├ components/
│ │   └ styles/
│ ├ node-worker/
│ │ ├ collector/
│ │ │ ├ foreground.ts
│ │ │ ├ activity.ts
│ │ │ ├ file-events.ts
│ │ │ └ category-mapper.ts
│ │ ├ storage/
│ │ │ ├ database.ts
│ │ │ └ schema.sql
│ │ ├ features/
│ │ │ ├ aggregator.ts
│ │ │ └ feature-builder.ts
│ │ ├ model/
│ │ │ ├ onnx-runner.ts
│ │ │ └ model-manager.ts
│ │ ├ engine/
│ │ │ ├ risk-engine.ts
│ │ │ └ scheduler.ts
│ │ ├ agent/
│ │ │ ├ agent-service.ts
│ │ │ ├ ollama-client.ts
│ │ │ ├ tools.ts
│ │ │ └ prompts.ts
│ │ ├ speech/
│ │ │ ├ asr.ts
│ │ │ ├ tts.ts
│ │ │ └ audio.ts
│ │ ├ music/
│ │ │ └ music-library.ts
│ │ └ events/
│ │   └ event-bus.ts
├ python-training/
│ ├ requirements.txt
│ ├ model.py
│ ├ train.py
│ ├ export_onnx.py
│ └ generate_demo.py
├ resources/
│ ├ wallpaper/
│ ├ voice-models/
│ ├ onnx/
│ └ icons/
├ data/
│ ├ database/
│ ├ logs/
│ └ demo/
├ tests/
└ docs/
```

## 18. 依赖清单

### 18.1 运行环境 Node 依赖

| 依赖 | 用途 |
|---|---|
| electron | 桌面应用壳 |
| react / react-dom | 组件与 UI |
| typescript | 类型系统 |
| vite / electron-vite | 构建与开发 |
| electron-builder | Windows 打包 |
| better-sqlite3 | 本地数据库 |
| koffi | Node 调用 Win32 API |
| active-win | 前台窗口信息 |
| chokidar | 文件事件监听 |
| onnxruntime-node | ONNX Transformer 推理 |
| sherpa-onnx-node | 本地 ASR/TTS |
| zod | 配置与 IPC 数据校验 |
| zustand | 渲染层状态管理 |
| vitest | 测试 |

说明：`koffi`、`better-sqlite3`、`sherpa-onnx-node` 属于原生模块，接入 Electron 后需要使用 electron-rebuild 或安装对应 Electron ABI 的预编译版本。

### 18.2 Python 训练环境依赖

Python 环境只在开发与训练阶段使用，不进入最终 Electron 安装包。

| 依赖 | 用途 |
|---|---|
| torch | Transformer 训练 |
| numpy | 数值处理 |
| pandas | 行为日志处理 |
| onnx | 模型导出 |

### 18.3 Ollama

Ollama 作为独立本地服务运行，默认加载 `qwen2.5:7b-instruct-q4_K_M`，低配机器可切换 `qwen2.5:3b-instruct`。

## 19. 核心模块接口

### 19.1 事件总线

Node 侧模块之间通过事件总线通信，主进程与渲染层通过类型化 IPC 通信。

内部事件：

| 事件 | 数据 | 消费者 |
|---|---|---|
| SessionChanged | app_sessions 片段 | 特征层 |
| ActivityTick | 活跃度记录 | 特征层 |
| FileEvent | 文件事件 | 特征层 |
| PredictionReady | 活动与风险概率 | UI、风险引擎 |
| RiskRaised | 风险事件 | UI、Agent |
| UserFeedback | 用户反馈 | 画像层 |
| MusicStateChanged | 播放状态 | MusicWidget |

### 19.2 状态推送

React 组件通过 preload 暴露的状态通道读取当前状态：

```json
{
  "current_activity": "study_document",
  "focus_minutes": 38,
  "distraction_prob": 0.35,
  "today_tasks": {
    "done": 2,
    "total": 4
  },
  "next_deadline": {
    "title": "实验报告",
    "due_in_hours": 47
  }
}
```

## 20. 关键验收标准

| 编号 | 验收项 | 结果 |
|---|---|---|
| A1 | 应用启动后进入桌面模式，无任务栏主窗口 | 通过 |
| A2 | 可切换内置壁纸与本机图片 | 通过 |
| A3 | 组件可显示、隐藏、拖动并保存位置 | 通过 |
| A4 | 可导入 ICS/Excel 课程与作业 | 通过 |
| A5 | 前台应用与活跃度采集持续写入 SQLite | 通过 |
| A6 | 桌面显示今日任务与专注状态 | 通过 |
| A7 | 演示日志可触发 DDL 风险提醒 | 通过 |
| A8 | 小策可进行文本对话并生成任务拆解 | 通过 |
| A9 | 本地音乐播放器可播放 mp3 | 通过 |
| A10 | 语音输入输出可完成一次对话 | 通过 |
| A11 | 数据默认本地保存，提供清除入口 | 通过 |
| A12 | electron-builder 打包后应用可启动 | 通过 |

## 21. 开发里程碑

从 2026-09-07 开始，按 23 天倒排：

| 阶段 | 时间 | 交付物 |
|---|---|---|
| M1 | 第 1-2 天 | Electron/React 骨架、窗口管理、托盘、SQLite |
| M2 | 第 3-6 天 | Node 前台采集、文件采集、日程导入、任务与状态组件 |
| M3 | 第 7-10 天 | 演示数据生成、Python 特征层、小 Transformer 训练与 ONNX 导出 |
| M4 | 第 11-13 天 | Node 规则引擎、风险提醒、桌面弹层 |
| M5 | 第 14-16 天 | 音乐播放器、壁纸管理、组件布局 |
| M6 | 第 17-19 天 | Ollama Agent、小策对话、sherpa-onnx-node 语音接入 |
| M7 | 第 20-21 天 | 全流程集成、原生模块兼容测试、缺陷修复 |
| M8 | 第 22-23 天 | 演示视频、作品文档、electron-builder 打包 |

## 22. 测试计划

### 22.1 单元测试

- 窗口标题到应用类别的映射。
- ICS/Excel 导入解析。
- SQLite 写入与读取。
- 风险规则计算。
- 行为数据生成器。
- Agent 工具返回值校验。

### 22.2 集成测试

- 采集 10 分钟真实桌面行为。
- 生成对应特征序列。
- 规则引擎输出合理风险等级。
- UI 收到状态推送并更新组件。

### 22.3 演示稳定性测试

- 连续运行 2 小时无崩溃。
- 断网状态下小策仍可回复模板话术。
- 无麦克风时文本对话正常。
- 组件重启后恢复位置。

## 23. 竞赛材料准备

需要形成：

1. 作品展示视频，约 5 分钟。
2. 详细设计文档。
3. 项目 README 与运行说明。
4. 系统架构图。
5. 行为模型训练说明。
6. 隐私合规说明。
7. 测试报告。
8. 可运行源码或打包程序。

建议视频结构：

- 0:00-0:30 产品定位。
- 0:30-1:30 桌面层展示：壁纸、组件、音乐、小策。
- 1:30-3:00 拖延风险提醒演示。
- 3:00-4:00 对话、任务拆解、专注。
- 4:00-5:00 数据画像、模型、隐私说明。

## 24. 风险与应对

| 风险 | 影响 | 应对 |
|---|---|---|
| UI 范围过大 | 挤压模型与 Agent 时间 | 以桌面小组件 MVP 为先 |
| WorkerW 嵌入失败 | 动态壁纸不可用 | 第一版使用静态壁纸 |
| 本地数据不足 | 模型说服力弱 | 演示数据生成 + 弱标签 |
| 模型指标不高 | 评审质疑 | 与规则基线对比，强调端到端系统 |
| 无 GPU | 大模型推理慢 | 3B 模型 + 后台异步 + 模板兜底 |
| 语音中文效果一般 | 演示体验下降 | 文本降级路径完整 |
| 杀毒软件拦截 | 采集停止 | 不注册键盘钩子，元数据采集 |
| 打包体积过大 | 提交不便 | 提供源码 + 可选独立打包版 |
| Electron 原生模块不兼容 | koffi/better-sqlite3/sherpa-onnx-node 无法加载 | 使用 electron-rebuild 对齐 ABI；必要时将语音改到 Python Worker |
| Node 调用 Win32 出错 | 采集失效 | 先以 active-win + koffi 小步验证，再做完整采集 |
| React 桌面窗口过多 | 内存占用高 | 组件默认按需加载，复用同一 renderer 路由 |

## 25. 待确认决策

| 决策项 | 建议值 | 状态 |
|---|---|---|
| 产品名 | 智伴桌面 | 待确认 |
| 角色名 | 小策 | 待确认 |
| 目标机器 | 团队成员 Windows 电脑 | 待确认 |
| 桌面技术栈 | Electron + React + TS + Node | 已确认 |
| 行为模型运行方式 | PyTorch 训练并导出 ONNX，Node 推理 | 已确认 |
| 语音方案 | sherpa-onnx-node 本地 ASR/TTS | 已确认 |
| 动态壁纸 | 列为阶段 3 加分项 | 待确认 |
| 7B 模型是否流畅 | 现场测试后决定 | 待确认 |
| 音乐版权 | 仅播放用户本地文件 | 已确认 |

## 26. 参考资料

- 2026 年天津市第九届大学生信息技术“新工科”工程实践创新技术竞赛通知。
- 竞赛网站：http://www.chinaxgk.com
- Electron 与 Electron Builder 文档。
- React + TypeScript 文档。
- Ollama 本地模型运行文档。
- onnxruntime-node 推理文档。
- sherpa-onnx-node 本地语音识别与合成文档。
