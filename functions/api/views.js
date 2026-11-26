// Site visitor counter: one visitor per IP address.
//   POST records the caller's IP (if new) and returns the total; GET returns the total.
// Backed by a Cloudflare D1 database bound to this Pages project as DB; tables are created on first use.
// Raw IPs are never stored: each is kept as a SHA-256 hash with a random salt that lives only in the database.
// Without the binding it answers 503 and the page simply hides the counter.

const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });

async function setup(db) {
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS counters (key TEXT PRIMARY KEY, n INTEGER NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS visitors (ip_hash TEXT PRIMARY KEY, first_seen TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)"),
  ]);
  await db.prepare("INSERT INTO meta (key, value) VALUES ('salt', ?) ON CONFLICT (key) DO NOTHING").bind(crypto.randomUUID()).run();
  return (await db.prepare("SELECT value FROM meta WHERE key = 'salt'").first()).value;
}

async function hash(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const total = async (db) => (await db.prepare("SELECT n FROM counters WHERE key = 'visitors'").first())?.n ?? 0;

export async function onRequest({ request, env }) {
  const db = env.DB;
  if (!db) return reply({ error: "counter not configured" }, 503);
  const salt = await setup(db);

  if (request.method === "POST") {
    const ip = request.headers.get("cf-connecting-ip");
    if (!ip) return reply({ visitors: await total(db) });
    const added = await db
      .prepare("INSERT INTO visitors (ip_hash, first_seen) VALUES (?, ?) ON CONFLICT (ip_hash) DO NOTHING")
      .bind(await hash(`${salt}:${ip}`), new Date().toISOString())
      .run();
    if (added.meta.changes > 0) {
      const row = await db
        .prepare("INSERT INTO counters (key, n) VALUES ('visitors', 1) ON CONFLICT (key) DO UPDATE SET n = n + 1 RETURNING n")
        .first();
      return reply({ visitors: row.n });
    }
    return reply({ visitors: await total(db) });
  }
  if (request.method === "GET") return reply({ visitors: await total(db) });
  return new Response(null, { status: 405, headers: { allow: "GET, POST" } });
}
