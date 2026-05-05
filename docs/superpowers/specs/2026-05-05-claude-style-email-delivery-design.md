# Claude-Style HTML Email Delivery with Gmail SMTP + Mailing List

**Date:** 2026-05-05
**Status:** Approved

## Overview

Replace the current Resend-based email delivery in follow-builders-kai with a local Gmail SMTP solution using `nodemailer`. Add a Claude/Anthropic-styled HTML email template and mailing list support. The change is a pure presentation and delivery layer — digest generation, Telegram delivery, and stdout delivery are untouched.

**Platform context:** The tool runs on a Windows 11 NUC via Hermes Agents (a local agent framework). Gmail SMTP is the target SMTP provider — free, no paid API key, uses the user's existing Gmail account with an app password.

## Architecture

### What Changes

```
[Unchanged]                          [Changed]
prepare-digest.js ──► Agent remix ──► deliver.js
                                         │
                          ┌──────────────┼──────────────┐
                          │              │              │
                       stdout         telegram        email (new)
                       (unchanged)    (unchanged)        │
                                                    nodemailer
                                                    + Gmail SMTP
                                                         │
                                                  email-template.js
                                                  (HTML renderer)
                                                         │
                                               mailing-list.txt
                                               (all recipients)
```

### Files Modified

| File | Change |
|------|--------|
| `scripts/deliver.js` | Replace `sendEmail()` (Resend) with `sendEmailLocal()` (nodemailer + mailing list loop) |
| `scripts/email-template.js` | New — converts plain-text digest to Claude-styled HTML |
| `scripts/package.json` | Add `nodemailer` dependency |
| `config/config-schema.json` | Update email delivery field docs (remove Resend reference), add `lastDeliveredAt` field |
| `SKILL.md` | Update Step 3 onboarding: Gmail app password setup instead of Resend |
| `README.md` | Update delivery section to reflect Gmail SMTP + mailing list |
| `README.zh-CN.md` | Same updates in Chinese |

### Files Untouched

`prepare-digest.js`, all `prompts/`, Telegram delivery logic, stdout delivery logic, cron setup, `config.json` structure, `feed-*.json`.

## HTML Email Template (`email-template.js`)

### Visual Design — Claude Aesthetic

- **Top border:** 4px coral/orange bar (`#D97757`) — Claude brand accent
- **Header:** Dark background (`#1A1A1A`), white title + date, generous padding
- **Body:** Off-white background (`#F9F8F6`), dark text (`#1A1A1A`), 16px body font
- **Section labels:** Small caps, muted color (`#6B6B6B`), bottom border divider
- **Builder names:** Bold, 18px
- **Source links:** Coral colored (`#D97757`), prefixed with `→`
- **Footer:** Muted text, link to Follow Builders skill repo
- **CSS:** All inline (required for email client compatibility — no external stylesheets)

### Parsing Strategy

`email-template.js` parses the plain-text digest with simple line-by-line rules applied in order:

1. All-caps lines (e.g. `X / TWITTER`, `PODCASTS`, `OFFICIAL BLOGS`) → `<h2>` section headers
2. Lines starting with `http` → `<a>` coral-colored source link, wrapped in a `<p>`
3. Short lines (≤ 80 chars) that are non-empty, don't start with `http`, and are not all-caps → `<h3>` name heading (covers builder names and podcast titles)
4. All other non-empty lines → `<p>` body text
5. Empty lines → close current block (no explicit `<br>`)

This heuristic works because the digest format is consistent: section headers are all-caps, builder/podcast names are short standalone lines, body text is multi-sentence paragraphs, and URLs are always on their own line.

Outputs a self-contained HTML string passed directly to nodemailer as `html:`.
A plain-text fallback (`text:`) is also set to the original digest text for email clients that don't render HTML.

## Gmail SMTP Configuration

### Credentials

Stored in `~/.follow-builders/.env`:
```
GMAIL_USER=your.address@gmail.com
GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
```

App passwords are generated at: Google Account → Security → 2-Step Verification → App passwords. Requires 2FA to be enabled on the Gmail account.

### Nodemailer Transport

```js
{
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD }
}
```

### Email Metadata

- **From:** `AI Builders Digest <GMAIL_USER>`
- **To:** Each recipient individually (not BCC-all)
- **Subject:** `AI Builders Digest — [Day], [Month DD], [YYYY]`
- **Content-Type:** `text/html` (with `text/plain` fallback)

## Mailing List

### File Format

`~/.follow-builders/mailing-list.txt` — one address per line, `#` prefixes ignored:
```
alice@example.com
bob@example.com
# carol is on vacation
```

### Recipient Resolution

At send time, `deliver.js` resolves recipients in this order:
1. Read `~/.follow-builders/mailing-list.txt` — use all non-comment, non-empty lines
2. If file is missing or empty, fall back to `config.delivery.email` (single address, backward compatible)
3. If both are empty/missing, exit with a clear error

### Agent Interaction

The agent can manage the mailing list through conversation:
- "Add bob@example.com to my digest list" → append line to `mailing-list.txt`
- "Remove alice@example.com" → delete that line from `mailing-list.txt`
- "Who's on my mailing list?" → read and display `mailing-list.txt`

SKILL.md Configuration Handling section gets a new "Mailing List Changes" entry.

## Error Handling

### Per-recipient failures

Send to all recipients; collect errors. On partial failure:
```json
{ "status": "partial", "sent": 2, "failed": 1, "errors": ["bob@example.com: Mailbox not found"] }
```
On full success:
```json
{ "status": "ok", "method": "email", "sent": 3, "message": "Digest sent to 3 recipients" }
```

### Gmail auth failure

Exit with a clear message: `Gmail authentication failed. Check GMAIL_USER and GMAIL_APP_PASSWORD in ~/.follow-builders/.env. App passwords require 2FA to be enabled on your Google account.`

### Empty mailing list

Exit with: `No recipients configured. Add addresses to ~/.follow-builders/mailing-list.txt or set delivery.email in config.json.`

### nodemailer not installed

Onboarding flow in SKILL.md runs `npm install` in `scripts/` during setup — `nodemailer` in `package.json` ensures it's always present after install.

## Onboarding Changes (SKILL.md)

Step 3 (Delivery Method) — Email branch replaces Resend instructions with:

1. Ask for Gmail address
2. Explain app password setup (Google Account → Security → 2-Step Verification → App passwords)
3. Write `GMAIL_USER` and `GMAIL_APP_PASSWORD` to `~/.follow-builders/.env`
4. Ask for initial mailing list recipients (can be just themselves)
5. Write addresses to `~/.follow-builders/mailing-list.txt`
6. Run `cd scripts && npm install` to ensure nodemailer is installed

## Manual Catch-Up (`/ai catch-up`)

### Problem

The NUC running Hermes Agents may not be on 24/7. When offline, scheduled digests are missed. The user needs a way to manually retrieve missed content when they return.

### Approach

Add a `/ai catch-up` command that generates and emails a catch-up digest on demand, covering all unseen content since the last successful delivery. Uses the existing `state-feed.json` deduplication mechanism — tweet IDs seen in past digests are already tracked there, so unseen content from the feed's rolling window (~7 days) surfaces naturally.

### Last Delivery Tracking

Add `lastDeliveredAt` (ISO 8601 timestamp) to `~/.follow-builders/config.json`, written by `deliver.js` on every successful email send:

```json
{
  "lastDeliveredAt": "2026-05-03T08:00:00.000Z"
}
```

### Catch-Up Digest Behavior

When the user says `/ai catch-up` or "send me what I missed":

1. Read `lastDeliveredAt` from config — compute days since last delivery
2. Run `prepare-digest.js` as normal (fetches current feed)
3. The feed already contains unseen content (not in `state-feed.json`) from the rolling window
4. Generate digest with a catch-up header: `"AI Builders Digest — Catch-Up (missed N days, since [date])"`
5. Deliver via the normal email path (mailing list)
6. Update `lastDeliveredAt` after successful delivery

### Feed Window Limitation

The central feed keeps a rolling ~7-day window. If the NUC is offline longer than that, content older than 7 days is permanently unavailable from the feed. The catch-up digest covers whatever is in the current window — not a guaranteed full history. This limitation is documented in the README.

### SKILL.md Addition

Add to the "Manual Trigger" section:

> **Catch-up mode:** If the user says `/ai catch-up`, "send me what I missed", or similar:
> 1. Read `lastDeliveredAt` from config.json and compute the gap
> 2. Tell the user: "You've missed N days of digests (since [date]). Fetching everything available now..."
> 3. Run the full digest workflow — the feed naturally surfaces unseen content
> 4. Use the catch-up header format in the digest title
> 5. Deliver via email as normal

## README Updates

Both `README.md` and `README.zh-CN.md` — update the "Delivery" / "Quick Start" section:
- Remove references to Resend and `RESEND_API_KEY`
- Add Gmail SMTP + app password setup instructions
- Add mailing list description (`mailing-list.txt`)
- Note Windows 11 compatibility
- Add catch-up command documentation: `/ai catch-up` for missed digests, with note on 7-day feed window limit
