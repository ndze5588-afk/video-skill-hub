// Builds the deployable site into dist/ and regenerates the Claude Code plugin marketplace.
// Usage: node scripts/build.mjs
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(await readFile(join(root, "data/skills.json"), "utf8"));

// index.html is written as a page fragment (head tags + body content) so the same file can be
// published as a Claude Artifact; wrap it in a full document for normal static hosting.
const fragment = await readFile(join(root, "index.html"), "utf8");
const page = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
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

// Only skills whose upstream repo ships .claude-plugin/plugin.json can be listed here.
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
await mkdir(join(root, ".claude-plugin"), { recursive: true });
await writeFile(join(root, ".claude-plugin/marketplace.json"), JSON.stringify(marketplace, null, 2) + "\n");

console.log(`dist/ built with ${data.skills.length} skills; marketplace lists ${marketplace.plugins.length} plugins.`);
