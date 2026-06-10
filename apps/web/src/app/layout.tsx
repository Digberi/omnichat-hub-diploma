import "./globals.css";

import type { Metadata, Viewport } from "next"

export const metadata: Metadata = {
  title: "OmniChat",
  description: "Єдине робоче місце для клієнтських звернень та командної обробки діалогів.",
}

// `viewportFit: "cover"` lets the layout extend behind iPhone status bar /
// home indicator so `env(safe-area-inset-*)` resolves to real pixel values
// (used by ChatHeader / ChatInput below to dodge the notch + home bar).
//
// `interactiveWidget: "resizes-content"` is the modern (and only sane) iOS
// Safari knob for keyboard handling: when the soft keyboard opens, the
// visual viewport shrinks and `100dvh` re-evaluates instead of the
// pre-`dvh` behavior where the input ended up floating mid-screen with a
// fat black gap underneath. Combined with `h-dvh` on the inbox shell, the
// chat container always covers the *visible* viewport.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
}

import { AppProviders } from "./providers"

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uk" suppressHydrationWarning>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  )
}
