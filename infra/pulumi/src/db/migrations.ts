import * as pulumi from "@pulumi/pulumi"
import * as command from "@pulumi/command"
import * as crypto from "crypto"
import * as fs from "fs"
import * as path from "path"

/**
 * Runs `prisma migrate deploy` against the managed Postgres as a Pulumi
 * resource — not a DO App PRE_DEPLOY job.
 *
 * Replaces the previous `db-migrate` DO App PRE_DEPLOY component. The
 * App Platform approach suffered from DO's git mirror drift: when
 * `deployOnPush: false`, DO would check out a stale commit that
 * predated the Dockerfile itself (PR #75 hit this exact failure mode —
 * commit 2084efd2 was cloned even though main HEAD was the new
 * Dockerfile commit). Running on the Pulumi host — which is either a
 * dev machine or the GitHub Actions runner — removes the extra moving
 * piece: we already have the full monorepo checked out at the exact
 * commit the apply is using.
 *
 * Trigger is the hash of `packages/db/{schema,migrations}`. Prisma's
 * `migrate deploy` is idempotent so a re-run is harmless, but hashing
 * keeps normal `pulumi up` runs a no-op when migrations haven't changed.
 */
export interface PrismaMigrateArgs {
  /**
   * Admin/direct connection URL (NOT the pooled one). Prisma's
   * `migrate deploy` needs advisory locks for `_prisma_migrations`,
   * which transaction-mode pgbouncer cannot hold.
   */
  directUrl: pulumi.Input<string>
  /**
   * Resources that must exist before migrations can run. Typically the
   * managed Postgres cluster — `local.Command` has no auto-dependency
   * on Pulumi Inputs resolved from other resources, so wire explicitly.
   */
  dependsOn?: pulumi.Input<pulumi.Resource>[] | pulumi.Resource[]
}

export function prismaMigrate(
  name: string,
  args: PrismaMigrateArgs,
  opts?: pulumi.CustomResourceOptions,
): command.local.Command {
  const repoRoot = path.resolve(__dirname, "../../../..")
  // Hash schema + migrations to short-circuit no-op runs. Skips
  // `node_modules`, `dist`, and `src/generated` which are build
  // artefacts (and gitignored).
  const schemaDir = path.join(repoRoot, "packages/db")
  const schemaHash = hashTree(schemaDir, ["node_modules", "dist", "src"])

  // Lifecycle wrapper — single-line JSON so it's queryable in Loki via
  //   {service_name="pulumi-infra"} |~ "migration.end"
  // when the Pulumi host stdout is forwarded. Carries schemaHash,
  // duration, outcome, exit code on failure.
  const migrateScript = [
    `set -euo pipefail`,
    `START=$(date -u +%s)`,
    `echo "[lifecycle] migration.start {\\"schemaHash\\":\\"${schemaHash.slice(0, 12)}\\",\\"ts\\":$(date -u +%s)}"`,
    `if pnpm --filter @omnichat/db run prisma:migrate:deploy; then`,
    `  END=$(date -u +%s); ELAPSED=$((END - START))`,
    `  echo "[lifecycle] migration.end {\\"outcome\\":\\"success\\",\\"durationSec\\":$ELAPSED,\\"schemaHash\\":\\"${schemaHash.slice(0, 12)}\\"}"`,
    `else`,
    `  RC=$?; END=$(date -u +%s); ELAPSED=$((END - START))`,
    `  echo "[lifecycle] migration.end {\\"outcome\\":\\"failure\\",\\"exitCode\\":$RC,\\"durationSec\\":$ELAPSED,\\"schemaHash\\":\\"${schemaHash.slice(0, 12)}\\"}"`,
    `  exit $RC`,
    `fi`,
  ].join("\n")

  return new command.local.Command(
    name,
    {
      create: migrateScript,
      update: migrateScript,
      // `delete` intentionally omitted — we don't reverse migrations on
      // stack destroy. If the stack is torn down, the managed DB goes
      // with it; no per-migration cleanup is meaningful.
      //
      // Pulumi `local.Command` defaults to POSIX `/bin/sh -c` (dash on
      // Debian/Ubuntu, including the GH Actions ubuntu runner and our
      // dev-ci self-hosted runner). Our wrapper uses `set -o pipefail`
      // which is a bash-only flag; dash exits with status 2 on that
      // line BEFORE reaching the migrate command. Pin to bash.
      interpreter: ["/bin/bash", "-c"],
      dir: repoRoot,
      environment: {
        // DATABASE_URL — what Prisma reads via `datasource db { url =
        // env("DATABASE_URL") }`. Point at the direct URL: pooler in
        // transaction mode can't hold the advisory locks
        // `_prisma_migrations` needs.
        DATABASE_URL: args.directUrl as pulumi.Input<string>,
        // DO Managed PG presents a self-signed cert chain. Prisma
        // doesn't surface a `no-verify` sslmode, so we drop chain
        // verification via Node's env toggle. Acceptable: connection
        // stays encrypted, the URL itself is the credential.
        NODE_TLS_REJECT_UNAUTHORIZED: "0",
      },
      triggers: [schemaHash],
    },
    opts,
  )
}

/**
 * Deterministic content hash of a directory tree. Skips directories
 * named in `ignore`. Sort order is lexical to stay reproducible across
 * filesystems.
 */
function hashTree(root: string, ignore: string[] = []): string {
  const files: string[] = []
  const ignoreSet = new Set(ignore)
  function walk(dir: string) {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ignoreSet.has(entry.name)) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile()) files.push(full)
    }
  }
  walk(root)
  files.sort()
  const hasher = crypto.createHash("sha256")
  for (const f of files) {
    hasher.update(path.relative(root, f))
    hasher.update("\0")
    hasher.update(fs.readFileSync(f))
    hasher.update("\0")
  }
  return hasher.digest("hex")
}
