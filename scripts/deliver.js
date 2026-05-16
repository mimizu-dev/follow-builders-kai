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
      if (err.responseCode === 535 || /Invalid login|authentication failed/i.test(err.message)) {
        throw new Error(
          'Gmail authentication failed. Check GMAIL_USER and GMAIL_APP_PASSWORD in ' +
          '~/.follow-builders/.env. App passwords require 2FA to be enabled on your Google account. ' +
          'Generate one at: Google Account → Security → 2-Step Verification → App passwords'
        );
      }
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

        if (results.failed === 0) {
          await updateLastDelivered(CONFIG_PATH);
          console.log(JSON.stringify({
            status: 'ok',
            method: 'email',
            sent: results.sent,
            message: `Digest sent to ${results.sent} recipient(s)`
          }));
        } else if (results.sent > 0) {
          await updateLastDelivered(CONFIG_PATH);
          console.log(JSON.stringify({
            status: 'partial',
            method: 'email',
            sent: results.sent,
            failed: results.failed,
            errors: results.errors
          }));
        } else {
          console.log(JSON.stringify({
            status: 'error',
            method: 'email',
            sent: 0,
            failed: results.failed,
            errors: results.errors
          }));
          process.exit(1);
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

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main();
}
