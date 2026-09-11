// The untrusted-caller-visible contract. No secret field exists on any of these.

/** Opaque, unguessable token. Maps to a trusted-side CredentialPolicy ONLY inside the fill service. */
export type Handle = string; // e.g. "vh_<random>", never the op:// path

export type ItemMeta = {
  handle: Handle;
  label: string;
  kind: 'password' | 'totp';     // v0.1: password only
  account?: string;              // non-secret username/email hint
  available: boolean;
  // NOTE: the canonical origin is deliberately NOT surfaced as an authority the caller passes back;
  //       it may be shown as display metadata but the fill gate reads it trusted-side (see CredentialPolicy).
};

/** Bare origin only: scheme://host[:port], no path/query/fragment/trailing slash. Schema-validated. */
export type Origin = string;

export type FieldRole = 'username' | 'password' | 'totp';

/** TRUSTED-SIDE ONLY (never sent to the model). Resolved from the backend item at fill time. */
export type CredentialPolicy = {
  canonicalOrigin: Origin;             // the ONLY origin this credential may fill (from the vault item's URL)
  fieldRecipe: FieldRole[];            // which roles this credential provides
  // future: allowlist of additional origins, submit policy, payload-bound approval
};

export type FillField = { role: FieldRole; selector: string }; // caller supplies selectors, NEVER values

export type FillRequest = {
  handle: Handle;
  sessionId: string;                   // identifies the host-side Playwright page
  fields: FillField[];
  assertedOrigin?: Origin;             // OPTIONAL redundant assertion; must match the policy if given.
                                       // It is NEVER the authorization — the policy's canonicalOrigin is.
};

/** Returned to the model. No field can carry plaintext or an acceptance oracle. */
export type FillResult =
  | { ok: true;  filled: FieldRole[] }
  | { ok: false; reason:
      | 'origin-not-authorized'   // live top-level frame ≠ credential's canonicalOrigin
      | 'handle-unavailable'
      | 'handle-exhausted'
      | 'locked-field'
      | 'no-password-control'     // selector didn't resolve to a verified password input in the pinned frame
      | 'cross-origin-frame'      // the selector matches only inside a cross-origin subframe → refused (subframes are never filled)
      | 'session-unknown'         // sessionId doesn't exist or was closed (see §3 lifecycle)
      | 'backend-error' };

// The three vault tools (complete signatures — these land verbatim in core/types.ts at M0):
export type SetupReason = 'missing_item' | 'backend_locked' | 'backend_unavailable';

export interface VaultTools {
  list_vault(): Promise<{ items: ItemMeta[] }>;
  fill_from_vault(req: FillRequest): Promise<FillResult>;
  request_vault_setup(args: { reason: SetupReason }): Promise<{ instruction: string }>; // fixed template text only
}

// Browser controls (trusted-side minted sessions; see §3 browser-control group). Amended 2026-09-01 (M4,
// phase-0-plan §8 M4 row round-3 #9): navigate/click/type/snapshot added. Every result is a closed enum or a
// provenance-masked structure; no free text and no field whose value depends on a secret.
export type BrowserOpResult =
  | { ok: true }
  | { ok: false; reason:
      | 'session-unknown'
      | 'invalid-url'            // not an HTTP(S) URL with a bare-origin-valid origin
      | 'navigation-failed'
      | 'no-such-element'
      | 'locked-field' };        // the target is a TinyVault-filled or locked control

/** Provenance-masked. Masked nodes carry NOTHING but the tag: no value, no name, no role (page free text). */
export type MaskedSnapshotNode =
  | { tag: string; masked: true }
  | { tag: string; masked: false; role?: string; name?: string; value?: string };

/** `url` is origin + pathname only — never query or fragment. */
export type MaskedSnapshot = { url: string; nodes: MaskedSnapshotNode[] };

export interface BrowserControls {
  browser_open_session(): Promise<{ sessionId: string }>;   // rejects with ONE fixed error if the browser is unavailable
  browser_close_session(args: { sessionId: string }): Promise<{ ok: boolean }>;
  browser_navigate(args: { sessionId: string; url: string }): Promise<BrowserOpResult>;
  browser_click(args: { sessionId: string; selector: string }): Promise<BrowserOpResult>;
  browser_type(args: { sessionId: string; selector: string; text: string }): Promise<BrowserOpResult>;   // non-secret text only
  browser_snapshot(args: { sessionId: string }): Promise<
    | { ok: true; snapshot: MaskedSnapshot }
    | { ok: false; reason: 'session-unknown' }>;
}
