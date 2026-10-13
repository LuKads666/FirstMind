# FirstMind × 智伴桌面

2026 年天津市大学生信息技术“新工科”工程实践创新竞赛项目。

## 仓库结构

- 仓库根目录的 JavaScript、Python 文件：组员的 FirstMind 行为采集、活动解析和模型训练原型，原文件与提交历史保留。
- [`smartdesk/`](smartdesk/)：可运行的 Electron 桌面应用。已接入 FirstMind 的活动解析思路和 Transformer 权重。
- [`docs/FirstMind融合说明.md`](docs/FirstMind融合说明.md)：集成方式、模型输入映射及验证记录。
- [`docs/DETAILED_DESIGN.md`](docs/DETAILED_DESIGN.md)：桌面应用设计文档。

## 运行桌面应用

在 Windows 上安装 Node.js 和 pnpm 后：

```powershell
cd smartdesk
pnpm install
pnpm dev
```

检查代码与构建：

```powershell
pnpm typecheck
pnpm test
pnpm build
```

运行时使用 `smartdesk/resources/onnx/firstmind.onnx`，无需安装 Python 或 PyTorch。重新导出组员模型时运行 `python smartdesk/python-training/export_firstmind_onnx.py`。
