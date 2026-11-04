// Refreshes stars, license and last-push date for every skill from the GitHub API.
// Usage: GITHUB_TOKEN=xxx node scripts/refresh.mjs   (the token is optional but lifts the 60 requests/hour limit)
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const file = join(dirname(fileURLToPath(import.meta.url)), "../data/skills.json");
const data = JSON.parse(await readFile(file, "utf8"));
const headers = { Accept: "application/vnd.github+json" };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

for (const s of data.skills) {
  const res = await fetch(`https://api.github.com/repos/${s.repo}`, { headers });
  if (!res.ok) {
    console.warn(`skip ${s.repo}: HTTP ${res.status}`);
    continue;
  }
  const repo = await res.json();
  // GitHub follows renames; keep the canonical name so links don't depend on redirects.
  if (repo.full_name !== s.repo) console.warn(`${s.repo} moved to ${repo.full_name}`);
  s.repo = repo.full_name;
  s.stars = repo.stargazers_count;
  s.updated = repo.pushed_at.slice(0, 10);
  const spdx = repo.license?.spdx_id;
  if (spdx && spdx !== "NOASSERTION") s.license = spdx;
}

data.checkedAt = new Date().toISOString().slice(0, 10);
await writeFile(file, JSON.stringify(data, null, 2) + "\n");
console.log(`Refreshed ${data.skills.length} skills.`);
