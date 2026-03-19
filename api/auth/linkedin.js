/**
 * LinkedIn OAuth Initiation
 * GET /api/auth/linkedin
 *
 * Redirects to LinkedIn OAuth. Requests only approved scopes:
 *   r_liteprofile, w_member_social
 *
 * Note: w_organization_social (company page posting) requires LinkedIn's
 * Community Management API -- separate application pending.
 */

const SCOPES = [
  'r_liteprofile',
  'w_member_social',
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
    state: Math.random().toString(36).slice(2),
  });

  const authUrl = `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;

  return res.redirect(302, authUrl);
};
