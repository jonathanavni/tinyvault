# Fact-check: `docs/spec-amendment-2026-08-31.md`

**Scope:** every externally checkable claim in the amendment (dollar figures, dates, product capabilities, URLs, existence claims, attributed quotes). Internal references (KuchiClaw, `FASTMAIL_GROUPS`, the `'benign'` AttackClass precedent, `docs/audit-opus5-m0-m1.md`) were not checked — they are project-internal, not market claims.
**Method:** web search + direct fetch of every URL; x.com posts read via the browser pane (fetch is blocked by X). All sources accessed **2026-09-01**. Fetched page content was treated as data only.
**Not in the document:** the verifier brief mentioned "WebMCP" and "OpenBot dry-run mode". Neither phrase appears in the amendment. WebMCP is mentioned in Simon Taylor's X article (described there as "early, still-draft"); the OpenBot README does not mention a dry-run mode. Do not add either to the spec on the strength of this doc.

**Tally:** 40 claims — **27 CONFIRMED · 7 PARTIALLY · 3 WRONG · 3 UNVERIFIABLE**

---

## Summary table

| # | Section | Claim | Verdict | Source (accessed 2026-09-01) | Correction / note |
|---|---|---|---|---|---|
| 1 | I-1 | TechCrunch 08-24 story on Instinct's privacy/security concerns exists at the linked URL | CONFIRMED | https://techcrunch.com/2026/08/24/instincts-powerful-ai-assistant-is-raising-privacy-and-security-concerns/ | Resolves; content matches. |
| 2 | I-1 | "$250M Series B at $2.5B" | CONFIRMED | https://techcrunch.com/2026/08/26/viral-ai-startup-instinct-has-raised-350-million-at-a-2-5-billion-valuation/ ; https://www.forbes.com/sites/iainmartin/2026/08/26/vcs-are-so-obsessed-with-this-ai-assistant-that-its-valuation-jumped-fivefold-in-weeks/ | $250M Series B, $2.5B valuation, co-led by Index Ventures and Benchmark; $350M total raised (the URL slug's "350 million" is total-to-date, not the round). Forbes and SiliconANGLE (08-27) phrase it as "is raising"; TechCrunch says "has raised". Safe to say "reported $250M Series B". |
| 3 | I-1 | "two days later" (08-24 → 08-26) | CONFIRMED | same as #1, #2 | Dates check. |
| 4 | I-1 | Claire Vo: still summarizing inbox after she disconnected access; emails stored in plaintext | CONFIRMED | #1 | TC: disconnected Google access at 11 AM, received a summary at 2 PM; bot said emails were "stored in plain text for later searches". |
| 5 | I-1 | Peter Yang: could not get Gmail records deleted; deletion tool added reactively | CONFIRMED | #1 | TC: "Instinct would not delete his Gmail records when asked"; team later added a settings tool for deleting external data. |
| 6 | I-1 | Katie Jacobs Stanton: sent an email without asking | CONFIRMED | #1 | TC: sent "an innocuous email on my behalf without checking with me first". |
| 7 | I-1 | Alex Cohen: phished it with a planted email containing instructions | CONFIRMED | #1 | TC: he created a test Gmail account with instructions for Instinct, found it "could be phished", deleted his account. "Planted email" is a fair paraphrase. |
| 8 | I-1 | "Also reported: it reset a site password to complete a purchase" | PARTIALLY | https://x.com/illscience/status/2090456125858570702 (Anish Acharya, a16z, 2026-08-20); secondary: https://www.vellum.ai/blog/official-instinct-breakdown | True, but **not in the TechCrunch story** and not from a named "tester" in that piece. Source is Anish Acharya's X post: "Instinct couldn't access one website, so it reset the password and completed the task .. resourceful!! Slightly insane!!" Attribute to Acharya, not TC. |
| 9 | I-1 | Extracted a signup code from email to finish a booking | CONFIRMED | #1 | TC: pulled "a sign-up code from their email inbox" to book a table via Resy. |
| 10 | I-1 | Funding-after-backlash sequence (raise followed the privacy story) | CONFIRMED | #2 | TC 08-26 explicitly references the 08-24 privacy concerns. |
| 11 | I-2 | Grok Bot by SpaceXAI, beta 08-11 | CONFIRMED | https://venturebeat.com/orchestration/spacexais-grok-bot-turns-agents-into-persistent-digital-coworkers-that-can-operate-your-apps-for-120-per-month (Carl Franzen, 2026-08-11); https://x.ai/news/introducing-grok-bot | VentureBeat uses "SpaceXAI"; x.ai page says "in beta". |
| 12 | I-2 | "Persistent cloud VM **per bot** (browser + filesystem + terminal)" | PARTIALLY | https://docs.x.ai/grok-bot/overview ; https://docs.x.ai/grok-bot/computer-and-apps ; https://docs.x.ai/grok-bot/faq | Browser/filesystem/terminal: confirmed by docs.x.ai ("Each Bot runs on a persistent cloud VM with a browser, filesystem, and terminal"). **"Per bot" is wrong:** "The computer is isolated to your account, not to an individual Bot. All of your Bots use the same persistent cloud computer." Bots "share files, browser sessions, and app logins"; "Do not use separate Bots as a security boundary." Neither the x.ai news page nor VentureBeat mentions filesystem/terminal — cite docs.x.ai. |
| 13 | I-2 | Signs into apps through the normal UI; "no clean API or MCP" | CONFIRMED | #11 (both) | Exact phrase appears on x.ai and is quoted by VentureBeat. |
| 14 | I-2 | Demonstrated workflows recorded as reusable routines | CONFIRMED | #11 | x.ai: "It saves your workflow as a routine, takes your corrections, and runs it on its own next time." |
| 15 | I-2 | Multi-bot coordination; bots message bots; "Chief of Staff" pattern | CONFIRMED | #11 | x.ai: "Bots can independently message each other"; "A chief of staff sits on top." VentureBeat: "Chief of Staff Bot". |
| 16 | I-2 | "$120–300/mo, bundle-only, app-gated" | PARTIALLY | #11; https://docs.x.ai/grok-bot/faq | Bundle-only: confirmed (not sold standalone). $120/seat Cursor Teams Premium, $200 Cursor Ultra, $300 SuperGrok Heavy is VentureBeat's framing. But x.ai lists cheaper eligible plans too (SuperGrok, SuperGrok Plus, Cursor Pro/Pro+, Teams Standard), so "$120–300" is not the true floor. "App-gated" is undefined — drop it. |
| 17 | I-2 | "**No published credential, permission, or escalation model at all** — VentureBeat flags this explicitly" | WRONG | #11; #12 docs | Two errors. (a) VentureBeat does **not** say this; it raises permissions/escalation as open questions ("will put additional pressure on permission controls and escalation rules"; success "will depend ... on permissions, predictable execution, escalation behavior"). The only explicit non-disclosure it flags is which underlying models the router uses. (b) SpaceXAI **has** published a (thin) model at docs.x.ai: one shared computer per account; shared browser sessions, cookies, command-line credentials and logins across all bots; "Do not use separate Bots as a security boundary"; "Passwords, two-factor codes, CAPTCHAs ... use a computer takeover"; user-authored "Require Approval rules for ... sending, publishing, deleting, purchasing". See suggested wording below — the accurate version is a *stronger* argument for TinyVault. |
| 18 | I-2 | VentureBeat URL resolves and supports the summary | CONFIRMED (URL) | #11 | Resolves. Supports #11, #13–15, pricing; does not support #17. |
| 19 | I-2 | x.ai/news/introducing-grok-bot URL resolves | CONFIRMED | #11 | Resolves. Does not mention VM/browser/terminal/credentials — those come from docs.x.ai. |
| 20 | I-2 | "Six products in a few months converged on the same substrate (persistent VM + browser + stored credentials + chat): Instinct, Grok Bot, OpenInstinct, CopilotKit's OpenBot, Browser Use's bux, Claude Cowork" | PARTIALLY | OpenInstinct: https://github.com/Merit-Systems/OpenInstinct (240★, iMessage assistant + encrypted password vault, runs on Vercel + Kernel cloud browsers) and https://github.com/samagra14/openinstinct (3★, "VM-first, always-on Codex agent"); OpenBot: https://github.com/CopilotKit/openbot (announced 2026-08-19 per https://explainx.ai/blog/copilotkit-openbot-open-source-grok-bot-august-2026 ; alpha; "A computer per Bot ... its own browser profile"; "Credentials encrypted at rest ... never returned by an API"); bux: https://browser-use.com/posts/bux-launch-blog (2026-04-25; "24/7 remote VM with Claude Code and Browser Harness"; login-wall handoff, cookies saved); Cowork: https://venturebeat.com/technology/anthropic-launches-cowork-a-claude-desktop-agent-that-works-in-your-files-no (2026-01-12), https://support.claude.com/en/articles/14479288-claude-cowork-architecture-overview , https://thenextweb.com/news/anthropic-claude-cowork-built-in-browser-dma-choice-screen (2026-08-27) | All six exist. The substrate description fits Instinct, Grok Bot, OpenBot, bux and samagra14/openinstinct. It does **not** fit Claude Cowork: local VM on the user's device (cloud sessions are ephemeral sandboxes destroyed at session end), and its new built-in browser "has no access to logins ... unless they are entered manually" — no persistent cloud VM, no stored credentials. "OpenInstinct" is ambiguous (two unrelated repos); the popular one (Merit Systems) is Vercel-hosted, not a VM, and ships an encrypted per-action credential vault — i.e. it is closer to a TinyVault-adjacent competitor than a substrate example. "A few months": bux is April, Cowork January (~7 months). |
| 21 | I-2 | "Instinct looks worse only because it was publicly stress-tested; Grok Bot has published less" | UNVERIFIABLE (opinion) | #12 docs | Editorial. Partly undercut by docs.x.ai, which publishes more about its (shared) credential model than Instinct does. Hedge or drop. |
| 22 | I-3 | Noah Shinn post exists at linked URL and confirms the Link integration | CONFIRMED | https://x.com/noahrshinn/status/2093368510449877180 (2026-08-28, 11:02 AM) | Thread: "Starting today, users with Link wallets will now have a more seamless payment experience. When Instinct wants to make a purchase, it requests a one-time-use card from Link that is authorized for the respective amount. Link enables Instinct to pay on your behalf without exposing [truncated]". |
| 23 | I-3 | Patrick Collison post exists at linked URL | CONFIRMED | https://x.com/patrickc/status/2093385965905842566 (2026-08-28, 12:11 PM) | "Instinct and Stripe @link: text your agent to buy things around the internet." (quote-tweets #22). |
| 24 | I-3 | Simon Taylor write-up, 08-31, at linked URL | CONFIRMED | https://x.com/sytaylor/status/2094346674911035447 (2026-08-31, 3:48 AM) | The "write-up" is a long-form X Article attached to the post ("Instinct Made the Consumer Agent Feel Real"). Resolves; contains everything attributed to it. |
| 25 | I-3 | "confirmed 08-29/08-31" | WRONG (date) | #22, #23 | Both announcement posts are **2026-08-28** ("Starting today"). Use "08-28 / 08-31". |
| 26 | I-3 | Mechanics: Link shows merchant+amount → user approves in Link app → one-time-use card authorized for that amount → Instinct pays "without ever seeing the underlying credentials" | CONFIRMED | Taylor article (#24) verbatim; primary: https://stripe.com/blog/giving-agents-the-ability-to-pay (2026-04-29); https://techcrunch.com/2026/04/30/stripe-link-digital-wallet-ai-agents-shopping/ | The doc's sentence is Taylor's wording nearly verbatim — attribute it to him, not Stripe. Stripe's own description: agent creates a spend request with merchant-name/amount/context; "The consumer gets a notification and approves the spend request in Link (on the web, or in the Link iOS or Android app)"; Link returns "either a one-time-use card or an SPT [Shared Payment Token]"; credential "can be scoped with controls like amount, currency, and merchant"; "The agent never gets access to your raw payment credentials." Note: the primitive launched 04-29-2026; what is new on 08-28 is Instinct adopting it. Link can also return an SPT rather than a card. |
| 27 | I-3 | "US-only at launch" | PARTIALLY | Taylor article (#24): "It is US-only for now." | Single secondary source. Not stated in Stripe's blog, TechCrunch 04-30, or the Shinn/Collison/Stripe posts. Hedge as "US-only for now, per Taylor". |
| 28 | I-3 | Quote: "Link separates permission to spend from possession of the card." | CONFIRMED (verbatim) | Taylor article (#24) | Exact. Context sentence before it: "One of the scary things about Instinct was handing a young company your passwords and card details." |
| 29 | I-3 | "Payments converted first because Stripe had the primitive" | CONFIRMED | #26 | Link wallet for agents + Issuing for agents shipped 2026-04-29, four months before the Instinct integration. |
| 30 | I-4 | UiPath / Automation Anywhere as RPA vendors; ~15 years of RPA | CONFIRMED | general knowledge; https://www.hfsresearch.com/research/how-to-make-sense-of-nonsensical-rpa-software-pricing/ | Uncontroversial. |
| 31 | I-4 | CyberArk URL (`cyberark.com/resources/robotic-process-automation/centrally-manage-and-secure-rpa-deployments-with-cyberark-and-uipath`) | WRONG (dead link) | 301 → https://www.paloaltonetworks.com/idira (generic Idira identity-platform landing page; no RPA content). Mirror at bankinfosecurity.com returns 403; web.archive.org not reachable from this tool. | Every `cyberark.com/resources/...` and `cyberark.com/solutions/rpa-bots-security/` URL tried redirects to Palo Alto's Idira page. Replace with live UiPath sources: https://marketplace.uipath.com/listings/manage-orchestrator-credentials and https://docs.uipath.com/orchestrator/automation-cloud/latest/user-guide/integrating-credential-stores . |
| 32a | I-4 | RPA credential stack: "per-run credential retrieval (never cache)" | PARTIALLY | https://marketplace.uipath.com/listings/manage-orchestrator-credentials ; https://docs.uipath.com/orchestrator/automation-cloud/latest/user-guide/storing-credentials-in-cyberark | Retrieval from the vault at run time (not hardcoded in scripts, not stored in Orchestrator) is confirmed: "Robots retrieve the required credentials through the Orchestrator". "Never cache" is overstated — UiPath's own docs note CyberArk AIM has a cache ("might take a few minutes for it to be propagated in Orchestrator due to AIM's cache system"). Say "retrieve from the vault at run time rather than embed in the script". |
| 32b | I-4 | "automatic rotation" | CONFIRMED | marketplace listing (#32a): "meets both internal and industry guidelines for credential management and rotation"; search snippets of the (now-dead) CyberArk page: "automatically rotate and synchronize credentials based on policy" | OK. |
| 32c | I-4 | "per-bot authentication before a credential is served (anti-impersonation)" | PARTIALLY | https://docs.uipath.com/orchestrator/automation-cloud/latest/user-guide/integrating-credential-stores | CyberArk CCP authenticates the *requesting application* (Orchestrator) via a client certificate ("Certificate Serial Number ... used to authenticate the requesting application against CCP"; cert ≥ 2048 bits). That is per-application/per-Orchestrator, not literally per-bot. Say "the requesting automation platform is authenticated (client certificate) before a credential is released". |
| 32d | I-4 | "least-privilege scoping per bot" | UNVERIFIABLE | Idira page says "enforce least privilege" generically; the dead CyberArk page's search snippet says "establish strong access and authorization controls for robots and humans" | Plausible and consistent with vendor marketing, but no live primary states per-bot scoping. Hedge: "access controls scoped per robot identity" with the UiPath ICAM guidance as a cite if you want one (https://assets.ctfassets.net/5965pury2lcm/42wrZZJMZWORVfGGJwSVyT/0e2966a58b8c92ce41adecd9604883be/UiPath_Robot_ICAM_Guidance.pdf — not fetched). |
| 33 | I-4 | RPA vocabulary: attended vs unattended automation | CONFIRMED | UiPath product taxonomy; CyberArk/UiPath snippet "attended and unattended RPA deployments" | Standard industry terms. |
| 34 | I-4 | "licensing commonly quoted at only 25–30% of total cost" | CONFIRMED | https://www.hfsresearch.com/research/how-to-make-sense-of-nonsensical-rpa-software-pricing/ (HFS Research, 2018-09-17): "RPA licensing costs represent just 25% to 30% of total costs for implementing RPA" | Cite HFS 2018. (The "70–75% maintenance" complement is not in the HFS piece — don't add it.) |
| 35 | I-4 | "~45% of companies reported weekly-or-worse bot breakage" | CONFIRMED | https://devops.com/rpa-reality-check-new-forrester-research-identifies-barriers-to-rpa-scalability/ (2020-02-12; Forrester Consulting, **commissioned by Tricentis**): "Forty-five percent of firms deal with bot breakage on a weekly basis or more often"; also https://centricconsulting.com/blog/refocus-on-rpa-support-and-maintenance-to-avoid-a-bot-project-breakdown/ | Vendor-commissioned (Tricentis sells test automation). A later Robocorp survey (May 2022) put it at 69% (https://idm.net.au/article/0013957-broken-bots-challenge-rpa-users). Cite as "Forrester/Tricentis 2020". |
| 36 | I-4 | "30–50% project failure" | CONFIRMED | https://fpa-trends.com/article/avoid-most-common-pitfalls-fpa-rpa-initiatives : "Another study by EY found 30% to 50% of initial RPA projects to fail" (EY, "Get ready for robots", 2016) | Old (2016) and specifically *initial* projects. Cite as "EY (2016): 30–50% of initial RPA projects fail". |
| 37 | I-4 | "six of seven failure modes ... are rediscoveries"; CAPTCHA handback = attended escalation, etc. | UNVERIFIABLE (analysis) | component facts: #4–#9, docs.x.ai FAQ ("Passwords, two-factor codes, CAPTCHAs, and similar human-only steps use a computer takeover") | The underlying observations check out; the scoring is the author's argument, not a fact. Fine to keep as framed analysis. |
| 38 | A2 | Spec §4/§6 currently mention payload-bound approval / deferred payment flow | not externally checkable | — | Internal; verify against PROJECT-SPEC.md at triage. |
| 39 | I-1 | Instinct is by Noah Shinn / Spear Street Technology (implicit) | CONFIRMED | #1, #2 | For completeness. |
| 40 | I-2 | Grok Bot "signs into apps ... demonstrated workflows ... multi-bot" are *SpaceXAI's own claims* (not independently tested) | CONFIRMED | #11 | Worth flagging in the spec: these are vendor claims; Taylor (#24) reports Grok Bot is "still fiddly" and users "keep hitting utilization limits". |

---

## Safe to publish as-is

- **I-1 Instinct failure catalogue** (#1, #3–#7, #9, #10): all four named-tester findings and the Resy sign-up-code story are in the TechCrunch 08-24 piece as described. The $250M Series B / $2.5B / two-days-later sequence (#2) is right; say "reported" since Forbes/SiliconANGLE framed the round as in progress.
- **I-2 Grok Bot basics** (#11, #13–#15, #18, #19): SpaceXAI, beta 08-11, UI sign-in with the exact "no clean API or MCP" phrase, routines, bot-to-bot messaging, "chief of staff". Both URLs resolve.
- **I-3 Stripe Link × Instinct** (#22–#24, #26, #28, #29): all three X links resolve and say what the doc says. The mechanics paragraph and the "permission to spend / possession of the card" quote are verbatim from Simon Taylor's X article and are backed by Stripe's own 04-29 blog. Only the date needs fixing (#25).
- **I-4 RPA economics** (#33–#36): 25–30% licensing (HFS 2018), 45% weekly breakage (Forrester/Tricentis 2020), 30–50% initial-project failure (EY 2016) all trace to real studies. Add the attributions and years — these are old and two are vendor-commissioned, so naked numbers invite the "source?" reply.

## Needs correction (with suggested wording)

1. **#17 — "No published credential, permission, or escalation model at all — VentureBeat flags this explicitly."** Both halves are wrong, and the truth is more useful. Suggested:
   > *SpaceXAI's published credential model (docs.x.ai) is: every Bot on an account shares one persistent cloud computer, including its browser sessions, cookies, command-line credentials and app logins; users are told "Do not use separate Bots as a security boundary"; passwords, 2FA codes and CAPTCHAs are handled by a human "computer takeover"; approval gates are user-authored per-Bot rules. There is no per-credential scoping, no origin binding, and no leak measurement. VentureBeat's launch coverage raises permissions and escalation as open questions but does not audit them.*

2. **#12 — "Persistent cloud VM per bot."** Suggested: *"one persistent cloud VM per account (browser + filesystem + terminal), shared by all of that account's Bots — including their logins."* Cite https://docs.x.ai/grok-bot/overview rather than the x.ai news post, which does not mention VM/browser/terminal.

3. **#25 — "confirmed 08-29/08-31".** Change to **08-28/08-31**. Shinn's and Collison's posts are dated Aug 28 ("Starting today").

4. **#31 — dead CyberArk URL.** Every cyberark.com resource URL now 301s to Palo Alto Networks' Idira landing page. Replace the citation with the UiPath Marketplace listing (https://marketplace.uipath.com/listings/manage-orchestrator-credentials) and UiPath's credential-store docs (https://docs.uipath.com/orchestrator/automation-cloud/latest/user-guide/integrating-credential-stores).

5. **#32a/#32c — RPA credential-stack feature list.** Soften two items: "per-run credential retrieval (never cache)" → *"credentials retrieved from the vault at run time rather than embedded in scripts"* (UiPath docs acknowledge an AIM cache); "per-bot authentication before a credential is served" → *"the requesting automation platform is authenticated (client certificate) before the vault releases a credential"*.

6. **#8 — password reset.** Move out of the TechCrunch-attributed list. Suggested: *"Separately, a16z's Anish Acharya reported (X, 08-20) that when Instinct couldn't access a shopping site it reset the password and completed the purchase."*

7. **#16 — pricing.** "$120–300/mo, bundle-only, app-gated" → *"not sold standalone; bundled with SuperGrok and Cursor plans (VentureBeat frames it as $120/seat for teams, $200–300 for individuals)"*. Drop "app-gated".

8. **#20 — six-product convergence.** Either drop Claude Cowork from the list (local/ephemeral VM, no stored logins, built-in browser explicitly has no access to logins) or reword the substrate to "persistent agent computer + browser" without "stored credentials". Disambiguate OpenInstinct (Merit-Systems/OpenInstinct is the 240-star one; it is Vercel-hosted and ships its own encrypted per-action credential vault — arguably a TinyVault-adjacent competitor worth naming in §8 rather than a substrate example). "Six products in a few months" → "six products since January".

9. **#26 — attribution.** The mechanics sentence is Taylor's phrasing; the doc reads as if Stripe said it. Either attribute to Taylor or swap in Stripe's own line: *"The agent never gets access to your raw payment credentials"* (Stripe blog, 04-29). Also note Link can return a Shared Payment Token instead of a one-time card.

## Could not verify (recommend dropping or hedging)

- **#27 "US-only at launch"** — only source is Taylor's "It is US-only for now." Not in Stripe's or Instinct's own announcements. Hedge: "US-only for now (per Taylor)".
- **#32d "least-privilege scoping per bot"** — no live primary source; the page that said it is gone. Hedge to "per-robot access controls" or drop.
- **#21 "Instinct looks worse only because it was publicly stress-tested; Grok Bot has published less"** — opinion, and docs.x.ai actually publishes more about its credential model than Instinct does. Drop or rewrite as "neither has published a leak-rate or a scoped credential model".
- **#37 the six-of-seven "rediscoveries" scoring** — keep, but label it as analysis, not a finding.

---

## Sources (all accessed 2026-09-01)

- https://techcrunch.com/2026/08/24/instincts-powerful-ai-assistant-is-raising-privacy-and-security-concerns/
- https://techcrunch.com/2026/08/26/viral-ai-startup-instinct-has-raised-350-million-at-a-2-5-billion-valuation/
- https://www.forbes.com/sites/iainmartin/2026/08/26/vcs-are-so-obsessed-with-this-ai-assistant-that-its-valuation-jumped-fivefold-in-weeks/
- https://x.com/illscience/status/2090456125858570702
- https://www.vellum.ai/blog/official-instinct-breakdown
- https://venturebeat.com/orchestration/spacexais-grok-bot-turns-agents-into-persistent-digital-coworkers-that-can-operate-your-apps-for-120-per-month
- https://x.ai/news/introducing-grok-bot
- https://docs.x.ai/grok-bot/overview
- https://docs.x.ai/grok-bot/computer-and-apps
- https://docs.x.ai/grok-bot/faq
- https://x.com/noahrshinn/status/2093368510449877180
- https://x.com/patrickc/status/2093385965905842566
- https://x.com/stripe/status/2093386783899910486
- https://x.com/sytaylor/status/2094346674911035447
- https://stripe.com/blog/giving-agents-the-ability-to-pay
- https://techcrunch.com/2026/04/30/stripe-link-digital-wallet-ai-agents-shopping/
- https://www.fintechbrainfood.com/p/paypal-53bn
- https://github.com/Merit-Systems/OpenInstinct
- https://github.com/samagra14/openinstinct
- https://github.com/CopilotKit/openbot
- https://explainx.ai/blog/copilotkit-openbot-open-source-grok-bot-august-2026
- https://browser-use.com/posts/bux-launch-blog
- https://venturebeat.com/technology/anthropic-launches-cowork-a-claude-desktop-agent-that-works-in-your-files-no
- https://support.claude.com/en/articles/14479288-claude-cowork-architecture-overview
- https://thenextweb.com/news/anthropic-claude-cowork-built-in-browser-dma-choice-screen
- https://www.cyberark.com/resources/robotic-process-automation/centrally-manage-and-secure-rpa-deployments-with-cyberark-and-uipath (301 → https://www.paloaltonetworks.com/idira)
- https://marketplace.uipath.com/listings/manage-orchestrator-credentials
- https://docs.uipath.com/orchestrator/automation-cloud/latest/user-guide/integrating-credential-stores
- https://docs.uipath.com/orchestrator/automation-cloud/latest/user-guide/storing-credentials-in-cyberark
- https://www.hfsresearch.com/research/how-to-make-sense-of-nonsensical-rpa-software-pricing/
- https://devops.com/rpa-reality-check-new-forrester-research-identifies-barriers-to-rpa-scalability/
- https://centricconsulting.com/blog/refocus-on-rpa-support-and-maintenance-to-avoid-a-bot-project-breakdown/
- https://idm.net.au/article/0013957-broken-bots-challenge-rpa-users
- https://fpa-trends.com/article/avoid-most-common-pitfalls-fpa-rpa-initiatives
