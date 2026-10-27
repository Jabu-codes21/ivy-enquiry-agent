// Abuse-limit test. Run against a dev server started with small limits:
//   npx wrangler dev --port 8812 --var GLOBAL_DAILY_MAX:10 --var CONVERSATION_MAX:2 --var VISITOR_DAILY_MAX:3 --var IP_DAILY_MAX:4
// node limits-test.mjs [baseUrl]   Refused messages must not call the model (they return in milliseconds).
const B = process.argv[2] || "http://127.0.0.1:8812";
const chat = async (id, text, cookie, ip) => { const t0 = Date.now(); const r = await fetch(`${B}/api/lead/${id}`, { method: "POST", headers: { "content-type": "application/json", cookie: "hl_vid=" + cookie, "cf-connecting-ip": ip || "198.51.100." + (1 + Math.floor(Math.random() * 250)) + "." + Math.floor(Math.random() * 250) }, body: JSON.stringify({ op: "chat", text }) }).then((x) => x.json()); return { ...r, ms: Date.now() - t0 }; };
const res = [], ok = (name, pass, detail) => { res.push({ name, pass, detail }); console.log(`${pass ? "PASS" : "FAIL"}  ${name}  ${detail}`); };
const rid = () => "lead-lim-" + Math.random().toString(36).slice(2, 10);

// 0. IP backstop first (cap 4 here): a fresh cookie each time, same IP. Cookie-clearing must not help.
const ip = "203.0.113.9"; let ipLimited = null, n = 0;
for (let i = 0; i < 6 && !ipLimited; i++) { const r = await chat(rid(), "Hello", "d" + i + "d".repeat(15), ip); n++; if (r.limited) ipLimited = r; }
ok("IP backstop beats cookie-clearing", ipLimited?.limited === "visitor" && n === 5, `refused on call ${n}, limited=${ipLimited?.limited}`);
// 1. per-conversation cap (2 here): third user message in one conversation is refused
let id = rid(), a = await chat(id, "What areas do you service?", "c1c1c1c1c1c1c1c1"), b = await chat(id, "And Fremantle?", "c1c1c1c1c1c1c1c1"), c = await chat(id, "And Rockingham?", "c1c1c1c1c1c1c1c1");
ok("per-conversation cap", !a.limited && !b.limited && c.limited === "conversation" && c.ms < 1500, `third message limited=${c.limited} in ${c.ms} ms, left=${b.left}`);
// 2. per-visitor cap (3 here): same cookie, new conversation; 2 used above, so one more is allowed and the next is refused
const d = await chat(rid(), "Do you do laundries?", "c1c1c1c1c1c1c1c1"), e = await chat(rid(), "How long does a bathroom take?", "c1c1c1c1c1c1c1c1");
ok("per-visitor daily cap", !d.limited && e.limited === "visitor" && e.ms < 1500, `next message from the same cookie limited=${e.limited} in ${e.ms} ms; text: "${(e.reply || "").slice(0, 70)}"`);
// 3. a different cookie is a different visitor
const f = await chat(rid(), "Do you offer alfresco areas?", "c2c2c2c2c2c2c2c2");
ok("other visitor unaffected", !f.limited, `limited=${f.limited}`);
// 4. global cap (10 here): used so far 4 (ip) + 2 + 1 + 1 = 8; two more are admitted, then everyone is refused without a model call
const g1 = await chat(rid(), "Hi", "e3e3e3e3e3e3e3e3"), g2 = await chat(rid(), "Hi again", "e4e4e4e4e4e4e4e4");
const g = await chat(rid(), "Anyone there?", "e5e5e5e5e5e5e5e5"), h = await chat(rid(), "Still there?", "e6e6e6e6e6e6e6e6");
ok("global daily cap refuses everyone without calling the model", !g1.limited && !g2.limited && g.limited === "global" && h.limited === "global" && g.ms < 1500 && h.ms < 1500, `limited=${g.limited}/${h.limited} in ${g.ms}/${h.ms} ms; text: "${(g.reply || "").slice(0, 70)}"`);
const st = await fetch(B + "/api/desk").then((x) => x.json());
ok("desk reports usage at the cap", st.usage.used === st.usage.cap, JSON.stringify(st.usage));
await import("node:fs").then((fs) => fs.writeFileSync("limits-last.json", JSON.stringify(res, null, 1)));
console.log(`\n${res.filter((r) => r.pass).length}/${res.length} limit checks passed`);
