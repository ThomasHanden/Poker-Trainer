// Live-table server side of accounts: checking sign-in tokens, account player ids, and moving a
// guest's chips into an account. Tokens are signed with a key pair made here, the way Supabase
// signs them, and checked against its public half.
import { describe, it, expect, beforeAll } from 'vitest';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWTVerifyGetKey } from 'jose';
import { accountPlayerId, isAccountPlayerId, verifyAccessToken } from '../src/multiplayer/accounts';
import { claimDaily, moveGuestChips, playerId, status, type Account } from '../src/multiplayer/bank';
import { CHIP } from '../src/multiplayer/table';

const CFG = { supabaseUrl: 'https://proj.supabase.co', publishableKey: 'sb_publishable_test' };
const ISSUER = 'https://proj.supabase.co/auth/v1';
const USER = '9a7b1c2d-0000-4000-8000-000000000001';

let privateKey: CryptoKey;
let keys: JWTVerifyGetKey;
let otherKey: CryptoKey;

const token = (claims: Record<string, unknown> = {}, opts: { key?: CryptoKey; exp?: string | number; iss?: string; aud?: string } = {}) =>
  new SignJWT({ role: 'authenticated', ...claims })
    .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
    .setSubject(USER)
    .setIssuer(opts.iss ?? ISSUER)
    .setAudience(opts.aud ?? 'authenticated')
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '1h')
    .sign(opts.key ?? privateKey);

beforeAll(async () => {
  const pair = await generateKeyPair('ES256');
  privateKey = pair.privateKey as CryptoKey;
  keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'ES256' }] });
  otherKey = (await generateKeyPair('ES256')).privateKey as CryptoKey;
});

describe('sign-in tokens', () => {
  it('a valid token from this project gives its account id', async () => {
    expect(await verifyAccessToken(await token(), CFG, { keys })).toBe(USER);
  });

  it('expired, forged, foreign or malformed tokens are refused', async () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    expect(await verifyAccessToken(await token({}, { exp: past }), CFG, { keys })).toBeNull();
    expect(await verifyAccessToken(await token({}, { key: otherKey }), CFG, { keys })).toBeNull(); // signed by someone else
    expect(await verifyAccessToken(await token({}, { iss: 'https://evil.supabase.co/auth/v1' }), CFG, { keys })).toBeNull();
    expect(await verifyAccessToken(await token({}, { aud: 'anon' }), CFG, { keys })).toBeNull();
    expect(await verifyAccessToken(await token({ role: 'anon' }), CFG, { keys })).toBeNull();
    const good = await token();
    const tampered = good.slice(0, good.indexOf('.') + 5) + (good[good.indexOf('.') + 5] === 'A' ? 'B' : 'A') + good.slice(good.indexOf('.') + 6);
    expect(await verifyAccessToken(tampered, CFG, { keys })).toBeNull();
    for (const bad of ['', 'not-a-token', 42, null, undefined, 'x'.repeat(9000)]) expect(await verifyAccessToken(bad, CFG, { keys })).toBeNull();
  });

  it('with accounts switched off (no project address), nobody is signed in', async () => {
    expect(await verifyAccessToken(await token(), { supabaseUrl: '', publishableKey: '' }, { keys })).toBeNull();
  });

  it('projects on the older shared-secret tokens are checked by asking Supabase', async () => {
    const hs = await new SignJWT({ role: 'authenticated' }).setProtectedHeader({ alg: 'HS256' }).setSubject(USER).sign(new TextEncoder().encode('secret-we-do-not-hold'));
    const calls: { url: string; auth: string | null; apikey: string | null }[] = [];
    const answer = (ok: boolean) =>
      (async (url: string, init?: RequestInit) => {
        const h = new Headers(init?.headers);
        calls.push({ url, auth: h.get('Authorization'), apikey: h.get('apikey') });
        return new Response(JSON.stringify(ok ? { id: USER } : { msg: 'invalid JWT' }), { status: ok ? 200 : 401 });
      }) as unknown as typeof fetch;
    expect(await verifyAccessToken(hs, CFG, { fetch: answer(true) })).toBe(USER);
    expect(calls[0]).toEqual({ url: `${ISSUER}/user`, auth: `Bearer ${hs}`, apikey: CFG.publishableKey });
    expect(await verifyAccessToken(hs, CFG, { fetch: answer(false) })).toBeNull();
  });
});

describe('account player ids', () => {
  it('are stable, never show the account id, and cannot collide with guest ids', async () => {
    const id = await accountPlayerId(USER);
    expect(id).toBe(await accountPlayerId(USER));
    expect(isAccountPlayerId(id)).toBe(true);
    expect(id).not.toContain(USER.slice(0, 8));
    expect(await accountPlayerId('another-user')).not.toBe(id);
    const guest = await playerId('a-guest-browser-key-0123456789');
    expect(guest).toMatch(/^[0-9a-f]{24}$/);
    expect(isAccountPlayerId(guest)).toBe(false);
  });
});

describe('moving guest chips into an account', () => {
  const DAY = '2026-10-31';
  it('moves what the server holds, once, and the guest wallet is left empty', () => {
    const guest: Account = { balance: 340 * CHIP, claim: { day: '2026-10-30', amount: 120 * CHIP } };
    const account: Account = { balance: 75 * CHIP };
    const r = moveGuestChips(guest, 'g1', account, 'u1');
    if ('error' in r) throw new Error(r.error);
    expect(r.moved).toBe(340 * CHIP);
    expect(r.account.balance).toBe(415 * CHIP);
    expect(r.guest.balance).toBe(0);
    expect(status(r.account, Date.UTC(2026, 9, 31)).guestMoved).toBe(true);
    // a second move into the same account, or of the same guest wallet, is refused
    expect(moveGuestChips({ balance: 500 }, 'g2', r.account, 'u1')).toHaveProperty('error');
    expect(moveGuestChips(r.guest, 'g1', { balance: 0 }, 'u2')).toHaveProperty('error');
  });

  it('cannot be used to claim twice in a day: the later claim day comes along', () => {
    const guest = claimDaily({ balance: 0 }, DAY, () => 150).acc; // claimed today as a guest
    const account: Account = { balance: 0, claim: { day: '2026-10-29', amount: 100 } };
    const r = moveGuestChips(guest, 'g', account, 'u');
    if ('error' in r) throw new Error(r.error);
    expect(claimDaily(r.account, DAY, () => 200).paid).toBe(false);
    // the other way round: the account's own claim today stays too
    const r2 = moveGuestChips({ balance: 10, claim: { day: '2026-10-20', amount: 0 } }, 'g', claimDaily({ balance: 0 }, DAY, () => 60).acc, 'u');
    if ('error' in r2) throw new Error(r2.error);
    expect(claimDaily(r2.account, DAY, () => 200).paid).toBe(false);
  });

  it('an empty guest wallet does not use up the one move', () => {
    expect(moveGuestChips({ balance: 0 }, 'g', { balance: 5 }, 'u')).toEqual({ error: 'There are no guest chips to move.' });
  });
});
