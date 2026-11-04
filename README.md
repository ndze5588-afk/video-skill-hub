# Skill 剪辑台

按制作流程整理的 AI 视频 Agent Skills 目录。网站和 Claude Code 插件市场共用同一份数据：`data/skills.json`。

## 目录结构

```
data/skills.json               唯一的数据源：环节、skill、工作流
index.html                     页面（片段格式，可直接发布为 Claude Artifact）
app.js                         渲染、筛选、复制命令
scripts/build.mjs              生成 dist/（可部署的静态站）和 .claude-plugin/marketplace.json
scripts/refresh.mjs            从 GitHub 拉取最新星数、许可证、更新日期
scripts/check-install.mjs      对照上游仓库核对每条安装命令（只读取，不下载、不运行）
.github/workflows/refresh.yml  每周一自动刷新数据并提交
```

## 本地预览

```bash
node scripts/build.mjs
python3 -m http.server 8000 -d dist
```

然后打开 http://localhost:8000 。不要直接双击 HTML 文件，浏览器会拦截读取 JSON。

## 部署

1. 把 `data/skills.json` 里的 `hub.repo` 改成你的 `用户名/video-skill-hub`
2. 推到 GitHub，运行一次 `node scripts/build.mjs`，提交生成的 `.claude-plugin/marketplace.json`
3. 用 Vercel、Netlify 或 GitHub Pages 托管 `dist/` 目录

部署后，别人就能在 Claude Code 里运行：

```
/plugin marketplace add 用户名/video-skill-hub
/plugin install remotion@video-skill-hub
```

## 收录一个新 skill

在 `data/skills.json` 的 `skills` 里加一条：

| 字段 | 说明 |
| --- | --- |
| `id` | 唯一短名，工作流里用它引用 |
| `stage` | `plan` / `generate` / `voice` / `compose` / `edit` / `caption` / `pipeline` |
| `official` | 是否由工具或平台本身的团队维护 |
| `apiKey` | `null` 表示不需要；`"unknown"` 表示未核实；否则写服务名 |
| `keyNote` | 可选。部分功能才需要 key 时写在这里，比如「生成封面需要 Gemini」 |
| `cn` | 是否支持国产视频模型（可灵、即梦、海螺、通义万相等）或剪映 |
| `local` | 需要本地安装的软件 |
| `install` | 安装命令，可以有多种方式 |
| `plugin` | 仅当上游仓库带 `.claude-plugin/plugin.json` 时填写，会进入插件市场 |

星数、许可证、更新日期可以先随便填，运行 `node scripts/refresh.mjs` 会自动更新。

## 收录标准

- 仓库公开，含 `SKILL.md`
- 跟视频制作直接相关
- 上架前人工读过 SKILL.md 和附带脚本
