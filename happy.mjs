// Five normal homeowner conversations, end to end. node happy.mjs [baseUrl]   Writes happy-last.json.
// Checks the saved lead profile, booking, knowledge-gap logging and the on-its-own follow-up, not just the wording.
const B = process.argv[2] || "http://127.0.0.1:8811";
const post = (path, body, h = {}) => fetch(B + path, { method: "POST", headers: { "content-type": "application/json", ...h }, body: JSON.stringify(body) });
const get = (path) => fetch(B + path).then((x) => x.json());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = [];

async function convo(tag, turns, verify, wait = 0) {
  const id = "lead-hp-" + tag + "-" + Date.now().toString(36), cookie = "hl_vid=" + Math.random().toString(16).slice(2).padEnd(16, "0").slice(0, 16), ip = "198.51.100." + Math.floor(Math.random() * 250);
  const log = [], notes = [];
  for (const text of turns) {
    const r = await post(`/api/lead/${id}`, { op: "chat", text }, { cookie, "cf-connecting-ip": ip }).then((x) => x.json());
    log.push({ user: text, reply: r.reply, events: (r.events || []).map((e) => e.text) });
    console.log(`\n[${tag}] Q: ${text}\n[${tag}] A: ${r.reply}\n        [${(r.events || []).map((e) => e.text).join(" | ")}]`);
  }
  if (wait) { console.log(`\n[${tag}] waiting ${wait / 1000} s for the follow-up alarm...`); await sleep(wait); }
  const lead = await get(`/api/lead/${id}`);
  verify({ lead, log, id, fail: (m) => notes.push(m) });
  for (const l of log) { if (/[\u{1F300}-\u{1FAFF}☀-➿]/u.test(l.reply || "")) notes.push("emoji in reply"); if (/\*\*|^#+ /m.test(l.reply || "")) notes.push("markdown in reply"); if (!l.reply) notes.push("empty reply"); }
  const ok = notes.length === 0;
  console.log(`\n[${tag}] ${ok ? "PASS" : "FAIL"} profile=${JSON.stringify(lead.profile)} booking=${JSON.stringify(lead.booking)}${ok ? "" : " !! " + notes.join("; ")}`);
  out.push({ tag, ok, notes, profile: lead.profile, booking: lead.booking, handoff: lead.handoff, messages: lead.messages.length, log });
}

await convo("kitchen-scarborough", [
  "Hi, I'm thinking about renovating our kitchen in Scarborough.",
  "It's a 1990s house. We want a full renovation with mid-range finishes, budget around $40,000.",
  "We'd like to start in the next 3 to 6 months. I'm Priya by the way.",
  "Can you book the free site visit? Show me times.",
  "The first one works for me. My mobile is 0412 555 019.",
], ({ lead, fail }) => {
  const p = lead.profile;
  if (!/scarborough/i.test(p.suburb || "")) fail("suburb not saved as Scarborough");
  if (p.projectType !== "kitchen") fail("projectType not kitchen");
  if (!/priya/i.test(p.firstName || "")) fail("first name not saved");
  if (!["30to60", "15to30"].includes(p.budgetBand)) fail("budget band not saved sensibly: " + p.budgetBand);
  if (!lead.booking) fail("no site visit booked"); else if (!/\*{3}|\*/.test(lead.booking.contact)) fail("public view should mask contact: " + lead.booking.contact);
});

await convo("bathroom-fremantle", [
  "Hi, I'm Tom. We want to redo the main bathroom in our place in Fremantle. Budget is about $25,000.",
  "How long would it take, and what warranty do you give?",
  "What are the payment stages?",
], ({ lead, log, fail }) => {
  const p = lead.profile;
  if (!/fremantle/i.test(p.suburb || "")) fail("suburb not saved as Fremantle");
  if (p.projectType !== "bathroom") fail("projectType not bathroom");
  if (!["15to30", "30to60"].includes(p.budgetBand)) fail("budget band: " + p.budgetBand);
  const text = log.map((l) => l.reply).join(" ");
  if (!/3 to 5 weeks|3-5 weeks|three to five/i.test(text)) fail("did not give the 3 to 5 week bathroom duration");
  if (!/7 years|seven years/i.test(text)) fail("did not give the 7 year warranty");
  if (!/5%|deposit/i.test(text)) fail("did not describe the deposit stage");
});

await convo("direct-booking-saturday", [
  "I'd like to book a free site visit. I'm Sam, and it's a laundry renovation in Mount Lawley.",
  "Budget maybe $12,000, and we want it done in 1 to 3 months.",
  "What Saturday times do you have?",
  "Saturday at 9:00 am please. My email is sam.rivers@example.com",
], ({ lead, fail }) => {
  const p = lead.profile;
  if (!/mount lawley/i.test(p.suburb || "")) fail("suburb not saved");
  if (p.projectType !== "laundry") fail("projectType not laundry");
  if (!lead.booking) fail("no booking");
  else if (!/sat/i.test(lead.booking.slot) || !/9:00/.test(lead.booking.slot)) fail("booked slot is not Saturday 9:00 am: " + lead.booking.slot);
});

await convo("knowledge-and-gap", [
  "What's included in a bathroom renovation? And does it cover a freestanding bath?",
  "Do you also handle council approvals, and what is your ABN?",
  "Do you do solar panels or battery installs?",
], ({ lead, log, fail }) => {
  const text = log.map((l) => l.reply).join(" ");
  if (!/waterproof/i.test(text)) fail("did not mention waterproofing for the bathroom");
  if (!log.some((l) => l.events.some((e) => /doesn't cover|FAQ doesn't/i.test(e)))) fail("no knowledge gap logged for the unknown questions");
  if (/\babn\s*(is|:)?\s*\d/i.test(text)) fail("invented an ABN");
  if (/yes[,.]? we (do|install) solar/i.test(text)) fail("claimed to do solar");
});

await convo("quiet-lead-follow-up", [
  "Hi, I'm Jess. I'm looking at an ensuite renovation in Hillarys, maybe $30,000, but probably not until 3 to 6 months from now.",
  "Thanks, I'll have a think about it.",
], ({ lead, fail }) => {
  const last = lead.messages.at(-1);
  if (!lead.messages.some((m) => m.followup)) fail("no follow-up message arrived after the quiet period");
  else if (!/jess|hillarys|ensuite|site visit|visit/i.test(last.content)) fail("follow-up did not pick up the conversation: " + last.content);
}, 110000);

const body = { pass: out.filter((o) => o.ok).length, total: out.length, conversations: out };
await import("node:fs").then((fs) => fs.writeFileSync("happy-last.json", JSON.stringify(body, null, 1)));
console.log(`\n==== ${body.pass}/${body.total} happy-path conversations passed`);
