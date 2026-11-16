// Builds the deployable site into dist/ and the Claude Code plugin marketplace into .claude-plugin/marketplace.json.
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

// The plugin marketplace lives in this repo at .claude-plugin/marketplace.json, so users add it with
// `claude plugin marketplace add <hub.repo>`. scripts/sync-market.mjs works out each skill's s.market.
const reserved = /^(claude|anthropic|anthropics|cc-plugin)-|^(claude|anthropic|anthropics|claude-code|claude-mods)$/i;
const seen = new Set();
const plugins = data.skills
  .filter((s) => s.market)
  .map((s) => {
    const { name, source, skills } = s.market;
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || reserved.test(name)) throw new Error(`${s.id}: plugin name "${name}" is not allowed`);
    if (seen.has(name)) throw new Error(`${s.id}: plugin name "${name}" is used twice`);
    seen.add(name);
    return {
      name,
      displayName: s.name,
      source,
      description: s.summary,
      category: s.stage,
      homepage: `${site}/#skill-${s.id}`,
      ...(s.license && /^[A-Za-z0-9.+-]+$/.test(s.license) ? { license: s.license } : {}),
      ...(skills ? { skills } : {}),
    };
  });
const marketplace = {
  name: data.hub.name,
  owner: { name: data.hub.repo.split("/")[0], url: site },
  description: "Skill 剪辑台：按制作流程整理的 AI 视频 Agent Skills，支持可灵、即梦、海螺和剪映",
  plugins,
};
await mkdir(join(root, ".claude-plugin"), { recursive: true });
await writeFile(join(root, ".claude-plugin/marketplace.json"), JSON.stringify(marketplace, null, 2) + "\n");

console.log(`dist/ built with ${data.skills.length} skills; .claude-plugin/marketplace.json lists ${plugins.length} plugins.`);
