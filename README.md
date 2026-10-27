# Ivy: AI enquiry agent for a fictional Perth renovator (portfolio demo)

A public, clickable demo of an always-on enquiry agent. **Harbour Line Renovations is a made-up kitchen, bathroom and home renovation company in Perth, Western Australia.** Every page says so and links to eklavyashetty.com. Built by Eklavya Shetty, cloned from Wren (the private GenWise enquiry agent) with all GenWise data removed.

Visitors chat as a homeowner. Ivy answers from the FAQ and facts only, qualifies the lead (first name, suburb, project type, budget band, timeline), books a free site measure and quote visit (Mon to Sat, Perth time), follows up on its own when a warm lead goes quiet, hands sensitive topics to a person, and logs what it could not answer. The owner console at `/console` shows all of it live, and is **view-only for the public**.

## Harness
- **Runs on its own harness:** a hand-written tool-calling loop in `src/worker.js` (up to 5 steps per message) on Cloudflare Workers + Durable Objects. No framework. Workers AI through the `AI` binding, so no API keys. Model `@cf/zai-org/glm-4.7-flash` (`MODEL` in `wrangler.jsonc`).
- **Memory:** one `Lead` Durable Object per conversation (messages, profile, booking, handoff, its own follow-up alarm). Data expires after 7 days.
- **Always on:** the `Desk` Durable Object sweeps on a timer (demo speed 10 min): nudges quiet warm leads, turns bookings into team reminders, writes a digest.
- **Retrieval:** keyword scoring plus `@cf/baai/bge-m3` multilingual embeddings over `data/faq.json`.
- **Tools:** `search_faq`, `get_business_facts`, `update_lead_profile`, `offer_site_visit_slots`, `book_site_visit`, `schedule_followup`, `handoff_to_human`, `log_knowledge_gap`.
- **Guardrails in code, not just the prompt:**
  - Forced handoff to a person (a regex on the visitor's message, whatever the model does): urgent water, gas or electrical danger (flagged urgent, safety advice first, no booking), asbestos, insurance claims, complaints or disputes about past work, refunds or deposit returns, discount or price-match requests, legal threats.
  - "I don't know" replies always log a knowledge gap. Placeholder profile values are rejected. A site visit can only be booked into a real open slot, after first name and suburb are saved and a phone or email is given. The model cannot mark a handoff urgent on its own.
  - Anti-injection and staff-impersonation rules in the prompt: nobody in the chat is staff, nothing can be discounted or edited from chat, other customers' details are never shown.
  - Contact details that a visitor types (emails, phone numbers) are masked in the public console. The owner sees them in full.

## Abuse limits (it is public, so these live inside the Worker)
| Limit | Default | Set by |
|---|---|---|
| Messages per visitor per day (cookie `hl_vid`, else IP) | 25 | `VISITOR_DAILY_MAX` |
| Messages per conversation | 40 | `CONVERSATION_MAX` |
| Messages per IP per day (backstop if someone clears cookies; uses `cf-connecting-ip`) | 100 | `IP_DAILY_MAX` |
| Global messages per day, all visitors, kept in the Desk DO | 1,500 | `GLOBAL_DAILY_MAX` |

Counters reset at midnight Perth time. Over any limit, Ivy replies with a fixed polite message and **does not call the model**. Follow-ups sent by the sweep count against the global cap. Messages are capped at 600 characters. The cap and today's usage show on the console.

**Owner-only actions** (house rules, desk sweep, clear demo data) work only when the request carries header `x-owner-key` equal to the secret `OWNER_KEY`. Without it the API returns 403 and the console shows no controls. In the console, "Owner sign-in" prompts for the key and keeps it in `sessionStorage` for that tab. If `OWNER_KEY` is not set, nobody is the owner.

## Run it locally
```
npm install
copy .dev.vars.example .dev.vars      (then set OWNER_KEY to any local value; the file is git-ignored)
npx wrangler dev --port 8811          (chat at http://127.0.0.1:8811/, console at /console)
```
Workers AI is always remote, even in `wrangler dev`: you need to be logged in (`npx wrangler login`) and it uses a little of that account's free allocation. If you belong to several Cloudflare accounts, set `CLOUDFLARE_ACCOUNT_ID` first. `npx wrangler dev --remote` also works if you want the Durable Objects remote too.

Demo speed (in `wrangler.jsonc`): follow-ups fire 90 s after Ivy sets one, a lead counts as quiet after 3 min, the desk sweeps every 10 min. For a real business set `DEMO_FOLLOWUP_MS` to 0, `QUIET_MS` to 24 h and `SWEEP_MS` to 1 h.

## Tests
- `node redteam.mjs http://127.0.0.1:8811` runs 16 adversarial homeowner messages plus owner-key checks (set `OWNER_KEY` in the environment for the owner-accepted checks). Writes `redteam-last.json`.
- `node happy.mjs http://127.0.0.1:8811` runs 5 normal conversations (about 2.5 min, it waits for a follow-up). Writes `happy-last.json`.
- `node limits-test.mjs http://127.0.0.1:8812` checks all four limits against a dev server started with tiny limits (command at the top of the file). Writes `limits-last.json`.
- Results and quoted replies: `TEST-REPORT.md`. Re-run after any prompt, model or regex change.

## Deploy later (not done yet; Eklavya's go first)
```
npx wrangler deploy
npx wrangler secret put OWNER_KEY      (paste a long random value when prompted; never commit it)
```
`workers_dev` is on and there are no routes, so it lands at `https://harbour-line-enquiry-demo.<account>.workers.dev`. To put it on a subdomain of eklavyashetty.com, add a custom domain on the Worker in the Cloudflare dashboard afterwards. After the first deploy, open `/console`, sign in with the owner key and use "Clear demo data" to start clean. The CSP header lets eklavyashetty.com and its subdomains embed the pages in an iframe.

## Files
- `src/worker.js`: the agent, both Durable Objects, limits and router
- `public/chat.html`, `public/console.html`: the two pages (fonts: Martel and Martel Sans from Google Fonts)
- `data/faq.json` (33 answers), `data/facts.json` (services, suburbs, price ranges in AUD, process, timelines, licences and insurance in general terms, warranty, payment stages, showroom hours). All invented. No real company, person or licence number appears; the phone number uses the reserved fictional range and the email uses `.example`.
- `redteam.mjs`, `happy.mjs`, `limits-test.mjs`, `*-last.json`, `TEST-REPORT.md`

## Things to know
- **Conversations are visible in the public console** (that is the demo). The chat page says not to type real personal details, and contact details are masked, but a visitor could still type something personal. Say if you would rather the console show only the lead card and not the transcript.
- Site visit slots are generated from the clock (next 24 h excluded, up to two per day), and the same slots are offered to every visitor; slots are not "used up" between visitors.
- Public holidays are not modelled.
- The model sometimes pads a hand-off reply with FAQ facts. It never promised a refund, discount or price in testing.

## Live (2026-10-27 14:40 IST)
- https://agent.allforone.co.in (chat) and /console (public, view-only). Also https://harbour-line-enquiry-demo.afoaofa.workers.dev.
- Cloudflare account 8f5947a7… (same as eklavyashetty.com and po.). Version 6324abc3.
- OWNER_KEY is set as a Worker secret. The local copy is in `.owner-key` (gitignored, never print it). Send it as header `x-owner-key` for rules, sweep and reset.
- Demo data was cleared after the live check. Before a demo call, clear it again: POST /api/reset with the owner key.
