import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { LandingPage } from "@/components/marketing/LandingPage"

const marketingHosts = new Set(["omnichat.to", "www.omnichat.to"])

export default async function Home() {
  const requestHeaders = await headers()
  const host = (requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "")
    .split(":")[0]
    .toLowerCase()

  if (!marketingHosts.has(host)) {
    redirect("/inbox")
  }

  return <LandingPage />
}
