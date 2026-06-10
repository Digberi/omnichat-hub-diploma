"use client"

import * as Sentry from "@sentry/nextjs"

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  Sentry.captureException(error)

  return (
    <html>
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
        <h2>Something went wrong</h2>
        <p>Try again or contact support.</p>
      </body>
    </html>
  )
}

