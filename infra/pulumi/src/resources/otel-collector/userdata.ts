import { readFileSync } from "node:fs"
import { resolve } from "node:path"

export interface UserdataInput {
  grafanaOtlpEndpoint: string
  grafanaOtlpInstanceId: string
  grafanaOtlpAuth: string
  inboundToken: string
  collectorVersion: string
}

export function renderUserdata(input: UserdataInput): string {
  const config = readFileSync(resolve(__dirname, "./otel-config.yaml"), "utf8")
  return `#!/bin/bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y wget curl ca-certificates

# Install otelcol-contrib
cd /tmp
wget -q "https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v${input.collectorVersion}/otelcol-contrib_${input.collectorVersion}_linux_amd64.deb"
dpkg -i "otelcol-contrib_${input.collectorVersion}_linux_amd64.deb" || apt-get install -fy

# Persistent queue + config dirs
mkdir -p /etc/otelcol-contrib /var/lib/otelcol/queue
chown otelcol-contrib:otelcol-contrib /var/lib/otelcol /var/lib/otelcol/queue

# Write collector config
cat > /etc/otelcol-contrib/config.yaml <<'CONFIG_EOF'
${config}
CONFIG_EOF

# Env file with secrets -- readable by otelcol-contrib service
cat > /etc/otelcol-contrib/env <<EOF
GRAFANA_OTLP_ENDPOINT=${input.grafanaOtlpEndpoint}
GRAFANA_OTLP_INSTANCE_ID=${input.grafanaOtlpInstanceId}
GRAFANA_OTLP_AUTH=${input.grafanaOtlpAuth}
OTLP_INBOUND_TOKEN=${input.inboundToken}
EOF
chmod 600 /etc/otelcol-contrib/env
chown otelcol-contrib:otelcol-contrib /etc/otelcol-contrib/env

# systemd override to load the env file
mkdir -p /etc/systemd/system/otelcol-contrib.service.d
cat > /etc/systemd/system/otelcol-contrib.service.d/override.conf <<EOF
[Service]
EnvironmentFile=/etc/otelcol-contrib/env
EOF

systemctl daemon-reload
systemctl enable otelcol-contrib
systemctl restart otelcol-contrib
`
}
