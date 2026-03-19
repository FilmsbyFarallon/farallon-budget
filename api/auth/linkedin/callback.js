/**
 * LinkedIn OAuth Callback Handler
 * GET /api/auth/linkedin/callback
 *
 * Exchanges the authorization code for tokens, fetches org URNs,
 * and persists everything to Supabase `linkedin_tokens` table.
 */

const https = require('https');

// Known page slugs — used to map org names to stable keys
const PAGE_SLUG_MAP = {
  'Villager Pro': 'villager-pro',
  'The Dirty Numbers': 'the-dirty-numbers',
  'Farallon Films LLC': 'farallon-films',
};

// ---------------------------------------------------------------------------
// Tiny fetch wrapper (Node built-in https — no extra deps)
// ---------------------------------------------------------------------------
function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Upsert tokens to Supabase
// ---------------------------------------------------------------------------
async function saveTokensToSupabase({ access_token, refresh_token, expires_at, pages }) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables');
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/linkedin_tokens`, {
    method: 'POST',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      id: 'default',
      access_token,
      refresh_token: refresh_token || null,
      expires_at,
      pages,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Supabase upsert failed (${response.status}): ${errText}`);
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
module.exports = async function handler(req, res) {
  const { code, error, error_description } = req.query || {};

  if (error) {
    return res.status(400).send(`<h2>LinkedIn auth failed</h2><p>${error}: ${error_description}</p>`);
  }

  if (!code) {
    return res.status(400).send('<h2>Missing authorization code</h2>');
  }

  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI || 'https://villagerpro.io/api/auth/linkedin/callback';

  if (!clientId || !clientSecret) {
    return res.status(500).send('<h2>Server misconfiguration — missing LinkedIn credentials</h2>');
  }

  try {
    // ------------------------------------------------------------------
    // 1. Exchange code for tokens
    // ------------------------------------------------------------------
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString();

    const tokenResponse = await httpsRequest(
      {
        hostname: 'www.linkedin.com',
        path: '/oauth/v2/accessToken',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(tokenParams),
        },
      },
      tokenParams,
    );

    if (tokenResponse.status !== 200) {
      console.error('LinkedIn token exchange failed:', tokenResponse.body);
      return res.status(502).send('<h2>Token exchange failed. Check server logs.</h2>');
    }

    const { access_token, refresh_token, expires_in } = tokenResponse.body;
    const expiresAt = Math.floor(Date.now() / 1000) + (expires_in || 5183944); // default ~60 days

    // ------------------------------------------------------------------
    // 2. Fetch member profile URN (for validation / future use)
    // ------------------------------------------------------------------
    const profileResponse = await httpsRequest({
      hostname: 'api.linkedin.com',
      path: '/v2/me',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${access_token}`,
        'X-Restli-Protocol-Version': '2.0.0',
      },
    });

    const memberUrn = profileResponse.body?.id
      ? `urn:li:person:${profileResponse.body.id}`
      : null;

    console.log('LinkedIn member URN:', memberUrn);

    // ------------------------------------------------------------------
    // 3. Fetch company pages the user administers
    // ------------------------------------------------------------------
    const aclResponse = await httpsRequest({
      hostname: 'api.linkedin.com',
      path: '/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organizationTarget~(id,localizedName)))',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${access_token}`,
        'X-Restli-Protocol-Version': '2.0.0',
      },
    });

    const pages = {};
    const elements = aclResponse.body?.elements || [];

    for (const element of elements) {
      const org = element['organizationTarget~'];
      if (!org) continue;
      const name = org.localizedName;
      const urn = `urn:li:organization:${org.id}`;
      const slug = PAGE_SLUG_MAP[name] || name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      pages[slug] = { urn, name };
    }

    console.log('LinkedIn pages found:', Object.keys(pages));

    // ------------------------------------------------------------------
    // 4. Persist tokens to Supabase
    // ------------------------------------------------------------------
    await saveTokensToSupabase({
      access_token,
      refresh_token,
      expires_at: expiresAt,
      pages,
    });

    console.log('LinkedIn tokens saved to Supabase linkedin_tokens table');

    // ------------------------------------------------------------------
    // 5. Return success page
    // ------------------------------------------------------------------
    return res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>LinkedIn Connected</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f0f4f8}
.card{background:#fff;border-radius:12px;padding:2rem 3rem;box-shadow:0 4px 24px rgba(0,0,0,.08);text-align:center}
h2{color:#0077b5;margin-bottom:.5rem}p{color:#555}</style></head>
<body><div class="card">
<h2>✅ LinkedIn Connected</h2>
<p>Authorized ${Object.keys(pages).length} page(s): ${Object.values(pages).map((p) => p.name).join(', ') || 'none found'}.</p>
<p>You can close this tab.</p>
</div></body></html>`);
  } catch (err) {
    console.error('LinkedIn callback error:', err);
    return res.status(500).send('<h2>Internal error. Check server logs.</h2>');
  }
};
