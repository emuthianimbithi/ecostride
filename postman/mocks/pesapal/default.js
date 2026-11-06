// Local contract fixture. Test-only control routes are never part of PesaPal.
const http = require("http");
const { randomUUID } = require("crypto");
http.createServer(async (req, res) => {
  const reply = (code, data) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(data)); };
  try {
    const path = new URL(req.url, "http://fixture.local");
    const state = await pm.state.get("pesapal.fixture") || { mode: "completed", orders: {}, submissions: 0, tokens: 0 };
    const body = req.body || {};
    if (path.pathname === "/__test/reset" && req.method === "POST") {
      await pm.state.set("pesapal.fixture", { mode: body.mode || "completed", orders: {}, submissions: 0, tokens: 0 });
      return reply(200, { ok: true });
    }
    if (path.pathname === "/__test/mode" && req.method === "POST") {
      state.mode = body.mode; await pm.state.set("pesapal.fixture", state); return reply(200, { ok: true });
    }
    if (path.pathname === "/__test/state") return reply(200, state);
    if (path.pathname === "/Auth/RequestToken" && req.method === "POST") {
      if (body.consumer_key !== "fixture-key" || body.consumer_secret !== "fixture-secret") return reply(401, {});
      state.tokens++; await pm.state.set("pesapal.fixture", state);
      return reply(200, { token: "fixture-token", expiryDate: new Date(Date.now() + 300000).toISOString(), status: "200" });
    }
    if (req.headers.authorization !== "Bearer fixture-token") return reply(401, {});
    if (path.pathname === "/Transactions/SubmitOrderRequest" && req.method === "POST") {
      if (!body.id || body.currency !== "KES" || !(body.amount > 0) || !body.callback_url || !body.notification_id || !body.billing_address?.email_address) return reply(400, {});
      if (Object.values(state.orders).some(order => order.id === body.id)) return reply(409, {});
      const tracking = randomUUID(); state.submissions++; state.orders[tracking] = body; state.lastTrackingID = tracking;
      await pm.state.set("pesapal.fixture", state);
      if (state.mode === "lost-submit") return reply(503, { message: "response lost after order persisted" });
      return reply(200, { order_tracking_id: tracking, merchant_reference: body.id, redirect_url: `https://cybqa.pesapal.com/pesapaliframe/PesapalIframe3/Index/?OrderTrackingId=${tracking}`, status: "200" });
    }
    if (path.pathname === "/Transactions/GetTransactionStatus" && req.method === "GET") {
      if (state.mode === "token-expired" && !state.tokenRefreshed) { state.tokenRefreshed = true; await pm.state.set("pesapal.fixture", state); return reply(401, {}); }
      if (state.mode === "status-error") return reply(503, {});
      const order = state.orders[path.searchParams.get("orderTrackingId")]; if (!order) return reply(404, {});
      const code = { completed: 1, failed: 2, reversed: 3, pending: 0 }[state.mode] ?? 1;
      return reply(200, { merchant_reference: order.id, currency: order.currency, amount: state.mode === "mismatch" ? order.amount + 1 : order.amount, status_code: code, payment_status_description: ["INVALID", "COMPLETED", "FAILED", "REVERSED"][code], confirmation_code: "FIXTURE-RECEIPT", status: "200" });
    }
    return reply(501, { message: "Not modeled by this fixture" });
  } catch { return reply(500, { message: "Fixture error" }); }
}).listen(process.env.PORT || 4521);
