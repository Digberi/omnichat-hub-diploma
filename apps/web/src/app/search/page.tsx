import { Suspense } from "react"

import { SearchPageClient } from "./SearchPageClient"

export default function SearchPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-neutral-50 p-6">Loading...</main>}>
      <SearchPageClient />
    </Suspense>
  )
}

