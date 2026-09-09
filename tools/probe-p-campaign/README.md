# Probe P campaign harness

This directory records the single authorized campaign of exactly 20 started `make test` runs. It does not change or reinterpret the gate. `run.sh` is the only file that spawns processes; the JavaScript modules only parse, classify, hash, and read or write evidence.

## Freeze and plan

Commit the candidate, this complete directory, and `docs/probe-p-timing2-policy.md` before starting. Cite that commit SHA in the campaign record. The two-run CLI acceptance probe uses a disposable output directory and launches no `make test` or host-state commands:

```sh
tools/probe-p-campaign/run.sh --out /absolute/evidence/probe-p-campaign --runs 2 --plan
```

To freeze the real campaign for review before starting it, run the same command with `--runs 20 --plan`; after reviewing `campaign.json`, start it by repeating the command with `--runs 20 --resume` and without `--plan`. A real, non-plan invocation rejects any run count other than 20. Alternatively, omitting `--plan` on a new output directory freezes and immediately begins the campaign. The output directory should be empty and outside the checkout. `campaign.json` pins the candidate SHA, a deterministic SHA-256 over every regular file below this directory, the policy-note SHA-256, run count, predicate version, and cooldown.

The command refuses any output from `git status --short`. In the Codex worker worktree, `node_modules` is an untracked symlink because `.gitignore`'s `node_modules/` pattern matches directories only, so the plan command correctly refuses that worktree. The campaign runs in the owner's clean checkout, where `node_modules` is a directory. Do not special-case or ignore the symlink.

## Run and resume

Run the frozen campaign from the same clean commit:

```sh
tools/probe-p-campaign/run.sh --out /absolute/evidence/probe-p-campaign --runs 20
```

If the harness is interrupted, use only:

```sh
tools/probe-p-campaign/run.sh --out /absolute/evidence/probe-p-campaign --runs 20 --resume
```

Resume rechecks every frozen identity field and starts its scan at the first `run-NN` without `ended.json`. An existing incomplete run remains counted and is preserved without retry; later numbers continue in order. An optional `--cooldown-seconds N` must be supplied at creation and identically on resume. Its value is frozen in `campaign.json`.

Each new run directory receives `started.json` before any other evidence. Raw command output and exit status are retained under `raw/`; unavailable host commands do not abort the run. The normalized host state, objective competing-job result, complete `make test` log and exit, every available Vitest report, and explicit missing-report inventory are retained. No gate failure is retried.

## Analyze once

After the campaign ends, run the committed analyzer once:

```sh
node tools/probe-p-campaign/analyze.mjs --dir /absolute/evidence/probe-p-campaign
```

It creates `report.json` and `report.md` with exclusive writes and refuses to overwrite either file. Preserve both with the campaign evidence.

## Forbidden

- Replacing, deleting, retrying, or manually excluding a started run.
- Extending beyond 20 started runs or restarting the campaign to improve its result.
- Retrying a failed gate and substituting the retry.
- Changing the candidate, predicate, policy note, harness, cooldown, or run count on resume.
- Editing the analysis after run 1 or rerunning it over the same evidence.
- Treating an excluded or incomplete run as absent; it stays in the actual gate-outcome report.
