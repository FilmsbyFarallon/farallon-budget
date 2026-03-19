#!/usr/bin/env node
/**
 * LinkedIn Post Runner — OpenClaw cron script
 *
 * Usage: node scripts/linkedin-post-runner.js
 *
 * Reads from: /Users/taylorvisual/.openclaw/workspace/memory/linkedin-queue.json
 * Posts to:   https://villagerpro.io/api/linkedin/post
 *
 * Queue file format:
 * [
 *   {
 *     "id": "unique-id",
 *     "date": "2026-03-18",       // ISO date — post fires on this day
 *     "text": "Post copy here",
 *     "imageUrl": "https://...",  // optional
 *     "status": "pending",        // "pending" | "posted" | "failed"
 *     "postedAt": null,           // set when posted
 *     "error": null               // set on failure
 *   }
 * ]
 */

const fs = require('fs');
const https = require('https');
const path = require('path');

const QUEUE_PATH = path.join(
  '/Users/taylorvisual/.openclaw/workspace/memory',
  'linkedin-queue.json',
);
const POST_URL = 'https://villagerpro.io/api/linkedin/post';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function todayISO() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD" in local time
}

function httpsPost(url, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const payload = JSON.stringify(body);
    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let parsed;
          try { parsed = JSON.parse(data); } catch { parsed = data; }
          resolve({ status: res.statusCode, body: parsed });
        });
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const today = todayISO();
  console.log(`[linkedin-post-runner] Running for date: ${today}`);

  // Load queue
  if (!fs.existsSync(QUEUE_PATH)) {
    console.log('[linkedin-post-runner] Queue file not found — nothing to do.');
    return;
  }

  let queue;
  try {
    queue = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
  } catch (err) {
    console.error('[linkedin-post-runner] Failed to parse queue file:', err.message);
    process.exit(1);
  }

  if (!Array.isArray(queue)) {
    console.error('[linkedin-post-runner] Queue file is not an array.');
    process.exit(1);
  }

  // Find oldest pending item for today
  const pending = queue
    .filter((item) => item.status === 'pending' && item.date === today)
    .sort((a, b) => (a.id < b.id ? -1 : 1)); // sort by id for deterministic order

  if (pending.length === 0) {
    console.log('[linkedin-post-runner] No pending items for today. Done.');
    return;
  }

  const item = pending[0];
  console.log(`[linkedin-post-runner] Posting item "${item.id}": ${item.text.slice(0, 60)}...`);

  // Post
  let result;
  try {
    result = await httpsPost(POST_URL, {
      text: item.text,
      ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
    });
  } catch (err) {
    console.error('[linkedin-post-runner] HTTP request failed:', err.message);
    item.status = 'failed';
    item.error = err.message;
    fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2), 'utf8');
    process.exit(1);
  }

  console.log(`[linkedin-post-runner] API response: HTTP ${result.status}`, JSON.stringify(result.body, null, 2));

  // Update queue
  item.postedAt = new Date().toISOString();
  if (result.status >= 200 && result.status < 300) {
    item.status = 'posted';
    item.error = null;
    console.log('[linkedin-post-runner] ✅ Posted successfully.');
  } else {
    item.status = 'failed';
    item.error = `HTTP ${result.status}: ${JSON.stringify(result.body)}`;
    console.error('[linkedin-post-runner] ❌ Post failed:', item.error);
  }

  fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2), 'utf8');
  console.log('[linkedin-post-runner] Queue updated.');
}

main().catch((err) => {
  console.error('[linkedin-post-runner] Unhandled error:', err);
  process.exit(1);
});
