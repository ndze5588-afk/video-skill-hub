// Works out how each skill installs from this repo's Claude Code plugin marketplace, and stores it as s.market.
// Reads every upstream repo with git (a blobless, depth-1 clone), so it needs no GitHub token.
// Usage: node scripts/sync-market.mjs [skill-id ...]   (ids limit the run to those skills)
//
// For each skill, in order:
//   noMarket set                 -> not listed (the reason shows on the site)
//   plugin from another repo     -> that plugin repo, as its authors packaged it
//   one matching skill           -> just that folder (git-subdir), so a big collection doesn't install everything
//   invalid upstream plugin.json -> the skill folders only, without that manifest
//   otherwise                    -> the whole repo, listing any matching skill folder Claude Code wouldn't find by itself
// A matching skill is a SKILL.md whose frontmatter name, or folder name, is in s.includes.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const file = join(root, "data/skills.json");
const data = JSON.parse(await readFile(file, "utf8"));
const cache = process.env.SKILL_TREES || join(tmpdir(), "video-skill-hub-trees");
await mkdir(cache, { recursive: true });

const git = (...args) => execFileSync("git", ["-c", "gc.auto=0", ...args], { encoding: "utf8", maxBuffer: 64 << 20 });

function tree(repo) {
  const dir = join(cache, repo.replace("/", "__"));
  if (existsSync(dir)) git("-C", dir, "fetch", "-q", "--depth", "1", "--filter=blob:none", "origin", "HEAD");
  else git("clone", "-q", "--filter=blob:none", "--no-checkout", "--depth", "1", `https://github.com/${repo}`, dir);
  const ref = existsSync(join(dir, ".git/FETCH_HEAD")) ? "FETCH_HEAD" : "HEAD";
  const files = git("-C", dir, "ls-tree", "-r", "--name-only", ref).split("\n").filter(Boolean);
  const skills = files
    .filter((f) => f === "SKILL.md" || f.endsWith("/SKILL.md"))
    .map((path) => {
      const text = git("-C", dir, "show", `${ref}:${path}`);
      const name = text.match(/^name:\s*["']?([^"'\n]+)/m)?.[1].trim();
      return { path, dir: path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "", name };
    });
  return { files, skills, read: (path) => git("-C", dir, "show", `${ref}:${path}`) };
}

// The checks Claude Code most often fails upstream manifests on. Returns a reason, or "" when none applies.
function manifestProblem(text) {
  let m;
  try {
    m = JSON.parse(text);
  } catch {
    return "not valid JSON";
  }
  if (m.author !== undefined && (typeof m.author !== "object" || !m.author?.name)) return "author must be an object with a name";
  for (const key of ["skills", "agents", "commands", "outputStyles"]) {
    const paths = typeof m[key] === "string" ? [m[key]] : Array.isArray(m[key]) ? m[key] : [];
    const bad = paths.find((p) => typeof p === "string" && !p.startsWith("./") && !(key === "skills" && p === "."));
    if (bad) return `${key} path "${bad}" must start with ./`;
  }
  return "";
}

const only = new Set(process.argv.slice(2));
let listed = 0;
for (const s of data.skills.filter((s) => !only.size || only.has(s.id))) {
  const name = s.plugin?.name || s.marketName || s.id;
  if (s.noMarket) {
    delete s.market;
    continue;
  }
  // A plugin published from a different repo than the skills is taken as its authors packaged it.
  if (s.plugin && s.plugin.repo !== s.repo) {
    s.market = { name, source: { source: "github", repo: s.plugin.repo } };
    listed++;
    continue;
  }
  let t;
  try {
    t = tree(s.repo);
  } catch (err) {
    console.warn(`✗ ${s.id}: could not read ${s.repo}, keeping the previous entry`);
    continue;
  }
  const wanted = new Set(s.includes);
  // Some repos mirror a skill into .claude/skills or .agents/skills; keep one copy, preferring skills/.
  const inDefault = (k) => /^skills\/[^/]+$/.test(k.dir);
  const hits = [];
  for (const k of t.skills.filter((k) => wanted.has(k.name) || wanted.has(k.dir.split("/").pop()))) {
    const key = k.name || k.dir.split("/").pop();
    const i = hits.findIndex((h) => (h.name || h.dir.split("/").pop()) === key);
    if (i < 0) hits.push(k);
    else if (inDefault(k) && !inDefault(hits[i])) hits[i] = k;
  }
  if (!hits.length) {
    console.warn(`✗ ${s.id}: no SKILL.md in ${s.repo} matches includes (${s.includes.join(", ")}); not listed`);
    delete s.market;
    continue;
  }
  const rootManifest = t.files.includes(".claude-plugin/plugin.json");
  const brokenManifest = rootManifest && manifestProblem(t.read(".claude-plugin/plugin.json"));
  if (brokenManifest) console.warn(`! ${s.id}: upstream plugin.json is invalid (${brokenManifest}); installing the skill folders only`);
  const parents = [...new Set(hits.map((k) => k.dir.slice(0, k.dir.lastIndexOf("/"))))];
  // A skill marked as an upstream plugin keeps its whole package (it may bring MCP servers, hooks or scripts).
  if (hits.length === 1 && ((t.skills.length > 1 && !s.plugin) || brokenManifest) && hits[0].dir) {
    s.market = { name, source: { source: "git-subdir", url: s.repo, path: hits[0].dir } };
  } else if (brokenManifest && parents.length === 1 && parents[0]) {
    // All the wanted skills sit side by side, e.g. skills/a, skills/b: take that folder without the bad manifest.
    s.market = { name, source: { source: "git-subdir", url: s.repo, path: parents[0] }, skills: ["./"] };
  } else if (brokenManifest) {
    console.warn(`✗ ${s.id}: cannot work around the invalid plugin.json; not listed`);
    delete s.market;
    continue;
  } else {
    // Claude Code always scans skills/, loads a lone root SKILL.md when there is no skills/, and loads
    // whatever the repo's own plugin.json lists. Anything else has to be listed in the entry, which
    // Claude Code adds to the manifest (strict mode left at its default).
    const hasSkillsDir = t.files.some((f) => f.startsWith("skills/"));
    const declared = rootManifest ? [JSON.parse(t.read(".claude-plugin/plugin.json")).skills ?? []].flat().map((p) => p.replace(/^\.\/?/, "").replace(/\/$/, "")) : [];
    const covered = (k) =>
      inDefault(k) || (k.dir === "" && !hasSkillsDir) || declared.some((d) => d === k.dir || d === k.dir.slice(0, k.dir.lastIndexOf("/")));
    const extra = hits.filter((k) => !covered(k));
    s.market = { name, source: { source: "github", repo: s.repo } };
    if (extra.length) s.market.skills = extra.map((k) => (k.dir ? `./${k.dir}` : "./"));
  }
  listed++;
}

await writeFile(file, JSON.stringify(data, null, 2) + "\n");
console.log(`${listed} skill(s) listed in the marketplace.`);
