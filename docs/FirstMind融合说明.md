# FirstMind 与智伴桌面的融合说明

更新日期：2026-10-13

## 来源

- 组员仓库：[LuKads666/FirstMind](https://github.com/LuKads666/FirstMind)，集成时参考提交 `c8164cd80b3b8aee8a47c0803ba7f2adebd7ecce`。
- 本仓库继续作为 Electron 桌面应用的主项目。组员负责的活动识别思路和 Transformer 权重已接入运行链路。
- `smartdesk/python-training/firstmind_model.py` 与 `firstmind_transformer.pth` 来自组员仓库；`export_firstmind_onnx.py` 将该权重导出为桌面程序可加载的 ONNX 模型。

## 已接入的功能

1. **前台活动解析**：先使用原有软件名与标题分类，再应用 FirstMind 的标题规则、完整标题缓存和同一软件内的已学习关键词。模糊标题可由本机 Ollama 辅助判定。Ollama 不可用时继续使用本地规则。解析结果进入 `app_sessions`，供统计、预测和提醒共用。
2. **组员的 Transformer 模型**：桌面程序使用 `resources/onnx/firstmind.onnx` 推理，配套的特征顺序、均值、标准差和标签映射在 `firstmind.json` 中。运行时不需要 Python 或 PyTorch。
3. **比赛提醒**：每分钟从最近六个完整的五分钟窗口构造 16 维特征，预测 `focused_work`、`mixed_activity` 或 `entertainment`。只有高置信度的娱乐判断才会增加提醒风险分数。短于 30 分钟或覆盖率不足的数据不会触发模型预测，原有规则提醒仍可使用。

## 数据转换

FirstMind 的模型输入是 12 个类别时长占比，加 `activity_ratio`、`switch_count`、`max_idle_seconds`、`coverage_ratio`。主项目原有 9 个类别需要映射：

| 智伴桌面类别 | FirstMind 类别 |
| --- | --- |
| `study_code` | `development` |
| `study_document`、`study_video` | `study` |
| `communication` | `communication` |
| `music` | `media` |
| `browsing_other` | `browser` |
| `entertainment` | `game`（已知游戏进程）或 `entertainment` |
| `away` | `system` |
| 其他 | `unknown` |

`max_idle_seconds` 从现有分钟时间片估算，因此与组员原采集器的逐会话最大空闲值不完全相同。组员模型的训练数据与主项目的真实采集数据分布也不同；不能直接把原训练结果当作融合后的准确率。赛前应收集双方同意使用的真实样本，复核误报率并重训或校准模型。

## 复现与检查

```powershell
cd smartdesk
python python-training/export_firstmind_onnx.py
.\node_modules\.bin\tsc.cmd --noEmit
.\node_modules\.bin\vitest.cmd run
.\node_modules\.bin\electron-vite.cmd build
```

导出时已对同一输入比对 PyTorch 与 ONNX 输出，三个 logit 一致。原有 `behavior_model.onnx` 暂留作历史版本，运行时已切换到 FirstMind。FirstMind 的文件目录监听尚未启用：目前主项目的隐私说明仅承诺采集前台软件及窗口信息，接入目录监听前需要在界面上提供用户选择目录和关闭开关。
