// Site-wide view counter: POST counts a visit and returns the new total, GET returns the total.
// Backed by a Cloudflare D1 database bound to this Pages project as DB; the table is created on first use.
// Without the binding it answers 503 and the page simply hides the counter.

const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });

export async function onRequest({ request, env }) {
  if (!env.DB) return reply({ error: "counter not configured" }, 503);
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS counters (key TEXT PRIMARY KEY, n INTEGER NOT NULL)").run();

  if (request.method === "POST") {
    const row = await env.DB.prepare(
      "INSERT INTO counters (key, n) VALUES ('views', 1) ON CONFLICT (key) DO UPDATE SET n = n + 1 RETURNING n",
    ).first();
    return reply({ views: row.n });
  }
  if (request.method === "GET") {
    const row = await env.DB.prepare("SELECT n FROM counters WHERE key = 'views'").first();
    return reply({ views: row?.n ?? 0 });
  }
  return new Response(null, { status: 405, headers: { allow: "GET, POST" } });
}
