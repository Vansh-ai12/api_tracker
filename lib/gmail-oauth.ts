import { decryptToken } from "./encryption";
import { logAuditEvent } from "./audit-logger";

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v2/userinfo";
const GOOGLE_REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

function getOAuthCredentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "[gmail-oauth] Missing required Google OAuth environment variables: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI"
    );
  }

  return { clientId, clientSecret, redirectUri };
}

/**
 * Builds the Google OAuth 2.0 authorization URL using strictly configured environment settings.
 */
export function generateGoogleAuthUrl(state: string): string {
  const { clientId, redirectUri } = getOAuthCredentials();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

/**
 * Exchanges the Google OAuth authorization code for access and refresh tokens,
 * and retrieves the user's primary Gmail address.
 */
export async function exchangeCodeForTokens(code: string): Promise<{
  accessToken: string;
  refreshToken?: string;
  gmailEmail: string;
}> {
  const { clientId, clientSecret, redirectUri } = getOAuthCredentials();

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  const tokenData = await response.json();

  if (!response.ok || tokenData.error) {
    throw new Error(`[gmail-oauth] Code exchange failed: ${tokenData.error_description || tokenData.error || "Unknown error"}`);
  }

  const accessToken = tokenData.access_token;
  const refreshToken = tokenData.refresh_token;

  if (!accessToken) {
    throw new Error("[gmail-oauth] No access_token returned by Google OAuth server.");
  }

  // Retrieve user email using access_token in memory
  const userInfoRes = await fetch(GOOGLE_USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const userInfo = await userInfoRes.json();
  if (!userInfoRes.ok || !userInfo.email) {
    throw new Error("[gmail-oauth] Could not retrieve Gmail address from UserInfo endpoint.");
  }

  return {
    accessToken,
    refreshToken,
    gmailEmail: userInfo.email,
  };
}

/**
 * Obtains a fresh access token in-memory using the stored encrypted refresh token.
 * Never persists the resulting access token.
 */
export async function getFreshAccessToken(encryptedRefreshToken: string): Promise<string> {
  const refreshToken = decryptToken(encryptedRefreshToken);
  const { clientId, clientSecret } = getOAuthCredentials();

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(`[gmail-oauth] Refresh token failed: ${data.error_description || data.error || "Token invalid/expired"}`);
  }

  if (!data.access_token) {
    throw new Error("[gmail-oauth] No access_token returned during token refresh.");
  }

  return data.access_token;
}

/**
 * Revokes Google OAuth access token/refresh token on Google's authorization servers.
 * Gracefully handles cases where token is already revoked or invalid.
 */
export async function revokeGoogleToken(encryptedRefreshToken: string): Promise<boolean> {
  try {
    const refreshToken = decryptToken(encryptedRefreshToken);
    const response = await fetch(`${GOOGLE_REVOKE_ENDPOINT}?token=${encodeURIComponent(refreshToken)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    if (response.ok || response.status === 400) {
      // 200 = Success, 400 = Token already revoked/invalid on Google's end
      return true;
    }

    console.warn(`[gmail-oauth] Token revocation returned HTTP ${response.status}`);
    return false;
  } catch (error: any) {
    logAuditEvent("gmail_oauth_failed", { error: error.message });
    return false;
  }
}
