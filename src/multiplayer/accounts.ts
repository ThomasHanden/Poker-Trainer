// Signed-in players on the live-table server. The site signs people in with Supabase; for a table
// connection or a bank request the browser sends its access token (in a message or request body,
// never in a URL), and the server checks it here before acting as that account. Guests keep
// playing under their browser key (bank.ts: playerId).

import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify, type JWTVerifyGetKey } from 'jose';

export interface AccountAuthConfig {
  /** the Supabase project address, e.g. https://abcd.supabase.co (empty: accounts are off) */
  supabaseUrl: string;
  /** the project's publishable (anon) key: public, used only to ask Supabase about a token */
  publishableKey: string;
}

/**
 * The id an account plays under at the tables and in the bank. It is derived from the account
 * id, so other players never see the account id itself, and starts with "u", which a guest's
 * hex id never does.
 */
export async function accountPlayerId(userId: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`felt-account:${userId}`)));
  return `u${Array.from(bytes.slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 23)}`;
}

export const isAccountPlayerId = (id: string) => /^u[0-9a-f]{23}$/.test(id);

const keySets = new Map<string, JWTVerifyGetKey>();

/**
 * The account id (Supabase user id) a token belongs to, or null if it is not a valid, unexpired
 * token from this project. Tokens signed with the project's published keys are checked here;
 * projects still on a shared secret are asked through Supabase's own user endpoint instead.
 */
export async function verifyAccessToken(
  token: unknown,
  cfg: AccountAuthConfig,
  deps: { keys?: JWTVerifyGetKey; fetch?: typeof fetch } = {},
): Promise<string | null> {
  if (typeof token !== 'string' || token.length > 8192 || !cfg.supabaseUrl) return null;
  const issuer = `${cfg.supabaseUrl.replace(/\/+$/, '')}/auth/v1`;
  try {
    const { alg } = decodeProtectedHeader(token);
    if (alg === 'HS256') return await askSupabase(token, issuer, cfg.publishableKey, deps.fetch ?? fetch);
    let keys = deps.keys ?? keySets.get(issuer);
    if (!keys) {
      keys = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
      keySets.set(issuer, keys);
    }
    const { payload } = await jwtVerify(token, keys, { issuer, audience: 'authenticated', algorithms: ['ES256', 'RS256', 'EdDSA'], clockTolerance: 30 });
    return payload.role === 'authenticated' && typeof payload.sub === 'string' && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}

async function askSupabase(token: string, issuer: string, publishableKey: string, f: typeof fetch): Promise<string | null> {
  const r = await f(`${issuer}/user`, { headers: { apikey: publishableKey, Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const user = (await r.json()) as { id?: unknown };
  return typeof user.id === 'string' && user.id ? user.id : null;
}
