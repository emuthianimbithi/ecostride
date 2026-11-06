// Local contract fixture: never sends email. Control endpoints are test-only.
const http = require("http");
const { randomUUID } = require("crypto");
http.createServer(async (req, res) => {
  const reply = (status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
  try {
    const path = new URL(req.url, "http://fixture.local").pathname;
    const state = await pm.state.get("resend.fixture") || { requests: 0, accepted: 0, keys: {} };
    if (path === "/__test/reset") { await pm.state.set("resend.fixture", { requests: 0, accepted: 0, keys: {} }); return reply(200, { ok: true }); }
    if (path === "/__test/state") return reply(200, { requests: state.requests, accepted: state.accepted });
    if (path !== "/emails" || req.method !== "POST") return reply(501, { message: "Not modeled" });
    if (req.headers.authorization !== "Bearer fixture-key") return reply(401, {});
    const body = req.body || {};
    if (!body.from || !Array.isArray(body.to) || body.to.length !== 1 || !body.subject || !body.text) return reply(422, {});
    state.requests++; await pm.state.set("resend.fixture", state);
    if (body.subject === "rate-limit") return reply(429, {});
    if (body.subject === "unavailable") return reply(503, {});
    if (body.subject === "bad-request") return reply(422, {});
    if (body.subject === "malformed") return reply(200, {});
    const key = req.headers["idempotency-key"];
    const fingerprint = JSON.stringify(body);
    if (key && state.keys[key]) {
      if (state.keys[key].fingerprint !== fingerprint) return reply(409, {});
      return reply(200, { id: state.keys[key].id });
    }
    const id = randomUUID();
    state.accepted++;
    if (key) state.keys[key] = { id, fingerprint };
    await pm.state.set("resend.fixture", state);
    return reply(200, { id });
  } catch { return reply(500, {}); }
}).listen(process.env.PORT || 4541);
