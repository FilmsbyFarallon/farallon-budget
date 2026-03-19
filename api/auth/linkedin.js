/**
 * LinkedIn OAuth Initiation
 * GET /api/auth/linkedin
 *
 * Redirects the user to LinkedIn's OAuth authorization page.
 * After granting access, LinkedIn will redirect back to:
 *   https://villagerpro.io/api/auth/linkedin/callback
 */

const SCOPES = [
  'r_liteprofile',
  'w_member_social',
  'r_organization_social',
  'w_organization_social',
  'rw_organization_admin',
].join(' ');

module.exports = function handler(req, res) {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI || 'https://villagerpro.io/api/auth/linkedin/callback';

  if (!clientId) {
    return res.status(500).json({ error: 'LINKEDIN_CLIENT_ID env var is not set' });
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPES,
    state: Math.random().toString(36).slice(2), // basic CSRF token
  });

  const authUrl = `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;

  return res.redirect(302, authUrl);
};
