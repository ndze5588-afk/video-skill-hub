# Skill 剪辑台

**把散落各处的 AI 视频 skill，排成一条时间线。**

Skill 剪辑台按视频的制作环节（策划脚本 → 素材生成 → 配音音频 → 合成动画 → 剪辑处理 → 字幕本地化）整理 Claude Code、Cursor、Codex 等 agent 能用的视频 skill。每一条都写明：

- 要不要 API key，哪些功能才需要
- 本地要装什么软件
- 开源许可证，能不能商用
- 可以直接复制的安装命令（每周对照上游仓库自动核对）

特别收录了支持**国产视频模型**（可灵、即梦 Seedance、海螺 MiniMax、通义万相）和**剪映**的 skill，并提供几套串好的工作流模板。

## 仓库结构

```
data/skills.json               唯一的数据源：环节、skill、工作流
index.html                     页面（片段格式，可直接发布为 Claude Artifact）
app.js                         渲染、筛选、复制命令
scripts/build.mjs              生成 dist/（网站）和 dist-marketplace/（公开的插件市场）
scripts/refresh.mjs            从 GitHub 拉取最新星数、许可证、更新日期
scripts/check-install.mjs      对照上游仓库核对每条安装命令（只读取，不下载、不运行）
scripts/publish-marketplace.sh 把 dist-marketplace/ 推送到公开的插件市场仓库
.github/workflows/refresh.yml  每周一自动刷新数据、核对命令并提交
```

## 本地预览

```bash
node scripts/build.mjs
python3 -m http.server 8000 -d dist
```

然后打开 http://localhost:8000 。不要直接双击 HTML 文件，浏览器会拦截读取 JSON。

## 部署

网站托管在 Cloudflare Pages，绑定本仓库，推送后自动构建：

| 设置 | 值 |
| --- | --- |
| Framework preset | None |
| Build command | `node scripts/build.mjs` |
| Build output directory | `dist` |
| 环境变量 | `NODE_VERSION` = `20` |

自定义域名在 Pages 项目的 Custom domains 里添加。

## 插件市场

本仓库是私有的。Claude Code 用户添加插件市场时需要访问公开仓库，所以插件市场单独放在 `data/skills.json` 里 `hub.repo` 指向的公开仓库，只包含生成出来的 `marketplace.json`。

数据有变化时运行：

```bash
node scripts/build.mjs
scripts/publish-marketplace.sh
```

## 收录一个新 skill

在 `data/skills.json` 的 `skills` 里加一条：

| 字段 | 说明 |
| --- | --- |
| `id` | 唯一短名，工作流里用它引用 |
| `stage` | `plan` / `generate` / `voice` / `compose` / `edit` / `caption` / `pipeline` |
| `official` | 是否由工具或平台本身的团队维护 |
| `cn` | 是否支持国产视频模型或剪映 |
| `apiKey` | `null` 表示不需要；`"unknown"` 表示未核实；否则写服务名 |
| `keyNote` | 可选。部分功能才需要 key 时写在这里，比如「生成封面需要 Gemini」 |
| `local` | 需要本地安装的软件 |
| `install` | 安装命令，可以有多种方式 |
| `plugin` | 仅当上游仓库带 `.claude-plugin/plugin.json` 时填写，会进入插件市场 |

星数、许可证、更新日期可以先随便填，运行 `node scripts/refresh.mjs` 会自动更新；再运行 `node scripts/check-install.mjs` 确认安装命令无误。

收录标准：仓库公开、含 `SKILL.md`、跟视频制作直接相关、上架前人工读过 SKILL.md 和附带脚本。

## 授权

数据与文案采用 CC BY-NC 4.0（转载请注明出处，禁止商用）；源代码保留所有权利。详见 [LICENSE](LICENSE)。
