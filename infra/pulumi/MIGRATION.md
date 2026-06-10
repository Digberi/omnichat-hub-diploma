# Migration: hand-rolled dynamic resources → `@digberi/pulumi-infisical`

Step-by-step plan for replacing the four `pulumi-nodejs:dynamic:Resource`
calls in [`src/infisical-resources.ts`](./src/infisical-resources.ts) with
the bridged provider in [`@digberi/pulumi-infisical`](https://github.com/Digberi/pulumi-infisical).

The bridge has been verified end-to-end against the same Infisical project
the prod stack uses (see `pulumi-infisical-sandbox`). What remains is a
careful state migration so that the existing KMS key — which production
data is encrypted under — is preserved, not destroyed.

## Current state (as of HEAD)

| Resource (URN) | Type | Lives in code at |
|---|---|---|
| `kms-channel-tokens` | `pulumi-nodejs:dynamic:Resource` (InfisicalKmsKey) | `src/index.ts:49` |
| `kms-client-id` | `pulumi-nodejs:dynamic:Resource` (InfisicalSecretLookup) | `src/index.ts:63` |
| `kms-client-secret` | `pulumi-nodejs:dynamic:Resource` (InfisicalSecretLookup) | `src/index.ts:72` |
| `kms-key-id-secret` | `pulumi-nodejs:dynamic:Resource` (InfisicalSecret) | `src/index.ts:82` |

Package dependency: `@digberi/pulumi-infisical` is installed via
`github:Digberi/pulumi-infisical#2cdd6eb` (pinned commit). Resolution
relies on `gh auth login` having populated git credential.helper on the
host running `pnpm install` — see "Prerequisites" below.

## Target state

| Resource | Bridged type | Notes |
|---|---|---|
| `kms-channel-tokens` | `infisical.KmsKey` | Same Infisical KMS key, same `keyId` output. State-migrated, not recreated. |
| `kms-client-id` | `infisical.getSecret(...)` invocation | Becomes a data-source function call, not a resource. Old state entry deleted. |
| `kms-client-secret` | `infisical.getSecret(...)` invocation | Same. |
| `kms-key-id-secret` | `infisical.Secret` | Same secret value, state-migrated. |

The `infisical-resources.ts` file gets deleted at the end of the migration.

## Prerequisites

### 1. `@digberi/pulumi-infisical` distribution — RESOLVED

omnichat installs the package via a pinned GitHub commit ref:

```json
"@digberi/pulumi-infisical": "github:Digberi/pulumi-infisical#2cdd6eb"
```

Authentication to the private repo is handled by a **fully Pulumi-managed
deploy-key flow**, provisioned by the sibling stack
[`pulumi-gh-access`](../../../../WebstormProjects/pulumi-gh-access/). That
stack exposes a `GithubPrivatePackageAccess` ComponentResource that, per
private repo, declares 5 children entirely in Pulumi state:

- `tls.PrivateKey` — ed25519 keypair minted by Pulumi.
- `github.RepositoryDeployKey` — public half uploaded as a read-only deploy key.
- `command.local.Command` × 3 — write the private key file to
  `~/.ssh/<repo>-deploy-<machine>`, append a banner-bounded block to
  `~/.ssh/config`, and set the git `url.<alias>:owner/repo.insteadOf
  https://github.com/owner/repo` rewrite.

`pulumi refresh` detects drift on both GitHub and the local files.
`pulumi destroy` cleanly removes the deploy key from GitHub AND wipes the
local artefacts — no `bootstrap.sh` hand-script anywhere.

Verified end-to-end on this workstation:

- `git ls-remote https://github.com/Digberi/pulumi-infisical` resolves
  via SSH + deploy key (confirmed via `GIT_TRACE=1`).
- `pnpm install` against the github ref clones over SSH, runs the
  `"prepare": "tsc"` script, and populates `dist/` with the full SDK.
- No `.env.tokens` entry needed for repo access; no PAT to rotate.

**Onboarding a new machine** (any future runner — second laptop, additional
self-hosted server, etc.):

```bash
# Requires PULUMI_ACCESS_TOKEN in env (already in .env.tokens).
# Requires gh auth on the machine (provides GITHUB_TOKEN).
git clone <pulumi-gh-access repo>
cd pulumi-gh-access
pnpm install
pulumi stack init Digberi/pulumi-gh-access/local-<new-label>
GITHUB_TOKEN=$(gh auth token) pulumi up
```

That gets the new machine into the same state as existing ones. Each
machine has its own per-machine deploy key on the repo (GitHub allows
many; each key is named with the machine label and rotation date).

**Adding more private repos** to the access set: bump the `repos` config
array in `pulumi-gh-access`, re-run `pulumi up`, then re-run
`bootstrap.sh` on every machine.

**Rotating the deploy key**: bump `rotation` config in `pulumi-gh-access`,
re-run `pulumi up` on the affected machine. The same apply destroys the
old keypair, mints a new one, replaces the deploy key on GitHub, and
updates the local file + `git config` rewrite in one cycle.

Fallbacks if a runner can't run `pulumi up` (e.g. GitHub-hosted Actions
runner without access to Pulumi state):

- **Fine-grained PAT in `GH_TOKEN` env var** with git credential helper.
- **GitHub Packages npm registry** with `.npmrc`.
- **Public npm publish** — flip pulumi-infisical visibility to public and
  `npm publish` — simplest but exposes the package globally.

### 2. Pulumi CLI version

Local + CI both need Pulumi ≥ 3.200 for parameterized `terraform-provider`
plugins. Stable Homebrew (3.144.x) is too old. Use `~/.pulumi/bin/pulumi`
(dev channel, 3.243.0-alpha) locally; pin `pulumi-version: dev` in any
GitHub Actions step that runs pulumi commands against this stack.

### 3. State backup

Before any state surgery, snapshot the stack:

```bash
cd infra/pulumi
pulumi stack export --stack Digberi/omnichat/prod --show-secrets \
  > /tmp/omnichat-prod-state-$(date +%Y%m%d-%H%M%S).json
```

Keep this file offline. If anything goes sideways, `pulumi stack import`
restores everything verbatim.

## Migration order (low-to-high risk)

Do these in order, one PR per step, with a `pulumi up` between each.

1. **Data sources first** (lowest risk — deletes are no-ops by design).
2. **Secret resource** (medium risk — short window where secret is "owned" by neither resource).
3. **KMS key last** (highest risk — KMS deletion would break decryption of all encrypted-at-rest channel tokens).

### Step 1 — Replace `InfisicalSecretLookup` calls with `getSecret`

Both `kms-client-id` and `kms-client-secret` are read-only lookups. In the
dynamic implementation they are full resources tracked in state but whose
`delete()` is intentionally a no-op. Migration is straightforward:

**Code change** (in `src/index.ts`):

```diff
-  const clientIdSecret = new InfisicalSecretLookup("kms-client-id", {
-    clientId: config.infisicalDeployClientId,
-    clientSecret: config.infisicalDeployClientSecret,
-    siteUrl: config.infisicalSiteUrl,
-    projectId: config.infisicalProjectId,
-    environmentSlug: config.infisicalEnvironmentSlug,
-    secretKey: "INFISICAL_CLIENT_ID",
-  })
-
-  const clientSecretSecret = new InfisicalSecretLookup("kms-client-secret", {
-    clientId: config.infisicalDeployClientId,
-    clientSecret: config.infisicalDeployClientSecret,
-    siteUrl: config.infisicalSiteUrl,
-    projectId: config.infisicalProjectId,
-    environmentSlug: config.infisicalEnvironmentSlug,
-    secretKey: "INFISICAL_CLIENT_SECRET",
-  })
+  // Provider scoped to the secrets project. Reused by all bridged calls
+  // below; replaces the per-resource auth fields in the old dynamic types.
+  const infisicalProvider = new digberiInfisical.Provider("infisical", {
+    host: config.infisicalSiteUrl,
+    clientId: config.infisicalDeployClientId,
+    clientSecret: config.infisicalDeployClientSecret,
+  })
+
+  const clientIdLookup = digberiInfisical.getSecretOutput({
+    workspaceId: config.infisicalProjectId,
+    envSlug: config.infisicalEnvironmentSlug,
+    folderPath: "/",
+    secretKey: "INFISICAL_CLIENT_ID",
+  }, { provider: infisicalProvider })
+
+  const clientSecretLookup = digberiInfisical.getSecretOutput({
+    workspaceId: config.infisicalProjectId,
+    envSlug: config.infisicalEnvironmentSlug,
+    folderPath: "/",
+    secretKey: "INFISICAL_CLIENT_SECRET",
+  }, { provider: infisicalProvider })
```

…and update the downstream `infisicalRuntime` block:

```diff
   infisicalRuntime = {
     baseUrl: pulumi.interpolate`${config.infisicalSiteUrl}/api/v1`,
-    clientId: clientIdSecret.secretValue,
-    clientSecret: pulumi.secret(clientSecretSecret.secretValue),
+    clientId: clientIdLookup.secretValue,
+    clientSecret: pulumi.secret(clientIdLookup.apply(s => s.secretValue)),
     kmsKeyId: infisicalKmsKey.keyId,
   }
```

**State migration** (no surgery needed — old entries can simply be removed):

```bash
pulumi state delete --stack prod \
  'urn:pulumi:prod::omnichat::pulumi-nodejs:dynamic:Resource::kms-client-id'
pulumi state delete --stack prod \
  'urn:pulumi:prod::omnichat::pulumi-nodejs:dynamic:Resource::kms-client-secret'
```

These are safe deletes — the dynamic providers' `delete()` method is a
no-op (read-only data sources). Pulumi will not touch Infisical.

Then `pulumi up` — should be a no-op for these two (gone from state, gone
from code) plus the function-invocation resolution at apply time.

### Step 2 — Migrate `kms-key-id-secret` to bridged `Secret`

This is a real resource — actually owns a secret value in Infisical.
Need import-style state migration so the secret is preserved.

**Code change** (in `src/index.ts`):

```diff
-  new InfisicalSecret("kms-key-id-secret", {
-    clientId: config.infisicalDeployClientId,
-    clientSecret: config.infisicalDeployClientSecret,
-    siteUrl: config.infisicalSiteUrl,
-    projectId: config.infisicalProjectId,
-    environmentSlug: config.infisicalEnvironmentSlug,
-    secretKey: "INFISICAL_KMS_KEY_ID",
-    secretValue: infisicalKmsKey.keyId,
-  })
+  new digberiInfisical.Secret("kms-key-id-secret", {
+    workspaceId: config.infisicalProjectId,
+    envSlug: config.infisicalEnvironmentSlug,
+    folderPath: "/",
+    name: "INFISICAL_KMS_KEY_ID",
+    value: pulumi.secret(infisicalKmsKey.keyId),
+  }, { provider: infisicalProvider })
```

**State migration** — Pulumi state surgery:

```bash
# 1. Remove the old dynamic entry from state without touching Infisical
pulumi state delete --stack prod \
  'urn:pulumi:prod::omnichat::pulumi-nodejs:dynamic:Resource::kms-key-id-secret'

# 2. Add `import:` to the new resource on FIRST apply, then drop it.
# Pulumi needs an ID to import. The Infisical Secret ID is its server-side
# UUID. Find it via:
curl -s "$INFISICAL_HOST/api/v3/secrets/raw/INFISICAL_KMS_KEY_ID?workspaceId=$PROJECT_ID&environment=prod&secretPath=%2F" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.secret.id'

# Then add to code temporarily:
#   {...args}, { provider, import: "<UUID>" }
#
# Run pulumi up — Pulumi imports. Then remove `import:` in a follow-up commit.
```

Validate: `pulumi refresh && pulumi preview` should be "no changes".

### Step 3 — Migrate `kms-channel-tokens` to bridged `KmsKey` (DEFERRED)

**Status: blocked on upstream bridge limitation.** Attempted 2026-05-21
and reverted in commit `2ff7e24`. Pre-surgery prod state was restored
from `/tmp/omnichat-prod-state-20260521-153320.json` (kept on the
operator workstation for emergency rollback).

**Root cause.** The Infisical TF provider's `kms_key` resource declares
`project_id` as required input but its GET endpoint omits the field
from the response. After `import:`, Pulumi's state has
`projectId = nil`; the value in code is a non-empty UUID; Pulumi
computes `+ projectId` as a diff, which forces REPLACE on a
create-time-only field. REPLACE is forbidden while `import:` is set
and would in any case destroy the live KEK that every encrypted
channel token in prod Postgres is bound to.

**Attempts that did not work.**

- `ignoreChanges: ["projectId", ...]` — schema validator still rejects
  the resource as missing the required `projectId` input.
- Composite import ID `<projectId>/<keyId>` — TF bridge does not parse
  the slash form for this resource; import returns an empty state.
- Manual state injection with synthetic provider URN — provider URN
  isn't stable until first apply, and a synthetic placeholder fails
  schema validation on import.

**Path forward.** Re-attempt once one of the following lands:

1. Infisical TF provider issues a release that surfaces `project_id`
   in the GET response (track via
   [Infisical/terraform-provider-infisical issues](https://github.com/Infisical/terraform-provider-infisical/issues)).
2. Pulumi terraform-bridge gains a way to declare "import value comes
   from a different field than state value" so the bridge can populate
   projectId from the import directive itself.
3. Or: write a one-off `pulumi import` CLI run from a fully-configured
   workstation (with `INFISICAL_DEPLOY_*` creds available locally) so
   Pulumi can prompt for or compute the missing input outside the
   non-interactive `pulumi up` flow.

**Until then.** The KEK keeps using the hand-rolled `InfisicalKmsKey`
dynamic resource in [`src/infisical-resources.ts`](./src/infisical-resources.ts).
Steps 1 and 2 shipped successfully; the file still exports the
`InfisicalKmsKey` class but its `InfisicalSecret` and
`InfisicalSecretLookup` siblings have been removed as dead code (no
remaining call sites after Step 2).

---

#### Original planned approach (kept for reference)

The KMS key is the **most sensitive** resource in the stack — its `keyId`
is referenced by encrypted channel tokens in production Postgres. Destroying
and recreating it would orphan all encrypted data.

**Pre-check**: confirm the bridge maps the same Infisical KMS key endpoint
(the dynamic implementation uses `POST/DELETE /api/v1/kms/keys`; the TF
provider's `kms_key` resource — verify in
[`docs/resources/kms_key.md`](https://github.com/Infisical/terraform-provider-infisical/blob/main/docs/resources/kms_key.md)
that the same endpoint is used and that `id` = key UUID).

**Code change** (in `src/index.ts`):

```diff
-  const infisicalKmsKey = new InfisicalKmsKey("kms-channel-tokens", {
-    clientId: config.infisicalDeployClientId,
-    clientSecret: config.infisicalDeployClientSecret,
-    siteUrl: config.infisicalSiteUrl,
-    projectId: config.infisicalKmsProjectId,
-    name: config.infisicalKmsKeyName,
-    description: "KEK for omnichat marketplace channel token envelope encryption",
-  })
+  // Separate provider for the KMS project — different projectId scope.
+  const infisicalKmsProvider = new digberiInfisical.Provider("infisical-kms", {
+    host: config.infisicalSiteUrl,
+    clientId: config.infisicalDeployClientId,
+    clientSecret: config.infisicalDeployClientSecret,
+  })
+  const infisicalKmsKey = new digberiInfisical.KmsKey("kms-channel-tokens", {
+    projectId: config.infisicalKmsProjectId,
+    name: config.infisicalKmsKeyName,
+    description: "KEK for omnichat marketplace channel token envelope encryption",
+    encryptionAlgorithm: "aes-256-gcm",   // matches the dynamic implementation default
+  }, { provider: infisicalKmsProvider, protect: true })
```

Note `protect: true` — explicitly forbids `pulumi destroy` from deleting
this resource. Must `pulumi state unprotect` first if ever needed.

**State migration** (same import-style):

```bash
# 1. Capture the current keyId BEFORE state surgery
pulumi stack output --stack prod --show-secrets | jq -r '...'
# (Look at the old dynamic resource's outputs; it stores `keyId`.)
# Alternatively, query Infisical:
curl -s "$INFISICAL_HOST/api/v1/kms/keys?projectId=$KMS_PROJECT_ID" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.keys[] | select(.name=="<key-name>") | .id'

# 2. Remove the old dynamic entry from state without deleting the key
pulumi state delete --stack prod \
  'urn:pulumi:prod::omnichat::pulumi-nodejs:dynamic:Resource::kms-channel-tokens'

# 3. Apply with `import: "<keyId>"` temporarily on the new KmsKey
#    pulumi up — Pulumi imports.
# 4. Remove `import:` in follow-up commit.
```

Validate: app smoke test → encrypt + decrypt a sample channel token. If
that round-trips successfully, migration is good.

### Step 4 — Clean up

Once all 4 resources are migrated and validated:

1. Delete `src/infisical-resources.ts` (~330 lines).
2. Delete the `import { InfisicalKmsKey, InfisicalSecret, InfisicalSecretLookup } from "./infisical-resources"` line in `src/index.ts`.
3. `pnpm typecheck` — should still pass.
4. Single follow-up PR titled `chore(infra): drop hand-rolled Infisical dynamic resources`.

## Rollback strategy

Each step in this migration is reversible **up to the last `pulumi up`** that
committed the state surgery. The window is:

- Code changes can be reverted via `git revert`.
- State changes (via `state delete` / `import:`) can be undone by:
  ```bash
  pulumi stack import --stack prod < /tmp/omnichat-prod-state-<timestamp>.json
  ```

If a smoke test fails AFTER `pulumi up`:

1. Restore state from the backup file taken at step 0.
2. `git revert` the migration commit.
3. `pulumi up` — restores the dynamic resources.
4. Real data in Infisical is untouched throughout (we only ever `state delete`
   from Pulumi's view; we never call destructive Infisical API).

## Open decisions before starting

1. **Migration window**: KMS key import (step 3) needs a maintenance pause
   on the worker that calls Infisical KMS encrypt/decrypt. Roughly 30 seconds
   of "no new encrypt operations" while Pulumi swaps state. Coordinate.
2. **Provider scoping**: the migration adds two `digberiInfisical.Provider`
   instances (one for secrets project, one for KMS project). Confirm that
   the Universal Auth identity has scopes on BOTH projects, OR provision
   a dedicated identity per project before flipping.
3. **Commit pin for `@digberi/pulumi-infisical`**: currently pinned at
   `#2cdd6eb`. Bump intentionally when upstream Infisical TF provider
   versions ship breaking changes — review the diff in `pulumi-infisical`
   `CHANGELOG.md` before bumping the pin in this stack.

## Reference: bridged provider quirks

- `Secret.workspaceId` (not `projectId`) — quirk of TF schema. `SecretFolder` uses `projectId`. Both names are correct in their respective resources.
- `getSecretOutput(...)` is the lazy/Output-friendly form of `getSecret(...)`. Use it inside Pulumi programs; use `getSecret` only in synchronous boot code.
- Provider config accepts both deprecated flat `clientId`/`clientSecret` and the newer `auth.universal.{clientId,clientSecret}` shape. Either works.
- First `pulumi up` after migration downloads the parameterized TF plugin (`terraform-provider@1.1.1`) — ~30-60 seconds on a cold runner.

## Verified independently in sandbox

The bridge mechanism has been validated end-to-end against the same
Infisical project this stack uses (`Secrets`, id `dac18021-cee6-484d-8b3d-3c5c9cc74aaa`,
env `dev`). Cycle: `preview → up → verify via API → refresh (no drift) → destroy → confirm gone`.
Total wall time: ~10 seconds. See `~/WebstormProjects/pulumi-infisical-sandbox/` for the standalone reproducer.
