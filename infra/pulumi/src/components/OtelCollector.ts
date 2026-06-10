import * as digitalocean from "@pulumi/digitalocean"
import * as pulumi from "@pulumi/pulumi"

import { renderUserdata } from "../resources/otel-collector/userdata"

export interface OtelCollectorArgs {
  region: pulumi.Input<string | digitalocean.Region>
  vpcUuid: pulumi.Input<string>
  sshKeyFingerprints: pulumi.Input<pulumi.Input<string>[]>
  grafanaOtlpEndpoint: pulumi.Input<string>
  /** Grafana Cloud stack ID — used as Basic auth username for the unified OTLP gateway. */
  grafanaOtlpInstanceId: pulumi.Input<string>
  grafanaOtlpAuth: pulumi.Input<string>
  /** Bearer token required on inbound OTLP requests (collector authenticates clients). */
  inboundToken: pulumi.Input<string>
  collectorVersion?: string
  size?: string
  /** CIDR allowed inbound on the collector's *internal* ports (8888 metrics). OTLP 4317/4318 are public. */
  inboundCidr: pulumi.Input<string>
}

export class OtelCollector extends pulumi.ComponentResource {
  public readonly droplet: digitalocean.Droplet
  public readonly privateIp: pulumi.Output<string>
  public readonly publicIp: pulumi.Output<string>
  public readonly otlpEndpoint: pulumi.Output<string>
  public readonly publicOtlpEndpoint: pulumi.Output<string>
  /** Public-no-auth OTLP/HTTP receiver for browser/Expo clients (port 4319, CORS-gated). */
  public readonly clientOtlpEndpoint: pulumi.Output<string>

  constructor(name: string, args: OtelCollectorArgs, opts?: pulumi.ComponentResourceOptions) {
    super("omnichat:observability:OtelCollector", name, {}, opts)

    const collectorVersion = args.collectorVersion ?? "0.130.0"

    const userdata = pulumi
      .all([
        args.grafanaOtlpEndpoint,
        args.grafanaOtlpInstanceId,
        args.grafanaOtlpAuth,
        args.inboundToken,
      ])
      .apply(([endpoint, instanceId, auth, token]) =>
        renderUserdata({
          grafanaOtlpEndpoint: endpoint,
          grafanaOtlpInstanceId: instanceId,
          grafanaOtlpAuth: auth,
          inboundToken: token,
          collectorVersion,
        }),
      )

    this.droplet = new digitalocean.Droplet(
      `${name}-droplet`,
      {
        name,
        region: args.region,
        size: args.size ?? "s-1vcpu-1gb",
        image: "ubuntu-24-04-x64",
        vpcUuid: args.vpcUuid,
        sshKeys: args.sshKeyFingerprints,
        userData: userdata,
        monitoring: true,
        ipv6: false,
        backups: false,
      },
      { parent: this },
    )

    new digitalocean.Firewall(
      `${name}-fw`,
      {
        name: `${name}-fw`,
        dropletIds: [this.droplet.id.apply((id) => Number(id))],
        inboundRules: [
          { protocol: "tcp", portRange: "22", sourceAddresses: ["0.0.0.0/0", "::/0"] },
          // OTLP 4317/4318 are public; bearertokenauth on the receiver gates access.
          // DO App Platform and the droplet live on isolated VPCs, so private routing isn't possible.
          { protocol: "tcp", portRange: "4317", sourceAddresses: ["0.0.0.0/0", "::/0"] },
          { protocol: "tcp", portRange: "4318", sourceAddresses: ["0.0.0.0/0", "::/0"] },
          // Public no-auth OTLP/HTTP for browser+Expo clients. CORS allowlist is enforced
          // inside the collector; firewall just lets the TCP through.
          { protocol: "tcp", portRange: "4319", sourceAddresses: ["0.0.0.0/0", "::/0"] },
          // Collector self-metrics stay VPC-internal.
          { protocol: "tcp", portRange: "8888", sourceAddresses: [args.inboundCidr] },
        ],
        outboundRules: [
          { protocol: "tcp", portRange: "1-65535", destinationAddresses: ["0.0.0.0/0", "::/0"] },
          { protocol: "udp", portRange: "53", destinationAddresses: ["0.0.0.0/0", "::/0"] },
        ],
      },
      { parent: this },
    )

    this.privateIp = this.droplet.ipv4AddressPrivate
    this.publicIp = this.droplet.ipv4Address
    this.otlpEndpoint = pulumi.interpolate`http://${this.privateIp}:4318`
    this.publicOtlpEndpoint = pulumi.interpolate`http://${this.publicIp}:4318`
    this.clientOtlpEndpoint = pulumi.interpolate`http://${this.publicIp}:4319`

    this.registerOutputs({
      privateIp: this.privateIp,
      publicIp: this.publicIp,
      otlpEndpoint: this.otlpEndpoint,
      publicOtlpEndpoint: this.publicOtlpEndpoint,
      clientOtlpEndpoint: this.clientOtlpEndpoint,
    })
  }
}
