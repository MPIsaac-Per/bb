# MPIV Downstream Handover

- Snapshot date: 2026-08-30
- Repository: `MPIsaac-Per/bb`
- Working branch: `mpiv/prod`
- Binding spec: [MPIV Downstream Distribution](specs/mpiv-downstream-distribution.md)
- Operating runbook: [MPIV Downstream Operations](mpiv-downstream-operations.md)

This is a current-state handover, not a substitute for live verification. Recheck GitHub, Git branches, the artifact manifest, and mpiv-hub before changing production.

## Objective

MPIV should dogfood its BB fork while continuously absorbing `get-bb/bb:main`. Generic improvements should be proposed upstream. Permanent MPIV behavior should remain concentrated behind narrow owned seams. The production seam is an immutable `bb-app` tarball plus its provenance manifest.

## Repository Topology

- Local `origin`: `https://github.com/get-bb/bb.git`
- Local `fork`: `https://github.com/MPIsaac-Per/bb.git`
- `fork/main`: intended to be an exact upstream mirror
- `fork/mpiv/prod`: downstream production source
- `automation/upstream-sync`: disposable upstream integration branch

At this snapshot, GitHub still names `main` as the fork's default branch. That branch is 633 commits behind upstream. This is the source of GitHub's fork warning.

`mpiv/prod` is not behind upstream. Live verification showed:

```text
fork/main vs upstream/main: 0 ahead, 633 behind
mpiv/prod vs upstream/main: 8 ahead, 0 behind
```

Upstream commit `f4bbc2fe81a9b7639ff9a7396e172bddd89109e4` is an ancestor of downstream commit `f1b03da747e62ffc278c1dc94fcd227d6a7aaa0d`.

The eight downstream commits at handover are:

```text
f9c325e5f Add project archiving
1c3316c69 Add per-project sidebar thread limits
65995f787 Set up MPIV downstream distribution
999b29b5e Refresh plugin SDK public API inventory
8db50b117 Update automation project fixture
41c6376e9 Stage MPIV build validation
b902818af Slim MPIV artifact validation
f1b03da74 Use authoritative upstream provenance
```

## Completed Setup

- Declared the repository T2 Live and recorded the binding distribution spec.
- Added an immutable MPIV prerelease version derivation command.
- Added artifact packaging with source, upstream, protocol, checksum, and custom-commit provenance.
- Added a rollback-first mpiv-hub deployment command that is non-mutating without `--deploy`.
- Added a focused post-merge build workflow.
- Added a daily upstream mirror and integration-PR workflow.
- Enabled GitHub Actions to create and approve pull requests.
- Pushed all setup through `f1b03da747e62ffc278c1dc94fcd227d6a7aaa0d`.
- Replaced an excessive full-monorepo artifact workflow with a focused distribution gate. Full, sharded repository CI remains the pull-request gate.

The focused build performs:

1. An authoritative fetch of `get-bb/bb:main`.
2. MPIV version preparation.
3. `@bb/scripts` typecheck and tests.
4. A real `bb-app` tarball smoke installation.
5. Provenance generation and checksum verification.
6. Artifact upload without npm publication or deployment.

## Verified Artifact

GitHub Actions run [33324408498](https://github.com/MPIsaac-Per/bb/actions/runs/33324408498) completed successfully in 5 minutes 6 seconds.

```text
version: 0.40.1-mpiv.33324408498.1
source commit: f1b03da747e62ffc278c1dc94fcd227d6a7aaa0d
upstream base: f4bbc2fe81a9b7639ff9a7396e172bddd89109e4
custom commits: 8
protocol version: 174
sha256: 231363ae843c8558fba8867633c68266b4db92f2c3aaac6b3c35f19a8775b544
artifact name: mpiv-bb-33324408498-1
artifact ID: 9735863855
```

The non-mutating deployment plan resolved to:

```text
release ID: 0.40.1-mpiv.33324408498.1-231363ae843c
remote directory: /home/michael/.bb-mpiv/releases/0.40.1-mpiv.33324408498.1-231363ae843c
host: hub
```

Artifact `9735778994` from run `33324106540` has the same source lineage but misleading provenance because it measured against stale `fork/main`. Do not deploy it. It may be deleted after explicit approval.

## Live Runtime At Handover

The production Hub has not been changed.

```text
bb-server.service: active
installed version: 0.40.0
installed protocol: 170
release source: npm
```

Machine state read through `https://mpiv.getbb.app`:

```text
Michael Isaac M5 Max: connected
mpiv-hub: connected
omarchy: disconnected
```

Therefore MPIV is not yet dogfooding the downstream artifact in production. The Hub is still running upstream `0.40.0`. Deploying the artifact changes the server protocol from 170 to 174, so connected enrolled daemons should follow the server's protocol-update path. Omarchy must be checked when it reconnects.

The upstream-signed Mac desktop shell remains the normal client. Hub server and web changes are dogfooded after Hub deployment. Electron main-process changes require a separate signed MPIV desktop distribution and are outside this setup.

## Outstanding Decisions

The user approved pushes and GitHub Actions permission changes during setup. The following actions still require explicit approval:

1. Change the fork's default branch from `main` to `mpiv/prod`.
2. Configure branch protection or a ruleset for `mpiv/prod`.
3. Deploy the verified artifact to mpiv-hub under IRR-5.
4. Delete the misleading earlier artifact.

Do not infer production-deployment approval from approval to push code or modify Actions settings.

## Recommended Next Sequence

### 1. Activate Upstream Intake

Scheduled GitHub workflows execute from the default branch. The sync workflow is committed only on `mpiv/prod`, so it is not active while `main` remains default.

After explicit approval:

```bash
gh repo edit MPIsaac-Per/bb --default-branch mpiv/prod
gh workflow run mpiv-upstream-sync.yml --repo MPIsaac-Per/bb --ref mpiv/prod
```

Wait for `Sync MPIV With Upstream` to complete. It should fast-forward `fork/main` to current upstream and report that no integration is needed because current upstream is already contained in `mpiv/prod`.

Verify:

```bash
gh repo view MPIsaac-Per/bb --json defaultBranchRef
gh workflow list --repo MPIsaac-Per/bb
git fetch origin main
git fetch fork main mpiv/prod
git rev-list --left-right --count fork/main...origin/main
git rev-list --left-right --count origin/main...fork/mpiv/prod
```

Expected counts immediately after the first sync are `0 0` for `fork/main...origin/main` and `0 8` for `origin/main...fork/mpiv/prod`, unless upstream or downstream has advanced.

Configure `mpiv/prod` so normal changes require a pull request and the repository's full CI. Confirm the exact required check names from a real pull request before enforcing them.

### 2. Reconfirm The Release

Download the artifact into a fresh directory and verify the manifest and checksum:

```bash
artifact_dir="$(mktemp -d /tmp/mpiv-release.XXXXXX)"
gh run download 33324408498 --repo MPIsaac-Per/bb --dir "$artifact_dir"
manifest="$(find "$artifact_dir" -name mpiv-provenance.json -type f -print -quit)"
artifact="$(find "$artifact_dir" -name 'bb-app-*.tgz' -type f -print -quit)"
jq . "$manifest"
shasum -a 256 "$artifact"
node scripts/mpiv-hub-deploy.mjs --artifact "$artifact" --manifest "$manifest"
```

Stop if the source commit, upstream base, version, protocol, or checksum differs from the verified values in this handover.

### 3. Deploy Only After IRR-5 Approval

After the user explicitly approves production deployment of this exact version and checksum:

```bash
node scripts/mpiv-hub-deploy.mjs \
  --artifact "$artifact" \
  --manifest "$manifest" \
  --deploy
```

The command uploads one verified release, captures the installed package and a consistent SQLite backup, installs the artifact, restarts `bb-server.service`, verifies health and version, and rolls back automatically on failed verification.

### 4. Read Back Production

Verify primary records rather than relying on the deployment command's exit code alone:

```bash
ssh hub 'bash -lc '\''systemctl --user is-active bb-server.service; bb --version; curl --silent --show-error http://127.0.0.1:38886/install/version'\'''
BB_SERVER_URL=https://mpiv.getbb.app bb status --json
BB_SERVER_URL=https://mpiv.getbb.app bb settings version
BB_SERVER_URL=https://mpiv.getbb.app bb machine list --json
```

Expected server version is `0.40.1-mpiv.33324408498.1` with protocol `174`. Confirm the Mac and Hub machines reconnect without a rejected protocol. If a connected daemon remains behind after its retry window, inspect it before using `bb machine retry-update <id-or-name>`. Check Omarchy separately when it reconnects.

Create one real thread on the intended machine and exercise project archiving and per-project sidebar thread limits. This is the production acceptance event.

## Guardrails

- Never deploy an artifact whose manifest was produced against stale `fork/main`; current workflow code fetches upstream directly.
- Never run the broad monorepo test corpus inside the artifact workflow. Pull-request CI owns that gate; artifact CI owns distribution tooling and tarball smoke.
- Always use Turbo for build, typecheck, and test commands.
- Never deploy without an exact artifact, matching manifest, non-mutating plan, and explicit IRR-5 approval.
- Treat a database-destructive or contract-phase migration as a separate IRR-1 approval.
- Increment `HOST_DAEMON_PROTOCOL_VERSION` whenever wire compatibility changes.
- Preserve the upstream-signed desktop shell unless an Electron main-process customization justifies a separate signed channel.
- Keep the Hub and enrolled-machine topology distinct: mpiv-hub owns the central server; the Mac and Omarchy are execution machines.

## Cost Note

The repository is public and uses standard GitHub-hosted runners, so Actions compute is free. Each MPIV artifact is approximately 36 MB and currently has 30-day retention. At handover, two artifacts consumed about 72 MB. Consider reducing retention to 14 days if build frequency increases.
