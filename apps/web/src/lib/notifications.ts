// In-tab notification UX for new inbound messages: browser notification
// (Notification API), short beep (WebAudio), tab title pulse, and favicon
// dot. All client-side, no backend changes — Service Worker push (works
// with the tab closed) will come in a follow-up PR.

const NOTIFY_TITLE_PREFIX = "(%d) "

type DocTitleState = {
  base: string
  unread: number
}

const titleState: DocTitleState = { base: "", unread: 0 }
let audioCtx: AudioContext | null = null
let originalFaviconHref: string | null = null

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined"
}

function captureBaseTitle(): void {
  if (!isBrowser()) return
  if (titleState.base) return
  // Strip any leading "(N) " prefix already on the title (handles a
  // hard reload while the tab was unread).
  titleState.base = document.title.replace(/^\(\d+\)\s*/, "")
}

function renderTitle(): void {
  if (!isBrowser()) return
  captureBaseTitle()
  const prefix = titleState.unread > 0 ? NOTIFY_TITLE_PREFIX.replace("%d", String(titleState.unread)) : ""
  document.title = prefix + titleState.base
}

function captureOriginalFavicon(): void {
  if (!isBrowser()) return
  if (originalFaviconHref !== null) return
  const link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
  originalFaviconHref = link?.href ?? ""
}

function setFaviconWithDot(show: boolean): void {
  if (!isBrowser()) return
  captureOriginalFavicon()
  let link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
  if (!link) {
    link = document.createElement("link")
    link.rel = "icon"
    document.head.appendChild(link)
  }
  if (!show) {
    if (originalFaviconHref) link.href = originalFaviconHref
    return
  }
  // Draw a 32×32 favicon with the original image + a red dot top-right.
  // Drawing on canvas keeps us free of an asset bundle and lets the same
  // helper work in dev (no `/favicon-with-dot.ico` baked in).
  const size = 32
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  const img = new Image()
  img.crossOrigin = "anonymous"
  img.onload = () => {
    ctx.clearRect(0, 0, size, size)
    ctx.drawImage(img, 0, 0, size, size)
    ctx.fillStyle = "#ef4444"
    ctx.beginPath()
    ctx.arc(size - 8, 8, 7, 0, Math.PI * 2)
    ctx.fill()
    link.href = canvas.toDataURL("image/png")
  }
  img.onerror = () => {
    // Fallback: draw just the dot on a transparent square. Loses brand
    // recognition but still signals "unread".
    ctx.clearRect(0, 0, size, size)
    ctx.fillStyle = "#ef4444"
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2)
    ctx.fill()
    link.href = canvas.toDataURL("image/png")
  }
  img.src = originalFaviconHref || "/favicon.ico"
}

export function bumpUnreadIndicator(): void {
  if (!isBrowser()) return
  titleState.unread += 1
  renderTitle()
  setFaviconWithDot(true)
}

export function clearUnreadIndicator(): void {
  if (!isBrowser()) return
  if (titleState.unread === 0) return
  titleState.unread = 0
  renderTitle()
  setFaviconWithDot(false)
}

// Auto-clear when the tab becomes visible — matches user intuition
// ("I'm looking at it now, stop nagging me").
export function installVisibilityAutoClear(): () => void {
  if (!isBrowser()) return () => undefined
  const onVisibility = () => {
    if (document.visibilityState === "visible") clearUnreadIndicator()
  }
  document.addEventListener("visibilitychange", onVisibility)
  return () => document.removeEventListener("visibilitychange", onVisibility)
}

export type NotificationPermissionState = "granted" | "denied" | "default" | "unsupported"

export function getNotificationPermission(): NotificationPermissionState {
  if (!isBrowser()) return "unsupported"
  if (typeof Notification === "undefined") return "unsupported"
  return Notification.permission
}

export type UnsupportedPlatformHint = {
  reason: "ios-tab" | "generic"
  message: string
  /** Optional follow-up action — e.g. PWA install docs. */
  action?: { label: string; href: string }
}

// User-facing guidance when `getNotificationPermission()` returns
// `"unsupported"`. Today this fires almost exclusively on Safari iOS in
// a regular browser tab — the Notification API is simply absent there.
// The fallback message is intentionally generic so we don't fingerprint
// users beyond what's actionable; the iOS branch is special-cased
// because Web Push DOES work on iOS 16.4+ once the PWA is installed
// to the home screen, and a native iOS app is on the roadmap.
//
// Keep this purely advisory — never gate functionality on the result.
export function getUnsupportedPlatformHint(): UnsupportedPlatformHint {
  if (!isBrowser()) {
    return {
      reason: "generic",
      message: "Сповіщення не підтримуються у цьому середовищі.",
    }
  }
  const ua = navigator.userAgent
  const isIOS = /iPhone|iPad|iPod/.test(ua)
  // iPadOS 13+ identifies as Mac in UA. `maxTouchPoints` > 1 disambiguates.
  const looksLikeIPadOS =
    /Mac/.test(ua) && typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 1
  const isStandalonePWA =
    typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches

  if ((isIOS || looksLikeIPadOS) && !isStandalonePWA) {
    return {
      reason: "ios-tab",
      message:
        "Safari на iOS не підтримує web-сповіщення у звичайному вкладці. Встановіть омнічат як PWA (поділитись → На головний екран) — на iOS 16.4+ push працює через встановлений PWA. Повноцінний native iOS-додаток — у roadmap.",
      action: {
        label: "Як додати на головний екран",
        href: "https://support.apple.com/guide/iphone/bookmark-favorite-webpages-iph42ab2f3a7/ios",
      },
    }
  }

  return {
    reason: "generic",
    message:
      "Ваш браузер не підтримує web-сповіщення. Спробуйте Chrome, Edge або Firefox, та перевірте чи дозволено сповіщення у налаштуваннях OS для браузера.",
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!isBrowser()) return "unsupported"
  if (typeof Notification === "undefined") return "unsupported"
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission
  }
  try {
    const result = await Notification.requestPermission()
    return result
  } catch {
    return "default"
  }
}

export function showBrowserNotification(input: {
  title: string
  body: string
  tag?: string
  onClick?: () => void
}): void {
  if (!isBrowser()) return
  if (typeof Notification === "undefined") return
  if (Notification.permission !== "granted") return
  // Show the OS-level popup regardless of tab visibility. macOS already
  // suppresses banner-style notifications when the app is in focus, so
  // we don't need to second-guess it here; on Windows / Linux the
  // operator may have the tab visible but on a different monitor or
  // behind another window, and silencing there leaves them blind.
  try {
    const n = new Notification(input.title, {
      body: input.body.slice(0, 200),
      ...(input.tag ? { tag: input.tag } : {}),
      icon: "/favicon.ico",
      silent: false,
    })
    if (input.onClick) {
      n.onclick = () => {
        window.focus()
        input.onClick?.()
        n.close()
      }
    }
  } catch {
    // ignore — Notification constructor throws on some platforms when
    // permission has been silently revoked.
  }
}

// Plays a soft 880 Hz beep for ~120 ms via WebAudio. Re-uses one
// AudioContext to avoid hitting per-context limits.
export function playNotificationBeep(): void {
  if (!isBrowser()) return
  type WindowWithAudioCtx = Window & { webkitAudioContext?: typeof AudioContext }
  const w = window as WindowWithAudioCtx
  const Ctor = window.AudioContext ?? w.webkitAudioContext
  if (!Ctor) return
  try {
    if (!audioCtx) audioCtx = new Ctor()
    if (audioCtx.state === "suspended") void audioCtx.resume()
    const now = audioCtx.currentTime
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.type = "sine"
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.18, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13)
    osc.connect(gain).connect(audioCtx.destination)
    osc.start(now)
    osc.stop(now + 0.14)
  } catch {
    // ignore — autoplay policy can block until the user interacts;
    // worst case the operator misses the beep but the title pulse
    // still flashes.
  }
}
