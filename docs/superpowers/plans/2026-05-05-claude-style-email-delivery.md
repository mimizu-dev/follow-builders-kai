# Claude-Style HTML Email Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Resend-based email delivery with Gmail SMTP via nodemailer, add a Claude/Anthropic-styled HTML email template, mailing list support, and a catch-up command for missed digests.

**Architecture:** A new `email-template.js` converts the plain-text digest to styled HTML (pure function, easy to test). `deliver.js` gains three exported helpers — `readMailingList`, `resolveRecipients`, `updateLastDelivered` — and replaces the Resend `sendEmail()` with `sendEmailLocal()` using nodemailer. All other delivery paths (stdout, Telegram) and the digest generation pipeline are untouched.

**Tech Stack:** Node.js (ES modules), nodemailer ^6, dotenv (already installed), Node built-in `assert` for tests.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `scripts/package.json` | Modify | Add nodemailer dependency |
| `scripts/email-template.js` | Create | Plain-text digest → Claude-styled HTML string |
| `scripts/test-email-template.js` | Create | Unit tests for email-template.js |
| `scripts/deliver.js` | Modify | Replace Resend with nodemailer; add mailing list + lastDeliveredAt |
| `scripts/test-deliver-helpers.js` | Create | Unit tests for readMailingList / resolveRecipients / updateLastDelivered |
| `config/config-schema.json` | Modify | Add lastDeliveredAt field; update email delivery docs |
| `SKILL.md` | Modify | Gmail onboarding; mailing list management; catch-up command |
| `README.md` | Modify | Remove Resend; add Gmail + mailing list + catch-up docs |
| `README.zh-CN.md` | Modify | Same in Chinese |

---

## Task 1: Add nodemailer dependency

**Files:**
- Modify: `scripts/package.json`

- [ ] **Step 1: Add nodemailer to package.json**

Replace the `dependencies` block in `scripts/package.json`:

```json
{
  "name": "follow-builders-scripts",
  "version": "1.0.0",
  "description": "Scripts for Follow Builders skill — feed generation, digest preparation, delivery",
  "type": "module",
  "scripts": {
    "generate-feed": "node generate-feed.js",
    "prepare-digest": "node prepare-digest.js"
  },
  "dependencies": {
    "dotenv": "^16.4.0",
    "nodemailer": "^6.9.0",
    "proper-lockfile": "^4.1.0"
  }
}
```

- [ ] **Step 2: Install the dependency**

```bash
cd scripts && npm install
```

Expected: `nodemailer` appears in `node_modules/` and `package-lock.json` is updated.

- [ ] **Step 3: Verify nodemailer is importable**

```bash
cd scripts && node -e "import('nodemailer').then(m => console.log('nodemailer version:', m.default.createTransport.toString().slice(0,30)))"
```

Expected: prints a line starting with `nodemailer version:` without errors.

- [ ] **Step 4: Commit**

```bash
git add scripts/package.json scripts/package-lock.json
git commit -m "chore: add nodemailer dependency"
```

---

## Task 2: Create email-template.js with tests

**Files:**
- Create: `scripts/email-template.js`
- Create: `scripts/test-email-template.js`

- [ ] **Step 1: Write the failing tests first**

Create `scripts/test-email-template.js`:

```js
import assert from 'assert';

// buildHtmlEmail doesn't exist yet — this file will fail to import.
// Run it now to confirm the failure before writing the implementation.
import { buildHtmlEmail } from './email-template.js';

// Test 1: subject extracted from first line
{
  const { subject } = buildHtmlEmail('AI Builders Digest — Monday, May 5, 2026\n');
  assert.strictEqual(subject, 'AI Builders Digest — Monday, May 5, 2026', 'subject from first line');
  console.log('✓ subject extracted from first line');
}

// Test 2: all-caps line → <h2>
{
  const { html } = buildHtmlEmail('AI Builders Digest — Monday, May 5, 2026\n\nX / TWITTER\n');
  assert.ok(html.includes('<h2'), 'all-caps line should produce h2');
  assert.ok(html.includes('X / TWITTER'), 'section label present in output');
  console.log('✓ all-caps line → h2');
}

// Test 3: URL line → <a> anchor with coral color
{
  const { html } = buildHtmlEmail('AI Builders Digest — Monday, May 5, 2026\n\nhttps://x.com/karpathy/status/123\n');
  assert.ok(html.includes('href="https://x.com/karpathy/status/123"'), 'URL becomes anchor href');
  assert.ok(html.includes('#D97757'), 'coral color applied to link');
  console.log('✓ URL line → coral anchor');
}

// Test 4: short non-URL non-caps line → <h3>
{
  const { html } = buildHtmlEmail('AI Builders Digest — Monday, May 5, 2026\n\nAndrej Karpathy\n');
  assert.ok(html.includes('<h3'), 'short line produces h3');
  assert.ok(html.includes('Andrej Karpathy'), 'name present in output');
  console.log('✓ short line → h3');
}

// Test 5: long body text → <p>
{
  const longLine = 'This is a long body text line that well exceeds the eighty character threshold set for name detection in the parser.';
  const { html } = buildHtmlEmail(`AI Builders Digest — Monday, May 5, 2026\n\n${longLine}\n`);
  assert.ok(html.includes(`<p style=`), 'long line produces p');
  assert.ok(html.includes(longLine.replace(/</g, '&lt;').replace(/>/g, '&gt;')), 'body text present');
  console.log('✓ long line → p');
}

// Test 6: HTML entities escaped (XSS prevention)
{
  const { html } = buildHtmlEmail('AI Builders Digest — Monday, May 5, 2026\n\n<script>alert("xss")</script>\n');
  assert.ok(!html.includes('<script>'), 'raw script tag must not appear');
  assert.ok(html.includes('&lt;script&gt;'), 'angle brackets must be escaped');
  console.log('✓ HTML entities escaped');
}

// Test 7: coral top bar present
{
  const { html } = buildHtmlEmail('AI Builders Digest — Monday, May 5, 2026\n');
  assert.ok(html.includes('#D97757'), 'coral color bar present');
  console.log('✓ coral top bar present');
}

// Test 8: dark header background present
{
  const { html } = buildHtmlEmail('AI Builders Digest — Monday, May 5, 2026\n');
  assert.ok(html.includes('#1A1A1A'), 'dark header color present');
  console.log('✓ dark header present');
}

// Test 9: off-white body background present
{
  const { html } = buildHtmlEmail('AI Builders Digest — Monday, May 5, 2026\n');
  assert.ok(html.includes('#F9F8F6'), 'off-white body background present');
  console.log('✓ off-white body background present');
}

// Test 10: catch-up subject line passes through correctly
{
  const { subject } = buildHtmlEmail('AI Builders Digest — Catch-Up (since May 2, 2026)\n');
  assert.strictEqual(subject, 'AI Builders Digest — Catch-Up (since May 2, 2026)');
  console.log('✓ catch-up subject line handled');
}

console.log('\nAll email-template tests passed!');
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd scripts && node test-email-template.js
```

Expected: error like `Cannot find module './email-template.js'` — confirms tests are running and will catch the missing implementation.

- [ ] **Step 3: Implement email-template.js**

Create `scripts/email-template.js`:

```js
const CORAL = '#D97757';
const DARK = '#1A1A1A';
const OFF_WHITE = '#F9F8F6';
const MUTED = '#6B6B6B';
const BORDER = '#E5E3DF';

export function buildHtmlEmail(digestText) {
  const lines = digestText.split('\n');
  const parts = [];
  let subject = '';
  let i = 0;

  if (lines[0] && lines[0].trim().startsWith('AI Builders Digest')) {
    subject = lines[0].trim();
    i = 1;
  } else {
    subject = `AI Builders Digest — ${new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    })}`;
  }

  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line === line.toUpperCase() && /[A-Z]/.test(line)) {
      parts.push(
        `<h2 style="font-family:-apple-system,sans-serif;font-size:11px;letter-spacing:0.1em;` +
        `text-transform:uppercase;color:${MUTED};border-bottom:1px solid ${BORDER};` +
        `padding-bottom:8px;margin:32px 0 16px;">${escapeHtml(line)}</h2>`
      );
    } else if (line.startsWith('http')) {
      parts.push(
        `<p style="margin:4px 0 12px;">` +
        `<a href="${escapeHtml(line)}" style="color:${CORAL};text-decoration:none;` +
        `font-family:monospace;font-size:13px;">→ ${escapeHtml(line)}</a></p>`
      );
    } else if (line.length <= 80) {
      parts.push(
        `<h3 style="font-family:-apple-system,sans-serif;font-size:18px;font-weight:700;` +
        `color:${DARK};margin:20px 0 6px;">${escapeHtml(line)}</h3>`
      );
    } else {
      parts.push(
        `<p style="font-family:-apple-system,sans-serif;font-size:16px;line-height:1.6;` +
        `color:${DARK};margin:0 0 12px;">${escapeHtml(line)}</p>`
      );
    }
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#EEECE8;">
  <div style="max-width:640px;margin:0 auto;">
    <div style="height:4px;background:${CORAL};"></div>
    <div style="background:${DARK};padding:28px 32px;">
      <p style="margin:0;font-family:-apple-system,sans-serif;font-size:22px;font-weight:700;color:#FFFFFF;">${escapeHtml(subject)}</p>
    </div>
    <div style="background:${OFF_WHITE};padding:32px;">
      ${parts.join('\n      ')}
    </div>
    <div style="background:${DARK};padding:20px 32px;text-align:center;">
      <p style="margin:0;font-family:-apple-system,sans-serif;font-size:12px;color:${MUTED};">
        Generated by <a href="https://github.com/zarazhangrui/follow-builders" style="color:${MUTED};">Follow Builders</a>
      </p>
    </div>
    <div style="height:2px;background:${CORAL};"></div>
  </div>
</body>
</html>`;

  return { html, subject };
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd scripts && node test-email-template.js
```

Expected output:
```
✓ subject extracted from first line
✓ all-caps line → h2
✓ URL line → coral anchor
✓ short line → h3
✓ long line → p
✓ HTML entities escaped
✓ coral top bar present
✓ dark header present
✓ off-white body background present
✓ catch-up subject line handled

All email-template tests passed!
```

- [ ] **Step 5: Commit**

```bash
git add scripts/email-template.js scripts/test-email-template.js
git commit -m "feat: add Claude-styled HTML email template"
```

---

## Task 3: Update deliver.js — Gmail SMTP, mailing list, lastDeliveredAt

**Files:**
- Modify: `scripts/deliver.js`
- Create: `scripts/test-deliver-helpers.js`

- [ ] **Step 1: Write failing tests for the new helper functions**

Create `scripts/test-deliver-helpers.js`:

```js
import assert from 'assert';
import { writeFile, mkdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// These exports don't exist yet — import will fail until Task 3 Step 3 is done.
import { readMailingList, resolveRecipients, updateLastDelivered } from './deliver.js';

const TMP = join(tmpdir(), 'fb-test-' + Date.now());
await mkdir(TMP, { recursive: true });

// Test 1: readMailingList reads addresses, ignores comments and blank lines
{
  const file = join(TMP, 'list1.txt');
  await writeFile(file, 'alice@example.com\n# comment\nbob@example.com\n\n  \n');
  const result = await readMailingList(file);
  assert.deepStrictEqual(result, ['alice@example.com', 'bob@example.com']);
  console.log('✓ readMailingList: reads addresses, ignores comments and blanks');
}

// Test 2: readMailingList returns [] for missing file
{
  const result = await readMailingList(join(TMP, 'nonexistent.txt'));
  assert.deepStrictEqual(result, []);
  console.log('✓ readMailingList: returns [] for missing file');
}

// Test 3: resolveRecipients uses mailing list when it has entries
{
  const file = join(TMP, 'list2.txt');
  await writeFile(file, 'alice@example.com\nbob@example.com\n');
  const result = await resolveRecipients(file, 'fallback@example.com');
  assert.deepStrictEqual(result, ['alice@example.com', 'bob@example.com']);
  console.log('✓ resolveRecipients: uses mailing list when populated');
}

// Test 4: resolveRecipients falls back to configEmail when list is empty
{
  const file = join(TMP, 'list3.txt');
  await writeFile(file, '# only comments\n\n');
  const result = await resolveRecipients(file, 'fallback@example.com');
  assert.deepStrictEqual(result, ['fallback@example.com']);
  console.log('✓ resolveRecipients: falls back to configEmail when list is empty');
}

// Test 5: resolveRecipients returns [] when both sources are empty
{
  const result = await resolveRecipients(join(TMP, 'nonexistent.txt'), null);
  assert.deepStrictEqual(result, []);
  console.log('✓ resolveRecipients: returns [] when both empty');
}

// Test 6: updateLastDelivered writes lastDeliveredAt to config
{
  const configFile = join(TMP, 'config.json');
  await writeFile(configFile, JSON.stringify({ language: 'en', delivery: { method: 'email' } }));
  await updateLastDelivered(configFile);
  const updated = JSON.parse(await (await import('fs/promises')).readFile(configFile, 'utf-8'));
  assert.ok(updated.lastDeliveredAt, 'lastDeliveredAt should be set');
  assert.ok(!isNaN(new Date(updated.lastDeliveredAt).getTime()), 'lastDeliveredAt should be a valid ISO date');
  assert.strictEqual(updated.language, 'en', 'existing fields should be preserved');
  console.log('✓ updateLastDelivered: writes timestamp, preserves existing fields');
}

// Test 7: updateLastDelivered is non-fatal on bad config path
{
  await updateLastDelivered(join(TMP, 'no-such-dir', 'config.json'));
  console.log('✓ updateLastDelivered: non-fatal on write failure');
}

// Cleanup
await rm(TMP, { recursive: true });

console.log('\nAll deliver-helpers tests passed!');
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd scripts && node test-deliver-helpers.js
```

Expected: error about missing exports from `deliver.js` — confirms the test runner works.

- [ ] **Step 3: Replace deliver.js with the updated implementation**

Overwrite `scripts/deliver.js` with the full updated content:

```js
#!/usr/bin/env node

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { config as loadEnv } from 'dotenv';

const USER_DIR = join(homedir(), '.follow-builders');
const CONFIG_PATH = join(USER_DIR, 'config.json');
const ENV_PATH = join(USER_DIR, '.env');
const MAILING_LIST_PATH = join(USER_DIR, 'mailing-list.txt');

async function getDigestText() {
  const args = process.argv.slice(2);

  const msgIdx = args.indexOf('--message');
  if (msgIdx !== -1 && args[msgIdx + 1]) {
    return args[msgIdx + 1];
  }

  const fileIdx = args.indexOf('--file');
  if (fileIdx !== -1 && args[fileIdx + 1]) {
    return await readFile(args[fileIdx + 1], 'utf-8');
  }

  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function sendTelegram(text, botToken, chatId) {
  const MAX_LEN = 4000;
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= MAX_LEN) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf('\n', MAX_LEN);
    if (splitAt < MAX_LEN * 0.5) splitAt = MAX_LEN;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }

  for (const chunk of chunks) {
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: chunk,
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        })
      }
    );

    if (!res.ok) {
      const err = await res.json();
      if (err.description && err.description.includes("can't parse")) {
        await fetch(
          `https://api.telegram.org/bot${botToken}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: chunk,
              disable_web_page_preview: true
            })
          }
        );
      } else {
        throw new Error(`Telegram API error: ${err.description}`);
      }
    }

    if (chunks.length > 1) await new Promise(r => setTimeout(r, 500));
  }
}

export async function readMailingList(filePath) {
  try {
    const content = await readFile(filePath, 'utf-8');
    return content
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.startsWith('#'));
  } catch {
    return [];
  }
}

export async function resolveRecipients(mailingListPath, configEmail) {
  const fromList = await readMailingList(mailingListPath);
  if (fromList.length > 0) return fromList;
  if (configEmail) return [configEmail];
  return [];
}

export async function updateLastDelivered(configPath) {
  try {
    let cfg = {};
    if (existsSync(configPath)) {
      cfg = JSON.parse(await readFile(configPath, 'utf-8'));
    }
    cfg.lastDeliveredAt = new Date().toISOString();
    await writeFile(configPath, JSON.stringify(cfg, null, 2));
  } catch {
    // non-fatal: timestamp write failure must not break delivery
  }
}

async function sendEmailLocal(text, gmailUser, appPassword, recipients) {
  const { default: nodemailer } = await import('nodemailer');
  const { buildHtmlEmail } = await import('./email-template.js');

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: gmailUser, pass: appPassword }
  });

  const { html, subject } = buildHtmlEmail(text);
  const results = { sent: 0, failed: 0, errors: [] };

  for (const to of recipients) {
    try {
      await transporter.sendMail({
        from: `AI Builders Digest <${gmailUser}>`,
        to,
        subject,
        html,
        text
      });
      results.sent++;
    } catch (err) {
      results.failed++;
      results.errors.push(`${to}: ${err.message}`);
    }
  }

  return results;
}

async function main() {
  loadEnv({ path: ENV_PATH });

  let config = {};
  if (existsSync(CONFIG_PATH)) {
    config = JSON.parse(await readFile(CONFIG_PATH, 'utf-8'));
  }

  const delivery = config.delivery || { method: 'stdout' };
  const digestText = await getDigestText();

  if (!digestText || digestText.trim().length === 0) {
    console.log(JSON.stringify({ status: 'skipped', reason: 'Empty digest text' }));
    return;
  }

  try {
    switch (delivery.method) {
      case 'telegram': {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = delivery.chatId;
        if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN not found in .env');
        if (!chatId) throw new Error('delivery.chatId not found in config.json');
        await sendTelegram(digestText, botToken, chatId);
        console.log(JSON.stringify({
          status: 'ok',
          method: 'telegram',
          message: 'Digest sent to Telegram'
        }));
        break;
      }

      case 'email': {
        const gmailUser = process.env.GMAIL_USER;
        const appPassword = process.env.GMAIL_APP_PASSWORD;
        if (!gmailUser) throw new Error('GMAIL_USER not found in .env');
        if (!appPassword) throw new Error(
          'GMAIL_APP_PASSWORD not found in .env. ' +
          'Generate one at: Google Account → Security → 2-Step Verification → App passwords'
        );

        const recipients = await resolveRecipients(MAILING_LIST_PATH, delivery.email);
        if (recipients.length === 0) {
          throw new Error(
            'No recipients configured. ' +
            'Add addresses to ~/.follow-builders/mailing-list.txt or set delivery.email in config.json'
          );
        }

        const results = await sendEmailLocal(digestText, gmailUser, appPassword, recipients);
        await updateLastDelivered(CONFIG_PATH);

        if (results.failed === 0) {
          console.log(JSON.stringify({
            status: 'ok',
            method: 'email',
            sent: results.sent,
            message: `Digest sent to ${results.sent} recipient(s)`
          }));
        } else {
          console.log(JSON.stringify({
            status: 'partial',
            method: 'email',
            sent: results.sent,
            failed: results.failed,
            errors: results.errors
          }));
        }
        break;
      }

      case 'stdout':
      default:
        console.log(digestText);
        break;
    }
  } catch (err) {
    console.log(JSON.stringify({
      status: 'error',
      method: delivery.method,
      message: err.message
    }));
    process.exit(1);
  }
}

main();
```

- [ ] **Step 4: Run the helper tests to verify they pass**

```bash
cd scripts && node test-deliver-helpers.js
```

Expected output:
```
✓ readMailingList: reads addresses, ignores comments and blanks
✓ readMailingList: returns [] for missing file
✓ resolveRecipients: uses mailing list when populated
✓ resolveRecipients: falls back to configEmail when list is empty
✓ resolveRecipients: returns [] when both empty
✓ updateLastDelivered: writes timestamp, preserves existing fields
✓ updateLastDelivered: non-fatal on write failure

All deliver-helpers tests passed!
```

- [ ] **Step 5: Smoke-test stdout delivery still works**

```bash
cd scripts && echo "AI Builders Digest — Monday, May 5, 2026

X / TWITTER

Test Builder
Test summary line that is long enough to be body text and not treated as a heading.
https://x.com/test/status/123" | node deliver.js
```

Expected: the digest text prints to stdout unchanged (no error, no JSON).

- [ ] **Step 6: Commit**

```bash
git add scripts/deliver.js scripts/test-deliver-helpers.js
git commit -m "feat: replace Resend with nodemailer Gmail SMTP and add mailing list support"
```

---

## Task 4: Update config-schema.json

**Files:**
- Modify: `config/config-schema.json`

- [ ] **Step 1: Update the schema**

Replace the entire contents of `config/config-schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "description": "User configuration for Follow Builders skill. Stored at ~/.follow-builders/config.json",
  "type": "object",
  "properties": {
    "platform": {
      "type": "string",
      "enum": ["openclaw", "other"],
      "description": "Detected platform: openclaw or other (Claude Code, Cursor, Hermes Agents, etc.)"
    },
    "language": {
      "type": "string",
      "enum": ["en", "zh", "bilingual"],
      "default": "en",
      "description": "Digest language: en (English), zh (Chinese), bilingual (both)"
    },
    "timezone": {
      "type": "string",
      "default": "America/Los_Angeles",
      "description": "IANA timezone string for scheduling (e.g. America/New_York, Asia/Shanghai)"
    },
    "frequency": {
      "type": "string",
      "enum": ["daily", "weekly"],
      "default": "daily",
      "description": "How often to deliver the digest"
    },
    "deliveryTime": {
      "type": "string",
      "default": "08:00",
      "description": "Time of day to deliver digest in HH:MM format (24-hour)"
    },
    "weeklyDay": {
      "type": "string",
      "enum": ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
      "default": "monday",
      "description": "Day of week for weekly digests (only used when frequency is weekly)"
    },
    "delivery": {
      "type": "object",
      "description": "How the digest is delivered to the user",
      "properties": {
        "method": {
          "type": "string",
          "enum": ["stdout", "telegram", "email"],
          "default": "stdout",
          "description": "Delivery method: stdout (terminal/agent), telegram (bot message), email (via Gmail SMTP)"
        },
        "chatId": {
          "type": "string",
          "description": "Telegram chat ID (only for telegram method)"
        },
        "email": {
          "type": "string",
          "description": "Fallback email address if ~/.follow-builders/mailing-list.txt is empty (only for email method)"
        }
      }
    },
    "lastDeliveredAt": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 timestamp of last successful email delivery. Written automatically by deliver.js. Used by catch-up mode to compute how many days were missed."
    },
    "onboardingComplete": {
      "type": "boolean",
      "default": false,
      "description": "Whether the user has completed initial setup"
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add config/config-schema.json
git commit -m "chore: update config schema — add lastDeliveredAt, update email delivery docs"
```

---

## Task 5: Update SKILL.md

**Files:**
- Modify: `SKILL.md`

There are four distinct sections to update. Apply each edit in order.

- [ ] **Step 1: Replace the Email delivery instructions in Step 3**

Find this block in SKILL.md (around "**If they choose Email:**"):

```
**If they choose Email:**
Ask for their email address.
Then they need a Resend API key:
1. Go to https://resend.com
2. Sign up (free tier gives 100 emails/day — more than enough)
3. Go to API Keys in the dashboard
4. Create a new key and copy it

Add the key to the .env file.
```

Replace it with:

```
**If they choose Email:**
Ask for their Gmail address.

Then walk them through creating a Gmail App Password (this is different from their regular Gmail password — it's a dedicated 16-character password for apps):
1. Go to myaccount.google.com
2. Click Security → 2-Step Verification (must already be enabled)
3. Scroll to the bottom and click "App passwords"
4. Select app: "Mail", device: "Other (Custom name)" → enter "Follow Builders"
5. Click Generate — copy the 16-character password shown

Ask for initial mailing list recipients:
"Who should receive this digest? Enter one email address per line (press Enter twice when done — it can be just you)."

Collect the addresses and write them to ~/.follow-builders/mailing-list.txt (one per line).
```

- [ ] **Step 2: Replace the .env file template in Step 5**

Find this block in SKILL.md (in Step 5: API Keys):

```bash
mkdir -p ~/.follow-builders
cat > ~/.follow-builders/.env << 'ENVEOF'
# Telegram bot token (only if using Telegram delivery)
# TELEGRAM_BOT_TOKEN=paste_your_token_here

# Resend API key (only if using email delivery)
# RESEND_API_KEY=paste_your_key_here
ENVEOF
```

Replace it with:

```bash
mkdir -p ~/.follow-builders
cat > ~/.follow-builders/.env << 'ENVEOF'
# Gmail credentials for email delivery
# GMAIL_USER=your.address@gmail.com
# GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx

# Telegram bot token (only if using Telegram delivery)
# TELEGRAM_BOT_TOKEN=paste_your_token_here
ENVEOF
```

Also update the surrounding explanatory text: replace any mention of `RESEND_API_KEY` with `GMAIL_APP_PASSWORD`.

- [ ] **Step 3: Add Mailing List Changes to the Configuration Handling section**

Find the `### Delivery Changes` section. After it, add a new subsection:

```markdown
### Mailing List Changes
- "Add [email] to my digest list" / "Add [email] to the mailing list" → append the address as a new line to `~/.follow-builders/mailing-list.txt`
- "Remove [email] from my digest list" → delete the matching line from `~/.follow-builders/mailing-list.txt`
- "Who's on my mailing list?" / "Show my mailing list" → read and display `~/.follow-builders/mailing-list.txt`, skipping comment lines
```

- [ ] **Step 4: Add catch-up mode to the Manual Trigger section**

Find the `## Manual Trigger` section at the end of SKILL.md. After the existing content, add:

```markdown
### Catch-Up Mode

When the user says `/ai catch-up`, "send me what I missed", "catch me up", or similar:

1. Read `lastDeliveredAt` from `~/.follow-builders/config.json`
2. If set, compute days missed:
   ```js
   Math.floor((Date.now() - new Date(lastDeliveredAt)) / 86400000)
   ```
3. Tell the user: "You've missed approximately N day(s) of digests (since [date in readable format]). Fetching everything available now..."
4. Run the full digest workflow (Steps 2–6) — the central feed surfaces content not yet in `state-feed.json` automatically
5. In the digest, use the catch-up header on the first line:
   `AI Builders Digest — Catch-Up (since [Month D, YYYY])`
6. Deliver via the normal email path and update `lastDeliveredAt`

**Note:** The central feed keeps approximately 7 days of history. Content older than that is permanently unavailable from the feed. Tell the user if the gap exceeds 7 days: "The feed only keeps ~7 days of history, so some older content may not be available."
```

- [ ] **Step 5: Commit**

```bash
git add SKILL.md
git commit -m "feat: update SKILL.md — Gmail onboarding, mailing list management, catch-up command"
```

---

## Task 6: Update README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the Quick Start delivery option**

Find this line in the Quick Start section:

```
- How you want it delivered (Telegram, email, or in-chat)
```

Replace with:

```
- How you want it delivered (Telegram, Gmail email, or in-chat)
```

- [ ] **Step 2: Update the Privacy section**

Find:

```
- If you use Telegram/email delivery, those keys are stored locally in `~/.follow-builders/.env`
```

Replace with:

```
- If you use Telegram/email delivery, credentials are stored locally in `~/.follow-builders/.env` (Gmail app password or Telegram bot token — never your main password)
- Email recipients are stored locally in `~/.follow-builders/mailing-list.txt`
```

- [ ] **Step 3: Add a Catch-Up section before the Privacy section**

Add the following new section before `## Privacy`:

```markdown
## Catch-Up for Missed Digests

If your machine is off when a scheduled digest runs, type `/ai catch-up` to get
a digest covering all content you missed since your last delivery. The central
feed keeps approximately 7 days of history — content older than that cannot
be recovered.

```

- [ ] **Step 4: Update "What You Get" to mention mailing list**

Find:

```
A daily or weekly digest delivered to your preferred messaging app (Telegram, Discord,
WhatsApp, etc.) with:
```

Replace with:

```
A daily or weekly digest delivered to your preferred messaging app (Telegram, Discord,
WhatsApp, etc.) or via Gmail to a mailing list of your choice. Works on Windows,
macOS, and Linux. Includes:
```

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: update README — Gmail delivery, mailing list, catch-up command"
```

---

## Task 7: Update README.zh-CN.md

**Files:**
- Modify: `README.zh-CN.md`

- [ ] **Step 1: Update the Quick Start delivery line**

Find:

```
- 推送方式（Telegram、邮件或直接在聊天中显示）
```

Replace with:

```
- 推送方式（Telegram、Gmail 邮件或直接在聊天中显示）
```

- [ ] **Step 2: Update the Privacy section**

Find:

```
- 如果你使用 Telegram/邮件推送，相关 key 仅存储在本地 `~/.follow-builders/.env`
```

Replace with:

```
- 如果你使用 Telegram/邮件推送，相关凭证仅存储在本地 `~/.follow-builders/.env`（Gmail 应用专用密码或 Telegram bot token——不是你的主密码）
- 邮件收件人列表仅存储在本地 `~/.follow-builders/mailing-list.txt`
```

- [ ] **Step 3: Update "What You Get" to mention mailing list**

Find:

```
每日或每周推送到你常用的通讯工具（Telegram、Discord、WhatsApp 等），包含：
```

Replace with:

```
每日或每周推送到你常用的通讯工具（Telegram、Discord、WhatsApp 等）或通过 Gmail 发送到你自定义的邮件列表。支持 Windows、macOS 和 Linux。内容包含：
```

- [ ] **Step 4: Add catch-up section before the Privacy section**

Add before `## 隐私`:

```markdown
## 补发错过的摘要

如果你的设备在计划推送时间处于关机状态，可以输入 `/ai catch-up` 来获取自上次推送以来所有错过的内容。中心化 feed 保留约 7 天的历史记录——超过这个时间范围的内容无法找回。

```

- [ ] **Step 5: Commit**

```bash
git add README.zh-CN.md
git commit -m "docs: update Chinese README — Gmail delivery, mailing list, catch-up command"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task that covers it |
|-----------------|-------------------|
| Replace Resend with nodemailer + Gmail SMTP | Task 3 |
| Claude-styled HTML email template | Task 2 |
| Mailing list (`mailing-list.txt`) | Task 3 (resolveRecipients) |
| Per-recipient send loop | Task 3 (sendEmailLocal) |
| lastDeliveredAt tracking | Task 3 (updateLastDelivered) |
| `config-schema.json` update | Task 4 |
| Gmail onboarding in SKILL.md | Task 5 Step 1 & 2 |
| Mailing list management via conversation | Task 5 Step 3 |
| Catch-up command in SKILL.md | Task 5 Step 4 |
| README.md updates | Task 6 |
| README.zh-CN.md updates | Task 7 |
| nodemailer in package.json | Task 1 |

All spec requirements are covered.

**Placeholder scan:** No TBD, TODO, or incomplete steps found. All code blocks are complete.

**Type consistency check:**
- `readMailingList(filePath)` → `string[]` — defined Task 3 Step 3, used in Task 3 Step 3 (`resolveRecipients`) and tested in Task 3 Step 1
- `resolveRecipients(mailingListPath, configEmail)` → `string[]` — defined Task 3 Step 3, tested Task 3 Step 1
- `updateLastDelivered(configPath)` → `void` — defined Task 3 Step 3, tested Task 3 Step 1
- `buildHtmlEmail(digestText)` → `{ html: string, subject: string }` — defined Task 2 Step 3, consumed in Task 3 Step 3 (`sendEmailLocal`)
- All names consistent across tasks.
