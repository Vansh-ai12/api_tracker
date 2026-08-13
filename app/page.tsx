import React from "react";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-background selection:bg-mint-200 dark:selection:bg-emerald-900/50">
      {/* Background Gradient */}
      <div className="absolute top-0 left-0 w-full h-[800px] bg-gradient-to-b from-[#D9F5EC] to-white dark:from-emerald-950/40 dark:to-background -z-10 pointer-events-none" />

      {/* Nav */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 backdrop-blur-md bg-white/50 dark:bg-gray-950/70 border-b border-gray-100/50 dark:border-gray-800/50">
        <div className="flex items-center gap-2 font-bold text-xl tracking-tight">
          <svg
            className="w-6 h-6 text-emerald-500"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10.3 2.1a1.94 1.94 0 0 1 3.4 0" />
            <path d="M4 14.9A9 9 0 1 1 20 15" />
            <path d="M8 20h8" />
            <path d="M10 20v2" />
            <path d="M14 20v2" />
            <path d="M2 2l20 20" />
          </svg>
          Unsub
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600 dark:text-gray-400">
          <a
            href="#how-it-works"
            className="hover:text-black dark:hover:text-white transition-colors"
          >
            How it works
          </a>
          <a href="#pricing" className="hover:text-black dark:hover:text-white transition-colors">
            Pricing
          </a>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <a
            href="#"
            className="px-5 py-2.5 bg-black text-white rounded-full text-sm font-medium hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200 transition-colors"
          >
            Get started
          </a>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center pt-24 pb-16 px-6">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 text-sm font-medium mb-8 border border-emerald-100 dark:border-emerald-900/50">
          <span>✨ 7-day free trial · ₹99/month after</span>
        </div>

        <h1 className="text-5xl md:text-7xl font-extrabold text-center tracking-tighter max-w-4xl text-[#0a0a0a] dark:text-gray-50 leading-[1.1] mb-6">
          Never get billed for a subscription you forgot about
        </h1>

        <p className="text-lg md:text-xl text-gray-600 dark:text-gray-400 text-center max-w-2xl mb-6">
          Forward your receipts, and Unsub will remind you on Telegram before
          every renewal. No bank connection. No inbox access.
        </p>

        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-gray-500 dark:text-gray-400 mb-10">
          <span>✓ AI receipt parsing</span>
          <span>✓ Telegram reminders</span>
          <span>✓ Usage tracking</span>
          <span>✓ No credit card to start</span>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
          <a
            href="#"
            className="w-full sm:w-auto px-8 py-3.5 bg-black text-white rounded-full text-base font-semibold hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200 transition-colors text-center shadow-sm"
          >
            Start tracking free
          </a>
          <a
            href="#how-it-works"
            className="w-full sm:w-auto px-8 py-3.5 bg-white dark:bg-gray-900 text-black dark:text-white border border-gray-200 dark:border-gray-700 rounded-full text-base font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-center shadow-sm"
          >
            See how it works
          </a>
        </div>

        {/* Product Preview */}
        <div className="mt-20 w-full max-w-3xl rounded-2xl border border-gray-200/60 dark:border-gray-700/60 bg-white dark:bg-gray-900 shadow-2xl shadow-[#D9F5EC]/50 dark:shadow-black/30 overflow-hidden">
          <div className="flex items-center px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
            <div className="flex gap-1.5 mr-4">
              <div className="w-3 h-3 rounded-full bg-red-400" />
              <div className="w-3 h-3 rounded-full bg-amber-400" />
              <div className="w-3 h-3 rounded-full bg-green-400" />
            </div>
            <div className="flex-1 flex justify-center">
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md px-4 py-1 text-xs text-gray-500 dark:text-gray-400 font-mono shadow-sm flex items-center gap-2">
                <svg
                  className="w-3 h-3 text-gray-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
                t.me/UnsubBot
              </div>
            </div>
          </div>

          <div className="bg-[#f0f2f5] dark:bg-[#0e1621] p-6 h-[400px] flex flex-col gap-4 overflow-y-auto font-sans">
            <div className="flex justify-start">
              <div className="bg-white dark:bg-[#182533] rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm max-w-[80%] border border-gray-100 dark:border-gray-700/50">
                <p className="text-[#0a0a0a] dark:text-gray-100">
                  🔔 Your <strong>Netflix</strong> subscription ($15.99/mo)
                  renews in 3 days. Still using it?
                </p>
                <div className="flex gap-2 mt-3 flex-wrap">
                  <button className="px-4 py-2 bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-300 rounded-lg text-sm font-medium border border-blue-100 dark:border-blue-900/50 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors">
                    ✅ Keep it
                  </button>
                  <button className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                    ❌ Cancel reminder
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end mt-2">
              <div className="bg-[#e3f2fd] dark:bg-[#2b5278] text-[#0a0a0a] dark:text-gray-100 rounded-2xl rounded-tr-sm px-4 py-3 shadow-sm max-w-[80%]">
                <p>Cancel reminder</p>
              </div>
            </div>

            <div className="flex justify-start mt-2">
              <div className="bg-white dark:bg-[#182533] rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm max-w-[80%] border border-gray-100 dark:border-gray-700/50">
                <p className="text-[#0a0a0a] dark:text-gray-100">
                  Got it! I won't remind you about Netflix again until the next
                  cycle. 🤫
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* How it works */}
      <section
        id="how-it-works"
        className="py-24 px-6 max-w-6xl mx-auto w-full"
      >
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
            How it works
          </h2>
          <p className="text-gray-600 dark:text-gray-400 text-lg">
            Track subscriptions without connecting your bank account.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          <div className="p-8 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm flex flex-col items-start relative overflow-hidden group">
            <div className="absolute top-4 right-4 text-gray-50 dark:text-gray-800 font-extrabold text-6xl select-none group-hover:text-emerald-50 dark:group-hover:text-emerald-950/50 transition-colors">
              1
            </div>
            <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-950/50 rounded-xl flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-6 relative z-10 border border-emerald-100 dark:border-emerald-900/50">
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                ></path>
              </svg>
            </div>
            <h3 className="text-xl font-bold mb-3 relative z-10 text-[#0a0a0a] dark:text-gray-50">
              Forward your receipts
            </h3>
            <p className="text-gray-600 dark:text-gray-400 relative z-10 leading-relaxed">
              Send any subscription receipt to your unique Unsub email. Our AI
              extracts the details automatically.
            </p>
          </div>

          <div className="p-8 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm flex flex-col items-start relative overflow-hidden group">
            <div className="absolute top-4 right-4 text-gray-50 dark:text-gray-800 font-extrabold text-6xl select-none group-hover:text-emerald-50 dark:group-hover:text-emerald-950/50 transition-colors">
              2
            </div>
            <div className="w-12 h-12 bg-blue-50 dark:bg-blue-950/50 rounded-xl flex items-center justify-center text-blue-600 dark:text-blue-400 mb-6 relative z-10 border border-blue-100 dark:border-blue-900/50">
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                ></path>
              </svg>
            </div>
            <h3 className="text-xl font-bold mb-3 relative z-10 text-[#0a0a0a] dark:text-gray-50">
              Get nudged before renewal
            </h3>
            <p className="text-gray-600 dark:text-gray-400 relative z-10 leading-relaxed">
              A few days before each renewal, Unsub pings you on Telegram to
              check if you still need it.
            </p>
          </div>

          <div className="p-8 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm flex flex-col items-start relative overflow-hidden group">
            <div className="absolute top-4 right-4 text-gray-50 dark:text-gray-800 font-extrabold text-6xl select-none group-hover:text-emerald-50 dark:group-hover:text-emerald-950/50 transition-colors">
              3
            </div>
            <div className="w-12 h-12 bg-purple-50 dark:bg-purple-950/50 rounded-xl flex items-center justify-center text-purple-600 dark:text-purple-400 mb-6 relative z-10 border border-purple-100 dark:border-purple-900/50">
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                ></path>
              </svg>
            </div>
            <h3 className="text-xl font-bold mb-3 relative z-10 text-[#0a0a0a] dark:text-gray-50">
              See what you actually use
            </h3>
            <p className="text-gray-600 dark:text-gray-400 relative z-10 leading-relaxed">
              Track which subscriptions you're really using and which are just
              draining your wallet.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing */}
      {/* Pricing */}
      <section
        id="pricing"
        className="py-24 px-6 w-full bg-background border-y border-gray-100 dark:border-gray-800"
      >
        <div className="max-w-3xl mx-auto flex flex-col items-center">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4 text-center">
            Simple pricing
          </h2>

          <p className="text-gray-600 dark:text-gray-400 text-center text-lg mb-12">
            Less than the cost of forgetting one subscription.
          </p>

          <div className="w-full max-w-md bg-background rounded-3xl p-8 md:p-10 border border-gray-200 dark:border-gray-700 shadow-xl shadow-gray-200/40 dark:shadow-black/20">
            <div className="flex items-center justify-between mb-6">
              <div className="inline-block px-3 py-1 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 font-semibold rounded-full text-sm border border-emerald-100 dark:border-emerald-900/50">
                Unsub
              </div>

              <div className="text-sm text-gray-500 dark:text-gray-400">7-day free trial</div>
            </div>

            <div className="mb-2">
              <span className="text-5xl font-extrabold text-[#0a0a0a] dark:text-gray-50">
                ₹99
              </span>
              <span className="text-gray-500 dark:text-gray-400 font-medium">/month</span>
            </div>

            <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">≈ $1.03 USD/month</p>

            <ul className="text-left space-y-4 mb-10">
              {[
                "Unlimited subscription tracking",
                "AI-powered receipt parsing",
                "Telegram renewal reminders",
                "Browser usage tracking",
                "Renewal date & billing history",
                "Monthly subscription spending summary",
                "No bank account connection",
                "No inbox OAuth access",
              ].map((feature, i) => (
                <li key={i} className="flex items-start gap-3">
                  <svg
                    className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth="2"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>

                  <span className="text-gray-700 dark:text-gray-300 font-medium">{feature}</span>
                </li>
              ))}
            </ul>

            <a
              href="#"
              className="block w-full py-4 bg-black text-white rounded-full text-base font-semibold hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200 transition-colors shadow-md hover:shadow-lg text-center"
            >
              Start 7-day free trial
            </a>

            <p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-4">
              No credit card required · Cancel anytime
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 max-w-6xl mx-auto w-full flex flex-col md:flex-row items-center justify-between gap-6 border-t border-gray-100 dark:border-gray-800 mt-12">
        <div className="flex items-center gap-2 font-bold text-xl tracking-tight text-gray-400 dark:text-gray-500">
          <svg
            className="w-6 h-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10.3 2.1a1.94 1.94 0 0 1 3.4 0" />
            <path d="M4 14.9A9 9 0 1 1 20 15" />
            <path d="M8 20h8" />
            <path d="M10 20v2" />
            <path d="M14 20v2" />
            <path d="M2 2l20 20" />
          </svg>
          Unsub
        </div>

        <div className="text-sm text-gray-500 dark:text-gray-400 font-medium">
          © 2026 Unsub. All rights reserved.
        </div>

        <div className="flex gap-6 text-sm font-medium text-gray-500 dark:text-gray-400">
          <a href="#" className="hover:text-black dark:hover:text-white transition-colors">
            Privacy
          </a>
          <a href="#" className="hover:text-black dark:hover:text-white transition-colors">
            Terms
          </a>
          <a href="#" className="hover:text-black dark:hover:text-white transition-colors">
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
