// Checks that every install command in data/skills.json points at something that exists,
// by reading the upstream repos on GitHub. Nothing from those repos is downloaded or run.
// Usage: GITHUB_TOKEN=xxx node scripts/check-install.mjs   (token optional; one API call per repo)
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(await readFile(join(root, "data/skills.json"), "utf8"));
const headers = { Accept: "application/vnd.github+json" };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

const trees = new Map();
async function skillFiles(repo) {
  if (!trees.has(repo)) {
    trees.set(repo, (async () => {
      const res = await fetch(`https://api.github.com/repos/${repo}/git/trees/HEAD?recursive=1`, { headers });
      if (!res.ok) throw new Error(`${repo}: HTTP ${res.status}`);
      const { tree } = await res.json();
      return tree.filter((t) => t.path.endsWith("SKILL.md")).map((t) => t.path);
    })());
  }
  return trees.get(repo);
}
const raw = async (repo, path) => {
  const res = await fetch(`https://raw.githubusercontent.com/${repo}/HEAD/${path}`);
  if (!res.ok) throw new Error(`${repo}/${path}: HTTP ${res.status}`);
  return res.text();
};
const repoOf = (src) => src.replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "");

// The skills CLI matches --skill against the SKILL.md frontmatter name, falling back to its folder.
async function hasSkill(repo, name) {
  for (const path of await skillFiles(repo)) {
    const folder = path.split("/").at(-2);
    if (folder === name) return true;
    const front = (await raw(repo, path)).match(/^---\n([\s\S]*?)\n---/);
    if (front && new RegExp(`^name:\\s*["']?${name}["']?\\s*$`, "m").test(front[1])) return true;
  }
  return false;
}

async function check(cmd) {
  const problems = [];
  const lines = cmd.split("\n");
  let market = null;
  for (const line of lines) {
    let m;
    if ((m = line.match(/^npx skills add (\S+)(.*)$/))) {
      const repo = repoOf(m[1]);
      const files = await skillFiles(repo);
      if (!files.length) problems.push(`${repo} has no SKILL.md`);
      const skill = m[2].match(/--skill\s+'?([^'\s]+)'?/)?.[1];
      if (skill && skill !== "*" && !(await hasSkill(repo, skill))) problems.push(`no skill named ${skill} in ${repo}`);
    } else if ((m = line.match(/^\/plugin marketplace add (\S+)$/))) {
      market = JSON.parse(await raw(m[1], ".claude-plugin/marketplace.json"));
    } else if ((m = line.match(/^\/plugin install ([^@\s]+)@(\S+)$/))) {
      if (!market) problems.push("plugin install without marketplace add");
      else {
        if (market.name !== m[2]) problems.push(`marketplace is named ${market.name}, not ${m[2]}`);
        if (!market.plugins?.some((p) => p.name === m[1])) problems.push(`marketplace has no plugin ${m[1]}`);
      }
    } else if ((m = line.match(/^git clone (https:\/\/github\.com\/\S+)/))) {
      if (!(await skillFiles(repoOf(m[1]))).length) problems.push(`${repoOf(m[1])} has no SKILL.md`);
    }
  }
  return problems;
}

let failed = 0;
for (const s of data.skills) {
  for (const { label, cmd } of s.install) {
    let problems;
    try {
      problems = await check(cmd);
    } catch (err) {
      problems = [err.message];
    }
    if (problems.length) failed++;
    console.log(`${problems.length ? "✗" : "✓"} ${s.id} · ${label}${problems.length ? "\n    " + problems.join("\n    ") : ""}`);
  }
}
if (failed) {
  console.log(`\n${failed} install command(s) need fixing.`);
  process.exit(1);
}
// Record the date so the site can say when the commands were last confirmed.
data.installCheckedAt = new Date().toISOString().slice(0, 10);
await writeFile(join(root, "data/skills.json"), JSON.stringify(data, null, 2) + "\n");
console.log("\nAll install commands check out.");
