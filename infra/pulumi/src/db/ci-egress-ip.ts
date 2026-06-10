import * as command from "@pulumi/command"
import * as pulumi from "@pulumi/pulumi"

/**
 * Resolves the Pulumi host's public egress IP at apply time and exposes
 * it as a `<cidr>/32` Output. Plumbed into `DatabaseFirewall.trusted_sources`
 * so the host (whichever CI runner / dev machine is running `pulumi up`)
 * can reach managed Postgres for the `prisma-migrations` step.
 *
 * Why not a hardcoded Pulumi config? The runner's egress IP is not under
 * our control (ISP DHCP, router reboots, runner swap, ad-hoc dev box).
 * Hardcoding means every IP change becomes a manual `pulumi config set`
 * + redeploy ritual. Letting Pulumi curl the IP on every apply means the
 * firewall always reflects the host that's about to talk to PG.
 *
 * Trade-offs:
 *   - One extra HTTPS call to `ifconfig.me` per `pulumi up` (~50ms).
 *   - The `command.local.Command` triggers on the `triggerToken` arg, so
 *     callers control re-fetch cadence. Default trigger = the date in
 *     UTC (YYYY-MM-DD) — re-curls once a day. Pass a different token
 *     to force refresh out-of-band (e.g. after a known IP change).
 *   - `ifconfig.me` is a public service; if it's down or geo-blocks the
 *     runner, the apply fails fast with a clear curl error — never
 *     silently allows wrong IP.
 */
export interface CiEgressIpArgs {
  /**
   * Stable string that re-fetches the IP when changed. Default: today's
   * UTC date — re-curls once per day. Pass e.g. `Date.now().toString()`
   * to force every apply, or a fixed string to pin until you bump it.
   */
  triggerToken?: pulumi.Input<string>
}

export function ciEgressIp(name: string, args: CiEgressIpArgs = {}): pulumi.Output<string> {
  const trigger = args.triggerToken ?? new Date().toISOString().slice(0, 10)
  const fetcher = new command.local.Command(name, {
    // -fsSL: fail on HTTP error, silent, follow redirects.
    // -m 10: 10s connect+xfer cap so a hung resolver never blocks the apply.
    create: "curl -fsSL -m 10 ifconfig.me",
    update: "curl -fsSL -m 10 ifconfig.me",
    interpreter: ["/bin/bash", "-c"],
    triggers: [trigger],
  })
  // stdout includes a trailing newline; trim before slapping `/32` on it.
  return fetcher.stdout.apply((s) => `${s.trim()}/32`)
}
