# Skill 剪辑台

**用 AI 做视频，从这里挑工具：按制作步骤整理的 AI 视频 skill。**

网站：https://video-skill-hub.pages.dev

Skill 剪辑台按视频的制作环节（策划脚本 → 素材生成 → 配音音频 → 合成动画 → 剪辑处理 → 字幕本地化）整理 Claude Code、Cursor、Codex 等 agent 能用的视频 skill。每一条都写明：

- 要不要 API key，哪些功能才需要
- 本地要装什么软件
- 开源许可证，能不能商用
- 可以直接复制的安装命令（每周对照上游仓库自动核对）

特别收录了支持**国产视频模型**（可灵、即梦 Seedance、海螺 MiniMax、通义万相）和**剪映**的 skill，并提供几套串好的工作流模板。

## 在 Claude Code 里安装

本仓库同时是一个 Claude Code 插件市场。在终端运行：

```bash
claude plugin marketplace add ndze5588-afk/video-skill-hub
claude plugin install seedance-studio@video-skill-hub   # 换成网站卡片上的名字
```

也可以在 Claude Code 里输入 `/plugin` 浏览全部。网站每张卡片最上面就是这两行命令，复制即可。

以前添加过 `ndze5588-afk/video-skill-hub-plugins` 的话，直接运行上面第一行，市场会自动改指向本仓库，已装的插件不受影响。

Cursor、Codex 等其他 agent 用卡片里「其他安装方式」的命令（多为 `npx skills add`）。

## 仓库结构

```
data/skills.json               唯一的数据源：环节、skill、工作流
index.html                     页面（片段格式，可直接发布为 Claude Artifact）
app.js                         渲染、筛选、复制命令
.claude-plugin/marketplace.json  插件市场，由 build.mjs 生成，不要手改
functions/api/views.js         访客数接口（Cloudflare Pages Functions + D1）
scripts/build.mjs              生成 dist/（网站）和 .claude-plugin/marketplace.json
scripts/sync-market.mjs        读取每个上游仓库，算出各 skill 在插件市场里怎么装（写入 skills.json 的 market 字段）
scripts/refresh.mjs            从 GitHub 拉取最新星数、许可证、更新日期
scripts/check-install.mjs      对照上游仓库核对每条安装命令（只读取，不下载、不运行）
.github/workflows/refresh.yml  每周一自动刷新数据、核对命令、同步插件市场并提交
.github/workflows/market.yml   main 上的 skills.json 一有改动就同步插件市场
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

### 访客数

首页的「已有 N 位访客」由 `functions/api/views.js`（Cloudflare Pages Functions）计数，存在 D1 数据库里。同一个 IP 只算一位访客；数据库里只存 IP 加随机盐后的 SHA-256 哈希，不存原始 IP。第一次部署后要绑定一次数据库：

1. Cloudflare 后台 → Storage & Databases → D1 → Create，名字随意（如 `video-skill-hub`）
2. Workers & Pages → 本项目 → Settings → Bindings → Add → D1 database，变量名填 `DB`，选上一步的数据库
3. 重新部署一次（Deployments → 最新一次 → Retry deployment）

数据表会在第一次访问时自动建好。没绑定时计数接口返回 503，页面会隐藏这一行。

## 插件市场

`.claude-plugin/marketplace.json` 由 `data/skills.json` 生成，每个 skill 对应一个插件，名字是 `market.name`。`scripts/sync-market.mjs` 用 git 读取上游仓库（不需要 token），按下面的顺序决定怎么装：

1. 写了 `noMarket`：不放进市场，网站上显示原因
2. `plugin` 指向另一个仓库：直接用上游打包好的插件
3. 只有一个 skill 匹配、而仓库里还有别的 skill：只装那一个文件夹（`git-subdir`），不把整个合集装进来
4. 上游 `plugin.json` 不合法：只装 skill 文件夹，绕开那份 manifest
5. 其余：装整个仓库，Claude Code 自己找不到的 skill 文件夹写进条目的 `skills`

改完数据后本地运行：

```bash
node scripts/sync-market.mjs [skill-id ...]
node scripts/build.mjs
claude plugin validate .
```

忘了也没关系，推到 main 后 `market.yml` 会自动同步并提交。

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
| `plugin` | 上游已打包成插件时填写（`repo`、`name`），市场会原样使用 |
| `marketName` | 可选。插件名默认是 `id`；以 `claude-` 开头等保留名要换一个 |
| `noMarket` | 可选。不能装成插件的原因，比如要在 skill 目录里跑安装脚本 |
| `market` | 自动生成，不要手改 |

星数、许可证、更新日期可以先随便填，运行 `node scripts/refresh.mjs` 会自动更新；再运行 `node scripts/check-install.mjs` 确认安装命令无误。

如果 SKILL.md 里写死了 `~/.claude/skills/...` 路径，或者装好后要在 skill 目录里运行安装命令，装成插件会出问题，请填 `noMarket`。

收录标准：仓库公开、含 `SKILL.md`、跟视频制作直接相关、上架前人工读过 SKILL.md 和附带脚本。

## 授权

数据与文案采用 CC BY-NC 4.0（转载请注明出处，禁止商用）；源代码保留所有权利。详见 [LICENSE](LICENSE)。
