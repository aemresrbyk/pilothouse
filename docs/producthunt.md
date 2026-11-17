# Product Hunt launch kit

Follows Product Hunt's [Launch Guide](https://help.producthunt.com/en/collections/19793093-launch-guide), [Featuring Guidelines](https://help.producthunt.com/en/articles/9883485-product-hunt-featuring-guidelines) and [Community Guidelines](https://help.producthunt.com/en/articles/3615694-community-guidelines) (read 2026-11-17).

## Product page fields

| Field (limit) | Value |
|---|---|
| Product link | https://usepilothouse.com (direct, no shortener) |
| Name (40) | Pilothouse |
| Tagline (60, no hype) | One window for your coding agents. Approve from your phone. (59) |
| Logo (240×240, ≤2 MB) | [`media/producthunt/logo-240.png`](media/producthunt/logo-240.png) |
| Gallery (1270×760, 3+) | [`media/producthunt`](media/producthunt) gallery-1 … gallery-5 (2540×1520, same ratio). Made from usepilothouse.com so they match the app; regenerate with the headless-Chrome capture after site changes. |
| Video | optional: 30–45 s screen recording, agent asks → phone buzzes → approve → done |
| Launch tags (max 3) | Developer Tools, Artificial Intelligence, Open Source |
| Pricing | Free |
| Role | I made this |
| Links | https://github.com/aemresrbyk/pilothouse · App Store link once approved |

**Description (500):**

Pilothouse runs Claude Code, Codex, Gemini CLI, Antigravity and opencode side by side in real terminal tabs, with your own models and flags. Everything they ask lands in one Inbox. Step away and keep going from the iPhone app or any browser: live terminal, approvals, diffs, end-to-end encrypted, no account. Hand work to another agent when one hits its limit, or let two debate a plan. Free, open source (MIT), collects nothing.

## Maker comment (5,000; ask for feedback, never for upvotes)

Hi Product Hunt! I'm Ali, and I built Pilothouse because I kept losing track of which coding agent was waiting for me.

**What it does**
- Every project gets a real terminal tab running the agent you pick (Claude Code, Codex, Gemini CLI, Antigravity, opencode), with your own models and flags.
- Everything they ask lands in one Inbox. Risky commands (rm -rf, force-push, deploy) take two taps.
- Away from the desk: scan one QR code and use the iPhone app or usepilothouse.com/app. Live terminal, approvals and diffs, end-to-end encrypted through a relay that can't read anything.
- Hit a plan limit? Hand the work to another agent with the context. Not sure about an approach? Let two agents debate it and write the decision.
- Voice: talk to your agent, or brainstorm out loud and have it write SPEC.md.

**Who it's for:** anyone running more than one coding agent, or one agent for long tasks.

**What's different:** it works with every terminal agent instead of one, it's free and MIT licensed, needs no account, and never touches your agents' logins. Security details: https://usepilothouse.com/security.html

**I'd love your feedback on one thing:** what makes you get up and walk back to your desk when an agent is working? That's what I want Pilothouse to remove next.

## Launch plan

- **Date:** Tuesday 2026-12-01 (avoids US Thanksgiving week). Goes live 12:01 AM Pacific = 11:01 Istanbul; be online for the first hours and Pacific morning (≈ 18:00–22:00 Istanbul).
- **Schedule** up to 30 days ahead; scheduled launches are reviewed, so schedule only when every field above is filled. Use "Create draft" until then.
- **Before scheduling:** the product works in production (download, first run, pairing, App Store link live); test in a clean browser; maker comment ready.
- **Weeks before:** be active on Product Hunt (comment on launches, forums); tell people who already use it.
- **Launch day:** reply to every comment; share the link where you are already active (X, LinkedIn, r/ClaudeAI only if you post there) asking people to try it and leave feedback. Add the Product Hunt badge to usepilothouse.com.
- **Never:** ask for upvotes, giveaways tied to upvotes, paid votes/comments, mass DMs, extra accounts, a company account.
- **Goal:** e.g. 200 downloads and 50 GitHub stars from the launch; turn feedback into the next release.
- **Relaunch:** only after a major update; within two months of a launch it needs a relaunch request.

## Featuring (editorial, not guaranteed)

- Judged on **Useful, Novel, High Craft, Creative**; a launch can spike in one or two. Lead with what's novel: one Inbox across every agent, approve from the phone with a security-code pairing, hand-off and debate between agents.
- **Only products available now.** On launch day the desktop download, the web app and the **App Store listing** must all be live (TestFlight or "in review" doesn't count). If the App Store review isn't through by 2026-11-29, move the date rather than launch without it, or drop the iPhone from the tagline.
- Not featured: waitlists, templates/boilerplates, services, vaporware, "minimal, undifferentiated products" chasing money. Free + open source + no account is on our side.
- Contacting the team rarely helps; only for critical missing information (hello@producthunt.com).

## Profile (Community Guidelines)

The maker account must look like a person: first and last name, a clear photo of yourself, a headline/about, a personal (non-company) username. No brand account as maker.

## Launch day rules (Community Guidelines)

- No asking for upvotes anywhere (posts, DMs, groups), no mass messages, no bots, no incentives. Say "we launched today, I'd love your feedback".
- Don't self-promote in other launches' comments; reply to questions in ours with facts.
- Breaking these can remove the launch or suspend the account.

## Badge (after launch)

Post page (as maker) → arrow next to the title → **Embed** → pick the theme; once ranked, the "Featured" / "Top Post" variants appear. Put it in the usepilothouse.com footer linking to the product page (not phrased as an upvote request).


## Pre-launch forum threads (post from your own account, answer every reply the same day)

1. **Now, `p/introduce-yourself`** (plain B1–B2 English, written as yourself):

   **Title:** Hi from Turkey, first post here

   Hi everyone, I'm Ali. I studied electrical engineering and I live in Turkey. I make small puzzle games at Kitefold Games, and sometimes I build tools for myself when I need them.

   These days I use Claude Code and Codex a lot. My problem was simple: I start 3 or 4 agents in different projects, I go make a coffee, and when I come back one of them was waiting for my "yes" for 15 minutes. So I started building a small app for this. It shows all my agents in one window and I can answer them from my phone too. It's called Pilothouse, it's free and open source, and I want to launch it here soon.

   I never launched on Product Hunt before, so two questions:
   - What do you wish you knew before your first launch?
   - If you use coding agents, what annoys you the most?

   Thanks for reading :)

2. **2–3 days later, `p/vibecoding`:** "How do you know when your coding agent is waiting for you?" Ask how people notice approvals across several agents (notifications, tmux, auto-approve and where they draw the line). Don't mention Pilothouse unless someone asks.

3. **Nov 28–29, `p/self-promotion`:** "Launching Pilothouse on Dec 1: which tagline is clearer?" A) "One window for your coding agents. Approve from your phone." B) "Never miss an agent waiting for your approval." Ask for feedback on usepilothouse.com. No upvote ask.
