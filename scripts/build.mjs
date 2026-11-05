// Builds the deployable site into dist/ and the public plugin marketplace into dist-marketplace/.
// Usage: node scripts/build.mjs
import { readFile, writeFile, mkdir, copyFile, cp } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(await readFile(join(root, "data/skills.json"), "utf8"));

// index.html is written as a page fragment (head tags + body content) so the same file can be
// published as a Claude Artifact; wrap it in a full document for normal static hosting.
const appJs = await readFile(join(root, "app.js"), "utf8");
// Version the script URL by content so browsers pick up a new app.js after each deploy.
const appVersion = createHash("sha256").update(appJs).digest("hex").slice(0, 8);
const fragment = (await readFile(join(root, "index.html"), "utf8")).replace(
  '<script src="app.js"></script>',
  `<script src="app.js?v=${appVersion}"></script>`
);
const site = data.hub.site || "https://claude.ai/artifact/CfNyZ33MiZLQaXryzgZYZ1";
const page = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="canonical" href="${site}/">
<meta property="og:url" content="${site}/">
</head>
<body>
${fragment}
</body>
</html>
`;

await mkdir(join(root, "dist/data"), { recursive: true });
await writeFile(join(root, "dist/index.html"), page);
await copyFile(join(root, "app.js"), join(root, "dist/app.js"));
await copyFile(join(root, "data/skills.json"), join(root, "dist/data/skills.json"));
// Real files for crawlers; without them Cloudflare Pages answers these paths with the homepage.
await cp(join(root, "public"), join(root, "dist"), { recursive: true });
await writeFile(join(root, "dist/robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml\n`);
await writeFile(
  join(root, "dist/sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${site}/</loc><lastmod>${data.installCheckedAt || data.checkedAt}</lastmod></url>\n</urlset>\n`
);

// The marketplace lives in its own public repo (hub.repo) so this repo can stay private.
// Only skills whose upstream repo ships .claude-plugin/plugin.json can be listed there.
const [owner] = data.hub.repo.split("/");
const marketplace = {
  name: data.hub.name,
  owner: { name: owner },
  metadata: { description: "按制作流程整理的 AI 视频 Agent Skills" },
  plugins: data.skills
    .filter((s) => s.plugin)
    .map((s) => ({
      name: s.plugin.name,
      source: { source: "github", repo: s.plugin.repo },
      description: s.summary,
      category: s.stage,
    })),
};
const marketReadme = `# Skill 剪辑台 · 插件市场

[Skill 剪辑台](${site}) 的 Claude Code 插件市场：按制作流程整理的 AI 视频 skill 中，已打包成插件的那些。

\`\`\`
/plugin marketplace add ${data.hub.repo}
${marketplace.plugins.map((p) => `/plugin install ${p.name}@${data.hub.name}`).join("\n")}
\`\`\`

| 插件 | 来源 | 说明 |
| --- | --- | --- |
${marketplace.plugins.map((p) => `| \`${p.name}\` | [${p.source.repo}](https://github.com/${p.source.repo}) | ${p.description} |`).join("\n")}

全部 ${data.skills.length} 个视频 skill（含未打包成插件的）、依赖和 API key 说明见 ${site} 。

本仓库由 Skill 剪辑台自动生成。插件归各自作者所有，适用其仓库中的许可证；本仓库中的整理内容采用 [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/deed.zh-hans)，转载请注明出处。
`;
const marketDir = join(root, "dist-marketplace");
await mkdir(join(marketDir, ".claude-plugin"), { recursive: true });
await writeFile(join(marketDir, ".claude-plugin/marketplace.json"), JSON.stringify(marketplace, null, 2) + "\n");
await writeFile(join(marketDir, "README.md"), marketReadme);

console.log(`dist/ built with ${data.skills.length} skills; dist-marketplace/ lists ${marketplace.plugins.length} plugins.`);
