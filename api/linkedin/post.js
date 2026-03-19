/**
 * LinkedIn Post Route
 * POST /api/linkedin/post
 *
 * Body: { text: string, imageUrl?: string }
 *
 * Reads org tokens from LINKEDIN_TOKEN_PATH and posts to all three
 * company pages via the LinkedIn UGC Posts API.
 *
 * Returns: { success: boolean, results: Array<{ page, urn, status, error? }> }
 *
 * ⚠️  PERSISTENCE WARNING:
 * /tmp is ephemeral on Vercel. Tokens written during OAuth will not be
 * available in a subsequent function invocation. Migrate to Supabase or
 * Vercel KV before using in production. See PR description.
 */

const https = require('https');
const fs = require('fs');

const TOKEN_PATH = process.env.LINKEDIN_TOKEN_PATH || '/tmp/linkedin-tokens.json';

// ---------------------------------------------------------------------------
// Tiny https helper
// ---------------------------------------------------------------------------
function httpsPost(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Build UGC post payload
// ---------------------------------------------------------------------------
function buildUgcPayload(authorUrn, text) {
  return JSON.stringify({
    author: authorUrn,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text },
        shareMediaCategory: 'NONE',
      },
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
    },
  });
}

// ---------------------------------------------------------------------------
// Post to a single org
// ---------------------------------------------------------------------------
async function postToOrg(accessToken, urn, text) {
  const payload = buildUgcPayload(urn, text);
  const response = await httpsPost(
    {
      hostname: 'api.linkedin.com',
      path: '/v2/ugcPosts',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
        'Content-Length': Buffer.byteLength(payload),
      },
    },
    payload,
  );

  if (response.status === 201) {
    const postUrn = response.headers['x-restli-id'] || response.body?.id || 'unknown';
    return { success: true, postUrn };
  }

  return {
    success: false,
    error: `HTTP ${response.status}: ${JSON.stringify(response.body)}`,
  };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text, imageUrl } = req.body || {};

  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }

  if (imageUrl) {
    // Image posting requires a separate LinkedIn asset upload flow.
    // Not implemented in this version — future enhancement.
    console.warn('imageUrl provided but image posting is not yet supported; posting text only.');
  }

  // ------------------------------------------------------------------
  // Load tokens
  // ------------------------------------------------------------------
  let tokenData;
  try {
    if (!fs.existsSync(TOKEN_PATH)) {
      return res.status(503).json({
        error: `Token file not found at ${TOKEN_PATH}. Run /api/auth/linkedin to authenticate first.`,
      });
    }
    tokenData = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  } catch (err) {
    return res.status(500).json({ error: `Failed to read token file: ${err.message}` });
  }

  const { accessToken, expiresAt, pages } = tokenData;

  if (!accessToken) {
    return res.status(503).json({ error: 'No access token in token file. Re-authenticate.' });
  }

  if (expiresAt && Math.floor(Date.now() / 1000) > expiresAt) {
    return res.status(503).json({
      error: 'LinkedIn access token has expired. Re-authenticate via /api/auth/linkedin.',
    });
  }

  if (!pages || Object.keys(pages).length === 0) {
    return res.status(503).json({ error: 'No company pages found in token file. Re-authenticate.' });
  }

  // ------------------------------------------------------------------
  // Post to each page
  // ------------------------------------------------------------------
  const results = [];

  for (const [slug, { urn, name }] of Object.entries(pages)) {
    console.log(`Posting to ${name} (${urn})...`);
    try {
      const result = await postToOrg(accessToken, urn, text.trim());
      results.push({ page: slug, name, urn, ...result });
      console.log(`  ${name}: ${result.success ? 'OK' : result.error}`);
    } catch (err) {
      results.push({ page: slug, name, urn, success: false, error: err.message });
      console.error(`  ${name}: exception —`, err.message);
    }
  }

  const allSucceeded = results.every((r) => r.success);
  const anySucceeded = results.some((r) => r.success);

  return res.status(allSucceeded ? 200 : anySucceeded ? 207 : 502).json({
    success: allSucceeded,
    results,
  });
};
