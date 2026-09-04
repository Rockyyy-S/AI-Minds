# AI网页问答自动化工作流

这套工作流是把“打开网页聊天工具 -> 输入提示词 -> 等待回答 -> 提取结果 -> 写入 Markdown 文件”做成可重复执行的命令行工具。

## 5 分钟快速开始

```bash
npm install
```

1. 先检查根目录配置文件 `workflow.config.json`，确认 `outputDir` 是否是你本机可写目录。

1. 首次使用先做登录态初始化（可先从一个站点开始）：

```bash
npm run setup:kimi
```

1. 跑一次单站点提问验证链路：

```bash
npm run ask:kimi -- --prompt "你好" --output-file hello.md
```

1. 再按配置文件跑多站点：

```bash
npm run ask:all -- --prompt "你好" --output-file hello.md
```

1. 需要批量执行时，直接使用任务文件：

```bash
npm run batch:all
```

## 快速导航

- 新手先看：`5 分钟快速开始`
- 配置说明：`编辑站点配置文件`
- 单次提问：`单站点单次提问`、`按配置文件对全部站点单次提问`
- 批量任务：`单站点批量执行`、`批量任务文件格式`
- 稳定性与策略：`当前稳定性`、`新增站点的免费高级功能策略`
- 故障排查：`失败处理`、`登录故障排查`

## 推荐执行顺序（首次）

1) `npm install`
2) 修改 `workflow.config.json`：先确认 `outputDir` 是本机可写目录
3) 先初始化 1 个站点登录态（建议 `kimi`）
4) 执行 1 次单站点提问，确认输出文件能落盘
5) 再开启 `ask:all` 或 `batch:all` 跑多站点任务

这样做的目标是先把“配置可用 + 登录可用 + 输出可用”三件事逐一确认，避免一上来多站点并发排错。

当前已内置这些站点适配：

- `Kimi`
- `DeepSeek`
- `Z.ai`
- `Qwen Studio`
- `豆包`
- `秘塔 AI 搜索`
- `文心一言`
- `腾讯元宝`
- `Manus`
- `Grok`
- `ChatGPT`
- `Gemini`
- `Perplexity`

默认配置会优先启用相对稳定的站点；当前示例配置里 `grok` 与 `perplexity` 默认关闭，避免一上来就因为 Cloudflare 或额外安全验证影响整批任务。

默认提供了根目录配置文件 [workflow.config.json](workflow.config.json)，可以在里面控制哪些站点参与执行；当启用了多个站点时，可以用一条命令顺序执行所有已启用站点。

> 注意：当前仓库里的 `workflow.config.json` 示例把 `outputDir` 指向了一个本机绝对路径。首次使用前建议改成你自己的目录，或直接改成相对路径 `output`。

## 工作流设计

### 1. 初始化登录态

首次执行时先运行一次 `setup`，脚本会打开浏览器，让你自己完成登录。登录成功后，脚本会把登录态保存到本地 `.auth/` 目录。

这样做有三个好处：

- 不依赖你当前已经打开的浏览器窗口
- 避免每次运行都重新登录
- 对带验证码、短信验证、扫码登录的网站更稳

### 2. 单次执行

适合“给一个提示词，导出一个回答文件”的场景。

### 3. 批量执行

适合“准备一组提示词，批量导出多个 Markdown 文件”的场景。

## 环境要求

```bash
node -v
npm -v
```

- 建议 Node.js `18+`（或更高 LTS 版本）
- 首次安装依赖：

```bash
npm install
```

- 首次使用 Playwright 前，如果浏览器依赖不完整，可执行：

```bash
npx playwright install
```

## 常用命令

### 编辑站点配置文件

默认配置文件是 [workflow.config.json](workflow.config.json)，当前默认会启用大部分站点，并默认关闭 `grok` 与 `perplexity`。你可以按下面这种方式启用或关闭站点：

```json
{
  "sites": [
    { "id": "kimi", "enabled": true },
    { "id": "deepseek", "enabled": true },
    { "id": "zai", "enabled": true },
    { "id": "qwen", "enabled": true },
    { "id": "doubao", "enabled": true },
    { "id": "metaso", "enabled": true },
    { "id": "yiyan", "enabled": true },
    { "id": "yuanbao", "enabled": true },
    { "id": "manus", "enabled": true },
    { "id": "chatgpt", "enabled": true },
    { "id": "gemini", "enabled": true },
    { "id": "grok", "enabled": false },
    { "id": "perplexity", "enabled": false }
  ]
}
```

你也可以给某个站点单独指定登录态文件：

```json
{
  "sites": [
    { "id": "kimi", "enabled": true, "authFile": ".auth/kimi.json" },
    { "id": "deepseek", "enabled": false, "authFile": ".auth/deepseek.json" }
  ]
}
```

`sites` 里的每一项也可以直接写成字符串站点 id，例如 `["kimi", "deepseek"]`；配置字段 `authFile` 也兼容 `auth_file` / `authPath` / `auth_path`。

如果想统一指定输出根目录，可以在配置文件里加 `outputDir`：

```json
{
  "outputDir": "output",
  "sites": [
    { "id": "kimi", "enabled": true },
    { "id": "deepseek", "enabled": true }
  ]
}
```

任务里的 `outputFile` 只写文件名，不包含路径。最终输出路径固定为：`outputDir/{site}/outputFile`。

如果未配置 `outputDir`，默认使用项目根目录下的 `output`，也就是：`output/{site}/outputFile`。

### 初始化单个站点登录态

```bash
npm run setup:kimi
npm run setup:deepseek
npm run setup:zai
npm run setup:qwen
npm run setup:doubao
npm run setup:metaso
npm run setup:yiyan
npm run setup:yuanbao
npm run setup:manus
npm run setup:grok
npm run setup:chatgpt
npm run setup:gemini
npm run setup:perplexity
```

`Z.ai` 普通聊天可以免登录，但高级搜索会跳转登录页。由于脚本会在提问前确保高级搜索开启，所以建议先运行这个命令完成登录/验证。

当前实现里，`run` / `batch` 阶段也会把 `Z.ai` 按“需要登录态”的站点处理；如果还没有 `.auth/zai.json`，脚本会直接提示先执行 `setup:zai`，不会按游客模式继续跑。

`Qwen Studio / 豆包 / 秘塔 AI 搜索 / 文心一言 / ChatGPT / Gemini / Perplexity` 这类默认按免登录处理的站点，直接运行 `npm run setup:<site>` 时会按免登录逻辑跳过 setup。如果你希望额外保存登录态，统一在命令后追加 `-- --force-setup` 即可：

```bash
npm run setup:qwen -- --force-setup
npm run setup:doubao -- --force-setup
npm run setup:metaso -- --force-setup
npm run setup:yiyan -- --force-setup
npm run setup:chatgpt -- --force-setup
npm run setup:gemini -- --force-setup
npm run setup:perplexity -- --force-setup
```

如果你想按配置文件对所有已启用站点统一强制 setup，也可以这样传参数：

```bash
npm run setup:all -- --force-setup
```

强制 setup 成功后生成的 `.auth/<site>.json` 会在后续 `ask:<site>` / `batch:<site>` / `ask:all` / `batch:all` 中自动复用；如果对应登录态文件不存在，免登录站点仍会继续按未登录状态运行。

### 按配置文件初始化全部站点登录态

```bash
npm run setup:all
```

如果你第一次接入 `腾讯元宝 / Grok / ChatGPT / Gemini / Perplexity`，建议先单独看一下对应站点在你当前网络环境里是否会触发登录或安全验证，再决定是否直接放进 `ask:all / batch:all`。

### 单站点单次提问

```bash
npm run ask:kimi -- --prompt "我想做一个俄罗斯方块游戏，请给出具体落地方案" --output-file tetris-plan.md
npm run ask:deepseek -- --prompt "我想做一个俄罗斯方块游戏，请给出具体落地方案" --output-file tetris-plan.md
npm run ask:zai -- --prompt "我想做一个俄罗斯方块游戏，请给出具体落地方案" --output-file tetris-plan.md
npm run ask:qwen -- --prompt "你好" --output-file hello.md
npm run ask:doubao -- --prompt "你好" --output-file hello.md
npm run ask:metaso -- --prompt "你好" --output-file hello.md
npm run ask:yiyan -- --prompt "你好" --output-file hello.md
npm run ask:yuanbao -- --prompt "你好" --output-file hello.md
npm run ask:manus -- --prompt "你好" --output-file hello.md
npm run ask:grok -- --prompt "你好" --output-file hello.md
npm run ask:chatgpt -- --prompt "你好" --output-file hello.md
npm run ask:gemini -- --prompt "你好" --output-file hello.md
npm run ask:perplexity -- --prompt "你好" --output-file hello.md
```

### 按配置文件对全部站点单次提问

```bash
npm run ask:all -- --prompt "我想做一个俄罗斯方块游戏，请给出具体落地方案" --output-file tetris-plan.md
```

也可以直接调用脚本；如果没有传 `--site`，脚本会优先读取根目录的 `workflow.config.json`：

```bash
node scripts/web-chat-workflow.mjs run --prompt "你好" --output-file hello.md
node scripts/web-chat-workflow.mjs run --prompt "你好" --output-file hello.md --output-dir output
```

也可以直接用逗号分隔的 `--site` 临时指定多个站点，而不依赖配置文件：

```bash
node scripts/web-chat-workflow.mjs run --site kimi,deepseek --prompt "你好" --output-file hello.md
```

### 从提示词文件提问

```bash
npm run ask:kimi -- --prompt "请结合以下补充材料给出完整方案" --prompt-file prompts/初步方案提示词.md --output-file 初步方案.md
npm run ask:deepseek -- --prompt "请结合以下补充材料给出完整方案" --prompt-file prompts/初步方案提示词.md --output-file 初步方案.md
npm run ask:zai -- --prompt "请结合以下补充材料给出完整方案" --prompt-file prompts/初步方案提示词.md --output-file 初步方案.md
```

这里 `prompt` 为必填；如果同时传了 `promptFile`，会读取文件内容并追加在 `prompt` 后面再发送。

### 单站点批量执行

```bash
npm run batch:kimi
npm run batch:deepseek
npm run batch:zai
npm run batch:qwen
npm run batch:doubao
npm run batch:metaso
npm run batch:yiyan
npm run batch:yuanbao
npm run batch:manus
npm run batch:grok
npm run batch:chatgpt
npm run batch:gemini
npm run batch:perplexity
```

按配置文件批量执行全部站点：

```bash
npm run batch:all
```

或者：

```bash
node scripts/web-chat-workflow.mjs batch --site kimi --tasks tasks/kimi-tasks.example.json
node scripts/web-chat-workflow.mjs batch --site deepseek --tasks tasks/deepseek-tasks.example.json
node scripts/web-chat-workflow.mjs batch --site zai --tasks tasks/kimi-tasks.example.json
```

多站点批量任务示例见 [tasks/multi-site-tasks.example.json](tasks/multi-site-tasks.example.json)：

```bash
node scripts/web-chat-workflow.mjs batch --config workflow.config.json --tasks tasks/multi-site-tasks.example.json
node scripts/web-chat-workflow.mjs batch --config workflow.config.json --tasks tasks/multi-site-tasks.example.json --output-dir output
```

批量任务文件支持任务级输出目录覆盖（字段名 `outputDir` / `output_dir` / `输出目录` / `输出根目录`）。

### CSV 批量执行

```bash
node scripts/web-chat-workflow.mjs batch --site kimi --tasks tasks/kimi-tasks.example.csv
```

### Excel 批量执行

```bash
node scripts/web-chat-workflow.mjs batch --site kimi --tasks tasks/kimi-tasks.example.xlsx
```

Excel 的第一张工作表会被读取，列名和 CSV 保持一致。

### 仅校验批量任务文件

```bash
node scripts/web-chat-workflow.mjs validate --tasks tasks/kimi-tasks.example.xlsx
```

这个命令不会打开浏览器，只会检查任务文件是否能被解析，以及每个任务最终会输出到哪里。

如果当前目录下存在 `workflow.config.json`，`validate` 也会按配置文件把每个站点的最终输出路径一并打印出来。

同样地，`validate` 也支持配合 `--site kimi,deepseek` 预览多站点输出路径，不一定非要依赖配置文件。

### Kimi 思考模型

脚本在每次发送提示词前都会检查 Kimi 当前模型；如果还不是思考模型，会优先切到名称里包含 `思考` 的选项。

如果当前页面展示的是更新后的 `K2.6 / K2.5 / Kimi` 一类命名，而没有单独露出“思考”字样，脚本会保留当前可用最佳模型，并在日志里打印实际使用的模型名。

### DeepSeek 专家模式 + 深度思考 + 智能搜索

脚本在每次发送提示词前都会把 DeepSeek 切到 `专家模式`，并确保 `深度思考` 与 `智能搜索` 都处于开启状态。

DeepSeek 当前前端会把 `深度思考` 和 `智能搜索` 存在本地存储中，脚本会在打开页面前先预置这两个开关；如果页面里仍未开启，会再通过界面点击补齐。

由于 `专家模式` 不支持文件上传，如果你后续要接入附件场景，需要再评估是否保留这个强制策略。

### 研究/搜索类功能自动开启

如果站点页面里存在 `探索 / 联网搜索 / 高级搜索 / 研究 / 深度研究 / 思考` 这类能力入口，脚本会在发送提示词前尽量先检查并开启。

当前已经接入这类逻辑的站点包括：

- `DeepSeek`
  会强制确保 `深度思考 + 智能搜索 + 专家模式`。
- `秘塔 AI 搜索`
  会尽量确保 `全网 + 深度研究`。
- `Manus`
  会尽量确保 `Wide Research`。
- `Gemini`
  会优先尝试切到 `思考` 模式；如果当前页面没有可点的思考选项，就保留页面当前模式。
- `Z.ai`
  会检查输入区底部的 `高级搜索` 与 `自动思考`；其中高级搜索需要登录态。如果页面结构变化导致找不到高级搜索开关，脚本会直接失败，避免误以为已经开启。
- `文心一言`
  会尝试保持 `思考·自动`。
- `豆包`
  会尝试切到 `思考` 模式。
- `腾讯元宝`
  会优先确保 `深度思考` 开启，并尝试在输入区 `工具` 菜单中找到并开启 `联网搜索`。

### 新增站点的免费高级功能策略

- `Z.ai`
  默认优先使用 `GLM-5.1`；如果遇到高峰提示，会自动尝试切到 `GLM-5-Turbo`。普通聊天可免登录，但当前脚本因为要强制开启高级搜索，所以仍建议先保存登录态。
- `Qwen Studio`
  默认优先走 `Qwen3.6-Plus`，并尽量把思考选择器切到 `思考 / Thinking / 自动`；站点支持更丰富的多模态与生成能力，但未登录场景会频繁弹登录提示，必要时建议在配置里关闭。
- `豆包`
  首页可见 `快速 / 思考 / PPT 生成 / 图像生成 / 帮我写作 / 翻译 / 编程` 等入口；当前脚本会优先切到 `思考`，但站点对自动化访问更敏感，必要时建议在配置里关闭。
- `秘塔 AI 搜索`
  首页可见 `全网 / 互动网页 / 简洁 / 深入 / 深度研究`；当前脚本会优先确保 `全网 + 深度研究`，但结果页容易要求登录继续，必要时建议在配置里关闭。
- `文心一言`
  首页可见 `思考·自动 / 创意写作 / 阅读分析 / 网页工坊 / 智能翻译` 等能力；当前弹窗和提交流程还不够稳定，必要时建议在配置里关闭。
- `腾讯元宝`
  官方站点是 `https://yuanbao.tencent.com/`，聊天页会展示 DeepSeek 相关入口；脚本会优先确保 `深度思考 + 联网搜索`（联网搜索入口位于 `工具` 菜单）；当前更适合作为登录态站点使用。
- `Manus`
  官方站点是 `https://manus.im/`，首页可见输入区与 `Wide Research` 等能力；实测首页可免登录输入，但提交任务会跳转登录页，建议先 `setup:manus`。
- `Grok`
  官方站点是 `https://grok.com/`；当前自动化访问容易命中 Cloudflare 安全验证。
- `ChatGPT`
  官方站点是 `https://chatgpt.com/`；按免登录站点处理，但浏览器自动化场景下仍可能遇到额外安全页。
- `Gemini`
  官方站点是 `https://gemini.google.com/`；首页可见输入区与不同模式入口，当前脚本会优先尝试切到 `思考` 模式，按免登录站点处理。
- `Perplexity`
  官方站点是 `https://www.perplexity.ai/`；按免登录站点处理，但自动化访问容易命中 Cloudflare 安全验证。

### 当前稳定性

- `Kimi`
  已长期可用，默认启用。
- `DeepSeek`
  已长期可用，默认启用。
- `Z.ai`
  已接入；普通聊天可免登录，但由于现在要求提问前开启高级搜索，建议先 `setup:zai`。
- `Qwen Studio`
  已接入，但未登录时容易弹登录引导。
- `豆包`
  已接入，但未登录发送行为仍不稳定。
- `秘塔 AI 搜索`
  已接入，但研究结果页容易要求登录继续。
- `文心一言`
  已接入，但未登录发送/回包链路仍不稳定。
- `腾讯元宝`
  已接入，建议先 `setup:yuanbao`。
- `Manus`
  已接入；首页可输入，但提交任务会跳转登录页，建议先 `setup:manus`。
- `Grok`
  已接入，但当前更容易被安全验证拦截；示例配置里默认关闭，建议先单独 `setup:grok`。
- `ChatGPT`
  已接入，按免登录站点处理，但当前仍可能被安全验证拦截。
- `Gemini`
  已接入，按免登录站点处理。
- `Perplexity`
  已接入，按免登录站点处理，但当前更容易被安全验证拦截；示例配置里默认关闭。

### 给输出文件自动加时间戳

```bash
npm run ask:kimi -- --prompt "请介绍一下中国历史" --output-file 中国历史.md --timestamp-output
```

输出会变成类似 `output/kimi/中国历史-20260417-183000.md`（如果 `outputDir` 配置为默认值 `output`）。

也可以在输出路径里显式写 `{timestamp}`：

```bash
npm run ask:kimi -- --prompt "请介绍一下中国历史" --output-file {timestamp}-中国历史.md
```

输出路径中的 `{site}` 由脚本固定拼接，不需要在参数里手写。

### 失败自动重试

默认每个任务失败后会额外重试 1 次。你可以通过 `--retries` 调整：

```bash
npm run batch:kimi -- --retries 2
```

也可以在单个任务里配置 `retries` 字段覆盖全局设置。

针对 `DeepSeek`，脚本额外启用了一个保护：如果抓取结果与本次 `prompt` 完全一致（常见于页面偶发选错节点），会自动判定为失败并走重试流程，不会直接写入错误内容到输出文档。

## 批量任务文件格式

支持 JSON、CSV、XLSX、XLS。建议优先使用 JSON（可读性最好，适合版本管理）。

可参考示例文件：

- [tasks/kimi-tasks.example.json](tasks/kimi-tasks.example.json)
- [tasks/deepseek-tasks.example.json](tasks/deepseek-tasks.example.json)
- [tasks/multi-site-tasks.example.json](tasks/multi-site-tasks.example.json)

### package.json 批量命令逻辑（重要）

`npm run batch:*` 本质是对 `node scripts/web-chat-workflow.mjs batch ...` 的封装。

当前 `package.json` 的默认映射关系如下：

- `batch:kimi` -> `--site kimi --tasks tasks/kimi-tasks.example.json`
- `batch:deepseek` -> `--site deepseek --tasks tasks/deepseek-tasks.example.json`
- `batch:zai` / `batch:qwen` / `batch:doubao` / `batch:metaso` / `batch:yiyan` / `batch:yuanbao` / `batch:manus` / `batch:grok` / `batch:chatgpt` / `batch:gemini` / `batch:perplexity` -> `--tasks tasks/multi-site-tasks.example.json`
- `batch:all` -> `--config workflow.config.json --tasks tasks/multi-site-tasks.example.json`

这意味着：

- 示例任务文件路径是 npm 脚本的默认参数，不是批量核心逻辑写死。
- 批量核心逻辑只要求提供 `--tasks`；你传什么文件就读取什么文件。

### 如何自定义任务配置文件

推荐把你自己的任务文件放在 `tasks/` 目录，例如 `tasks/my-kimi-tasks.json`、`tasks/my-multi-site-tasks.json`。

方式 1：临时覆盖（推荐）

```bash
npm run batch:kimi -- --tasks tasks/my-kimi-tasks.json
npm run batch:all -- --tasks tasks/my-multi-site-tasks.json
```

方式 2：长期固定（修改 package.json）

把对应脚本里的 `--tasks tasks/*.example.json` 改成你自己的文件路径。

方式 3：绕过 npm 脚本，直接调用主脚本

```bash
node scripts/web-chat-workflow.mjs batch --site kimi --tasks tasks/my-kimi-tasks.json
node scripts/web-chat-workflow.mjs batch --config workflow.config.json --tasks tasks/my-multi-site-tasks.json
```

自定义后建议先做一次静态校验：

```bash
node scripts/web-chat-workflow.mjs validate --tasks tasks/my-kimi-tasks.json
```

### 最小可用模板（JSON）

每个任务必须有 `outputFile` 与 `prompt`；`outputFile` 只能写文件名，不包含路径。`promptFile` 为可选，存在时会把文件内容追加在 `prompt` 后面。

```json
{
  "tasks": [
    {
      "prompt": "请给出一个 7 天学习计划",
      "outputFile": "7day-plan.md"
    }
  ]
}
```

### 完整示例（JSON）

```json
{
  "tasks": [
    {
      "name": "贪吃蛇落地方案",
      "prompt": "我想做一个贪吃蛇游戏，请给出具体落地方案",
      "outputFile": "snake-plan.md",
      "retries": 1,
      "timestamp": false
    },
    {
      "name": "中国历史介绍",
      "prompt": "请基于补充材料介绍中国历史，并给出分阶段脉络",
      "promptFile": "prompts/介绍中国历史.md",
      "outputFile": "中国历史.md",
      "outputDir": "output/archive",
      "retries": 2,
      "timestamp": true
    }
  ]
}
```

### CSV / Excel 模板

CSV 和 Excel 使用同样列名（Excel 默认读取第一张工作表）：

```csv
name,prompt,promptFile,outputFile,outputDir,retries,timestamp
贪吃蛇落地方案,"我想做一个贪吃蛇游戏，请给出具体落地方案",,snake-plan.md,,1,false
中国历史介绍,"请基于补充材料介绍中国历史，并给出分阶段脉络",prompts/介绍中国历史.md,中国历史.md,output/archive,2,true
```

### 字段说明

- `name`：任务名称，仅用于日志展示，可选。兼容 `title` / `taskname` / `任务名` / `名称`
- `prompt`：直接写提示词，必填。兼容 `question` / `message` / `text` / `提示词` / `问题` / `提问内容`
- `outputFile`：回答输出文件名，必填，不能包含路径。兼容 `output_file` / `file` / `output` / `outfile` / `outputpath` / `输出文件名` / `输出文件` / `输出`
- `outputDir`：任务级输出目录，可选。兼容 `output_dir` / `输出目录` / `输出根目录`
- `promptFile`：从本地 Markdown/TXT 文件读取补充提示词，可选；有值时会把文件内容追加到 `prompt` 后。兼容 `prompt_file` / `promptpath` / `prompt_path` / `提示词文件` / `提示词路径`
- `retries`：失败后额外重试次数，可选。兼容 `retry` / `重试次数` / `重试`
- `timestamp`：是否给当前任务输出文件名加时间戳，可选。兼容 `timestampOutput` / `timestamp_output` / `时间戳` / `加时间戳`

### 路径解析规则

- 最终路径固定为：`outputDir/{site}/outputFile`。
- `outputDir` 优先级：任务级 `outputDir` > 命令行 `--output-dir` > `workflow.config.json`。
- 如果都没有配置 `outputDir`，默认使用项目根目录 `output`。
- `outputFile` 只能是文件名，不能包含 `/` 或 `\`。

### 常见错误

- 漏填 `prompt`：任务校验会直接失败（`prompt` 为必填）。
- `promptFile` 路径写错：文件不存在或编码异常导致读取失败。
- `outputFile` 写成路径（如 `kimi/a.md`）：任务校验会失败。
- 把 `retries` 写成非数字：重试逻辑不会按预期工作。

可先用下面命令做静态校验，再正式执行：

```bash
node scripts/web-chat-workflow.mjs validate --tasks tasks/kimi-tasks.example.xlsx
```

## 目录结构

```text
automation/
  sites/
    chatgpt.mjs
    deepseek.mjs
    doubao.mjs
    gemini.mjs
    grok.mjs
    kimi.mjs
    manus.mjs
    metaso.mjs
    perplexity.mjs
    qwen.mjs
    shared/
      simple-chat.mjs
    yuanbao.mjs
    yiyan.mjs
    zai.mjs
tasks/
  deepseek-tasks.example.json
  kimi-tasks.example.json
  multi-site-tasks.example.json
scripts/
  web-chat-workflow.mjs
.auth/
output/
workflow.config.json
```

## 失败处理

如果脚本执行中失败，会自动把现场截图、页面 HTML 和元数据保存到 `output/playwright/`，方便回看页面状态。

典型调试文件包括：

- `*.png`：失败时的页面截图
- `*.html`：失败时的页面 DOM 快照
- `*.json`：失败任务、尝试次数、URL、标题等元数据

## 登录故障排查

### Google 登录提示“无法登录 / 此浏览器或应用可能不安全”

如果你在 `Perplexity / Gemini / ChatGPT` 等站点里主动选择 Google 登录，可能会看到 Google 的错误页：

```text
无法登录
此浏览器或应用可能不安全
```

这是 Google 对 OAuth 登录环境的安全拦截，常见于自动化浏览器、嵌入式浏览器或被远程控制的浏览器环境。这个问题通常不是账号密码错误，也不是站点适配器本身失效。

建议按下面顺序处理：

- 优先使用站点提供的邮箱验证码、Magic Link、手机号、Apple、微信、QQ 等非 Google 登录方式。
- 如果必须用 Google 登录，当前脚本的 Playwright 浏览器上下文不一定能通过 Google OAuth；普通 Chrome 登录也不会自动同步到 `.auth/*.json`。这种场景需要后续改成复用真实 Chrome 用户目录或手动导入 Cookie。
- 对 `Perplexity / Grok / ChatGPT` 这类容易触发安全验证的站点，先单独运行对应的 `setup:*`，不要直接放进 `ask:all / batch:all`。
- 如果某个站点在你的网络环境里反复触发验证，可以在 [workflow.config.json](workflow.config.json) 中把它暂时设为 `"enabled": false`。

## 常见问题速查

### 1) 任务成功了，但找不到输出文件

- 先看 `workflow.config.json` 里的 `outputDir` 是否指向了其他目录（当前仓库示例是绝对路径）。
- 如果命令里同时传了 `--output-dir`，以命令参数为准。
- 实际写入目录固定是 `outputDir/{site}/`，文件名来自 `--output-file` 或任务里的 `outputFile`。

### 2) 多站点执行时，只有部分站点成功

- 这通常是登录态、风控校验、页面结构变更导致的站点级失败。
- 建议先单独运行对应站点的 `setup:<site>` 和 `ask:<site>`，确认单站点稳定后再放回 `ask:all` / `batch:all`。

### 3) `setup` 之后依然提示未登录

- 检查 `.auth/<site>.json` 是否生成。
- 某些站点存在多步验证，完成验证后请等待页面真正回到可聊天状态再结束 setup。
- 如站点被风控拦截，建议先在配置中临时关闭该站点，确保主流程可用。

## 扩展方式

如果你想接入新的网页聊天工具，可以继续沿用这套分层：

- `scripts/web-chat-workflow.mjs`
  负责命令解析、批量执行、文件写入、错误处理
- `automation/sites/*.mjs`
  负责站点 URL、输入框选择器、回答提取逻辑、等待策略

新站点至少需要定义这些能力：

- 如何打开“新对话”页面
- 如何判断页面已经登录且可提问
- 如何输入提示词并发送
- 如何判断回答已经生成完成
- 如何把页面回答转换成 Markdown

## 当前限制

- 首次登录仍然需要你手动完成，这是为了兼容验证码和扫码登录
- 网页结构如果发生大改，站点适配文件可能需要更新
- 当前默认使用本机 `chrome` 渠道启动浏览器；如果你没装 Chrome，可以加 `--channel msedge`
