# TinyVault security-review methodology

This is a separate, read-only security channel. Apply it to the packet's candidate and explicit scope;
do not reuse another reviewer's findings. Read the threat model, locked invariants, exclusions, and
accepted residuals supplied in the packet before assessing exploitability.

1. Trace untrusted inputs across the actual trust boundaries to privileged operations and model-visible
   outputs. Check origin validation, handle/capability authority, replay and expiry, context/epoch binding,
   credential transport, redaction, and post-fill lockdown where the diff affects them.
2. Examine rejection and cleanup paths, races, alternate callers, framing and parsing ambiguity, and
   fail-open behavior. Trace a proposed attack to its production caller; a suspicious helper alone is not proof.
3. Check conventional issues relevant to the diff: injection, authentication/authorization bypass,
   secrets in logs/errors/artifacts, path traversal, unsafe deserialization, and resource exhaustion.
4. Check the measurement claim: can a gate or detector silently stop running, count the wrong event,
   accept forged provenance, or pass after its protection is removed? Name the concrete missing mutant
   or reaching input. Static inspection does not establish that a regression test fails under mutation.
5. Separate demonstrated defects from hypotheses, deployment assumptions, and accepted residuals.
   For each finding give file:line, a reaching scenario, impact within the stated threat model, and
   the evidence needed to verify the fix. Do not invent a stronger threat model to manufacture severity.

Use the dispatcher's report format. State that this run cannot execute tests, scanners, browser or Docker
probes. Identify missing dynamic evidence without claiming it was checked. A clean report does not
replace required tests, the separate QA/adversarial channels, or an explicitly mandated external auditor.
