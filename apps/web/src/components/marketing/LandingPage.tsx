import Link from "next/link"
import { ArrowRight, Clock3, Mail, PanelsTopLeft, ShieldCheck, Workflow } from "lucide-react"

import { Button } from "@/components/ui/button"

const pillars = [
  {
    title: "Єдиний робочий простір",
    description: "Уся вхідна комунікація збирається в одному місці, без ручного перемикання між вкладками.",
    icon: PanelsTopLeft,
  },
  {
    title: "Командний ритм без хаосу",
    description: "Діалоги не губляться, історія залишається прозорою, а відповідальність зрозуміла всій команді.",
    icon: Workflow,
  },
  {
    title: "Швидші відповіді",
    description: "Менше ручної рутини, більше часу на обробку звернень і реальну роботу з клієнтом.",
    icon: Clock3,
  },
  {
    title: "Контроль і надійність",
    description: "Єдина історія спілкування, структурована робота з діалогами та зрозумілий процес для оператора.",
    icon: ShieldCheck,
  },
]

const operatingPrinciples = [
  "Один inbox замість розкиданих чатів",
  "Публічний сайт для першого контакту, окремий застосунок для роботи",
  "Фокус на швидкості відповіді, історії діалогів і командному процесі",
]

export function LandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[linear-gradient(180deg,#fff8ef_0%,#fffdf8_44%,#ffffff_100%)] text-slate-950">
      <section className="relative isolate border-b border-black/5">
        <div className="absolute inset-x-0 top-0 -z-10 h-[28rem] bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.24),transparent_34%),radial-gradient(circle_at_80%_18%,rgba(14,165,233,0.16),transparent_28%)]" />
        <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 pb-16 pt-8 sm:px-8 lg:px-12">
          <header className="flex items-center justify-between">
            <div className="inline-flex items-center gap-3 rounded-full border border-black/10 bg-white/80 px-4 py-2 text-sm font-medium backdrop-blur">
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-orange-500" />
              OmniChat
            </div>
            <nav className="hidden items-center gap-3 md:flex">
              <Button asChild variant="ghost" className="rounded-full px-5 text-slate-700 hover:bg-black/5">
                <Link href="mailto:admin@omnichat.to">Звʼязатися</Link>
              </Button>
              <Button asChild className="rounded-full bg-slate-950 px-5 text-white hover:bg-slate-800">
                <Link href="https://app.omnichat.to/login">Увійти</Link>
              </Button>
            </nav>
          </header>

          <div className="grid flex-1 items-center gap-12 py-12 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-orange-700 animate-in fade-in duration-500">
                Командний inbox
              </div>
              <h1
                className="mt-6 max-w-4xl text-5xl font-bold leading-[0.94] tracking-[-0.05em] text-slate-950 sm:text-6xl lg:text-7xl"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Єдине робоче місце для клієнтських звернень та командної обробки діалогів.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">
                OmniChat допомагає зібрати комунікацію в одному потоці, прибрати ручний хаос і зробити роботу
                команди з діалогами передбачуваною.
              </p>
              <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                <Button
                  asChild
                  size="lg"
                  className="group h-12 rounded-full bg-orange-500 px-7 text-base text-white shadow-[0_18px_40px_-20px_rgba(249,115,22,0.7)] hover:bg-orange-600"
                >
                  <Link href="https://app.omnichat.to/login">
                    Відкрити застосунок
                    <ArrowRight className="transition-transform duration-200 group-hover:translate-x-1" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-12 rounded-full border-slate-300 bg-white/70 px-7 text-base text-slate-800 backdrop-blur hover:bg-white"
                >
                  <Link href="mailto:admin@omnichat.to">
                    <Mail />
                    Написати нам
                  </Link>
                </Button>
              </div>
              <div className="mt-12 grid gap-3 sm:grid-cols-3">
                {operatingPrinciples.map((item) => (
                  <div
                    key={item}
                    className="rounded-3xl border border-black/5 bg-white/75 p-4 text-sm font-medium leading-6 text-slate-700 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.25)] backdrop-blur animate-in fade-in duration-700"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="absolute -left-6 -top-6 h-20 w-20 rounded-full bg-orange-300/40 blur-2xl" />
              <div className="absolute -bottom-10 right-0 h-28 w-28 rounded-full bg-sky-300/30 blur-3xl" />
              <div className="relative rounded-[2rem] border border-black/5 bg-slate-950 p-5 text-white shadow-[0_30px_100px_-45px_rgba(15,23,42,0.75)]">
                <div className="rounded-[1.5rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] p-5">
                  <div className="flex items-center justify-between border-b border-white/10 pb-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.22em] text-orange-300">Workspace</p>
                      <p className="mt-2 text-xl font-semibold">Messenger</p>
                    </div>
                    <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
                      Live flow
                    </div>
                  </div>

                  <div className="mt-5 space-y-3">
                    <div className="rounded-2xl bg-white/5 p-4">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-white">Нове звернення</span>
                        <span className="text-white/50">щойно</span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-white/70">
                        Усі нові діалоги потрапляють в єдиний потік, де їх можна одразу обробити командою.
                      </p>
                    </div>
                    <div className="rounded-2xl bg-orange-500/12 p-4 ring-1 ring-orange-400/20">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-orange-100">Фокус на відповіді</span>
                        <span className="text-orange-200/70">next action</span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-orange-50/80">
                        Видно, де потрібна відповідь, що вже оброблено та де є ризик загубити клієнтський діалог.
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white/5 p-4">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-white">Єдина історія</span>
                        <span className="text-white/50">audit trail</span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-white/70">
                        Контекст не розпадається між різними вкладками та людьми: команда працює в одній системі.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-24 sm:px-8 lg:px-12">
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {pillars.map(({ title, description, icon: Icon }) => (
            <article
              key={title}
              className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_25px_60px_-45px_rgba(15,23,42,0.35)] transition-transform duration-200 hover:-translate-y-1"
            >
              <div className="inline-flex rounded-2xl bg-slate-950 p-3 text-orange-300">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="mt-5 text-2xl font-semibold tracking-[-0.03em] text-slate-950" style={{ fontFamily: "var(--font-display)" }}>
                {title}
              </h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-24 sm:px-8 lg:px-12">
        <div className="rounded-[2rem] bg-slate-950 px-6 py-12 text-white sm:px-10 lg:px-12">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">OmniChat</p>
              <h2 className="mt-4 max-w-xl text-4xl font-bold leading-tight tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
                Публічна точка входу для продукту і прямий контакт для команди.
              </h2>
            </div>
            <div className="space-y-4 text-sm leading-7 text-white/72">
              <p>
                Якщо вам потрібен доступ до застосунку, переходьте в робочу зону. Якщо хочете зв’язатися з нами
                напряму, використовуйте пошту.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="h-12 rounded-full bg-white px-6 text-slate-950 hover:bg-white/90">
                  <Link href="https://app.omnichat.to/login">Перейти в OmniChat</Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-12 rounded-full border-white/20 bg-transparent px-6 text-white hover:bg-white/10 hover:text-white"
                >
                  <Link href="mailto:admin@omnichat.to">admin@omnichat.to</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>

        <footer className="flex flex-col gap-3 py-10 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <div>OmniChat</div>
          <div className="flex flex-col gap-1 sm:items-end">
            <Link className="hover:text-slate-950" href="https://app.omnichat.to/login">
              app.omnichat.to
            </Link>
            <Link className="hover:text-slate-950" href="mailto:admin@omnichat.to">
              admin@omnichat.to
            </Link>
          </div>
        </footer>
      </section>
    </main>
  )
}
