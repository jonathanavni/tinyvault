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
      | 'locked-field'
      | 'no-password-control'     // selector didn't resolve to a verified password input in the pinned frame
      | 'cross-origin-frame'      // target field lives in a cross-origin subframe → refused
      | 'session-unknown'         // sessionId doesn't exist or was closed (see §3 lifecycle)
      | 'backend-error' };

// The three vault tools (complete signatures — these land verbatim in core/types.ts at M0):
export type SetupReason = 'missing_item' | 'backend_locked' | 'backend_unavailable';

export interface VaultTools {
  list_vault(): Promise<{ items: ItemMeta[] }>;
  fill_from_vault(req: FillRequest): Promise<FillResult>;
  request_vault_setup(args: { reason: SetupReason }): Promise<{ instruction: string }>; // fixed template text only
}

// Session lifecycle (trusted-side minted; see §3 browser-control group):
export interface BrowserControls {
  browser_open_session(): Promise<{ sessionId: string }>;
  browser_close_session(args: { sessionId: string }): Promise<{ ok: boolean }>;
}
