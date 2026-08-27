import { getSessionUserId, getUserProfile } from "@/lib/session";
import { createServiceClient } from "@/lib/supabase-server";
import { PushNotificationButton } from "@/components/push-notification-button";
import { Logo } from "@/components/logo";
import { LogoutButton } from "@/components/logout-button";
import { TelegramConnectCard } from "@/components/telegram-connect-card";
import { GmailStatusCard } from "@/components/gmail-status-card";
import { PlanCard } from "@/components/plan-card";
import { AddSubscriptionButton } from "@/components/add-subscription-button";
import { ApiIntegrationsCard } from "@/components/api-integrations-card";

import { redirect } from "next/navigation";

// Force dynamic rendering — reads cookies & database on every request
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Dashboard | Unsub",
  description: "Manage your tracked subscriptions & renewal pings.",
};

type Subscription = {
  id: string;
  service_name: string;
  amount: number | null;
  currency: string;
  billing_cycle: string | null;
  renewal_date: string | null;
  status: string;
  source: string | null;
  created_at: string;
};

async function getSubscriptions(userId: string): Promise<Subscription[]> {
  const supabase = createServiceClient();
  
  // Get subscriptions with their source from evidence table
  const { data: subscriptions, error: subError } = await supabase
    .from("subscriptions")
    .select("id, service_name, amount, currency, billing_cycle, renewal_date, status, created_at")
    .eq("user_id", userId)
    .order("renewal_date", { ascending: true, nullsFirst: false });

  if (subError) {
    console.error("[dashboard] Failed to fetch subscriptions:", subError);
    return [];
  }

  if (!subscriptions || subscriptions.length === 0) {
    return [];
  }

  // Get evidence for each subscription to determine source
  const subscriptionIds = subscriptions.map(s => s.id);
  const { data: evidence } = await supabase
    .from("subscription_evidence")
    .select("subscription_id, source")
    .in("subscription_id", subscriptionIds);

  // Create a map of subscription_id to source
  const sourceMap = new Map<string, string>();
  if (evidence) {
    evidence.forEach(e => {
      if (!sourceMap.has(e.subscription_id)) {
        sourceMap.set(e.subscription_id, e.source);
      }
    });
  }

  // Add source to each subscription
  return subscriptions.map(sub => ({
    ...sub,
    source: sourceMap.get(sub.id) || null,
  }));
}

async function getTelegramConnection(userId: string): Promise<boolean> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("users")
    .select("telegram_chat_id")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("[dashboard] Failed to fetch Telegram connection:", error);
    return false;
  }

  return data?.telegram_chat_id !== null && data?.telegram_chat_id !== undefined;
}

async function getUserGmailStatus(userId: string) {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("users")
    .select("tracking_mode, gmail_connected, gmail_email, gmail_last_scan_at, gmail_last_scan_status, gmail_last_error, forwarding_alias")
    .eq("id", userId)
    .maybeSingle();

  return {
    tracking_mode: (data?.tracking_mode as "GMAIL" | "PRIVATE_EMAIL") || "PRIVATE_EMAIL",
    gmail_connected: !!data?.gmail_connected,
    gmail_email: data?.gmail_email || null,
    gmail_last_scan_at: data?.gmail_last_scan_at || null,
    gmail_last_scan_status: data?.gmail_last_scan_status || "idle",
    gmail_last_error: data?.gmail_last_error || null,
    forwarding_alias: data?.forwarding_alias || "alias",
  };
}

function StatusBadge({ status }: { status: string }) {
  const isActive = status === "active";
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
        isActive
          ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/50"
          : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${isActive ? "bg-emerald-500 animate-pulse" : "bg-gray-400"}`} />
      {isActive ? "Active" : "Cancelled"}
    </span>
  );
}

function SubscriptionCard({ sub }: { sub: Subscription }) {
  const renewalLabel = sub.renewal_date
    ? new Date(sub.renewal_date + "T00:00:00").toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

  const amountLabel =
    sub.amount != null
      ? `${sub.currency === "INR" || sub.currency === "₹" ? "₹" : sub.currency + " "}${sub.amount}`
      : "—";

  const initialLetter = sub.service_name ? sub.service_name.charAt(0).toUpperCase() : "S";

  const sourceLabel = sub.source === "GMAIL" ? "Gmail" : sub.source === "PRIVATE_EMAIL" ? "Forwarded Email" : "Manual";

  return (
    <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-gray-800/80 p-5 flex flex-col justify-between gap-4 shadow-sm hover:shadow-md dark:hover:border-gray-700 transition-all group">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-100 dark:from-emerald-950/50 dark:to-teal-900/30 text-emerald-700 dark:text-emerald-300 font-bold text-base flex items-center justify-center border border-emerald-100/50 dark:border-emerald-900/50 shrink-0">
            {initialLetter}
          </div>
          <div>
            <h3 className="font-bold text-[#0a0a0a] dark:text-white text-base leading-tight group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
              {sub.service_name}
            </h3>
            <p className="text-xs text-gray-400 dark:text-gray-500 capitalize">
              {sub.billing_cycle ? `${sub.billing_cycle} cycle` : "Subscription"}
            </p>
          </div>
        </div>
        <StatusBadge status={sub.status} />
      </div>

      <div className="grid grid-cols-2 gap-4 pt-3 border-t border-gray-50 dark:border-gray-800/50 text-sm">
        <div>
          <p className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-0.5">Billing Amount</p>
          <p className="font-bold text-[#0a0a0a] dark:text-gray-100 text-base">{amountLabel}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-0.5">Renews On</p>
          <p className="font-semibold text-[#0a0a0a] dark:text-gray-200">{renewalLabel}</p>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 text-xs">
        <span className="text-gray-400 dark:text-gray-500">
          Source: <span className="font-medium text-gray-600 dark:text-gray-400">{sourceLabel}</span>
        </span>
        <span className="text-gray-400 dark:text-gray-500">
          Added: {new Date(sub.created_at).toLocaleDateString("en-IN")}
        </span>
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const userId = await getSessionUserId();

  if (!userId) {
    redirect("/login");
  }

  const [subscriptions, telegramConnected, profile, gmailStatus] = await Promise.all([
    getSubscriptions(userId),
    getTelegramConnection(userId),
    getUserProfile(userId),
    getUserGmailStatus(userId),
  ]);

  const isPro = profile.plan === "pro";
  const active = subscriptions.filter((s) => s.status === "active");
  const cancelled = subscriptions.filter((s) => s.status === "cancelled");

  // Calculate monthly total spend in INR
  const totalMonthlySpend = active.reduce((acc, sub) => {
    if (!sub.amount) return acc;
    if (sub.billing_cycle === "yearly") return acc + Math.round(sub.amount / 12);
    return acc + sub.amount;
  }, 0);

  // Determine nearest upcoming renewal
  const nextRenewal = active.length > 0 && active[0].renewal_date
    ? `${active[0].service_name} (${new Date(active[0].renewal_date + "T00:00:00").toLocaleDateString("en-IN", { month: "short", day: "numeric" })})`
    : "No active renewals";

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#0a0a0a] text-[#0a0a0a] dark:text-white selection:bg-emerald-100 dark:selection:bg-emerald-950">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-[#0a0a0a]/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <Logo />
          </a>

          <div className="flex items-center gap-3">
            {isPro ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 shadow-xs">
                <svg className="w-3.5 h-3.5 text-emerald-500 fill-current" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                PRO MEMBER
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                FREE PLAN
              </span>
            )}
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Page Banner / Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-[#0a0a0a] dark:text-white">
              Subscription Dashboard
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {isPro
                ? "AI receipt parsing & automated renewal reminders."
                : "AI receipt parsing & subscription tracking. Automated reminders are a Pro feature."}
            </p>
          </div>

          {/* Browser Push Button for Pro Users */}
          {isPro && <PushNotificationButton />}
        </div>

        {/* Plan Upgrade / Status Banner */}
        <PlanCard initialPlan={profile.plan} />

        {/* Live Gmail / Tracking Mode Status Banner */}
        <GmailStatusCard initialStatus={gmailStatus} />

        {/* API & Integrations Catalog */}
        <ApiIntegrationsCard isPro={isPro} />

        {/* Analytics Highlights Grid (4 Cards) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Spend Widget */}
          <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-xs">
            <div className="flex items-center justify-between text-gray-400 dark:text-gray-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Est. Monthly Spend</span>
              <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-2xl font-extrabold text-[#0a0a0a] dark:text-white">
              ₹{totalMonthlySpend.toLocaleString("en-IN")}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              {active.length} active subscription{active.length === 1 ? "" : "s"}
            </p>
          </div>

          {/* Active Subscriptions Count */}
          <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-xs">
            <div className="flex items-center justify-between text-gray-400 dark:text-gray-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Tracked Services</span>
              <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-2xl font-extrabold text-[#0a0a0a] dark:text-white">
              {active.length} <span className="text-sm font-normal text-gray-400">Active</span>
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              {cancelled.length} cancelled in history
            </p>
          </div>

          {/* Upcoming Renewal */}
          <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-xs">
            <div className="flex items-center justify-between text-gray-400 dark:text-gray-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Next Renewal</span>
              <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-base font-bold text-[#0a0a0a] dark:text-white truncate">
              {nextRenewal}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              {isPro ? "Automated renewal alert" : "Reminders available on Pro"}
            </p>
          </div>

          {/* Receipt Forwarding Email Alias */}
          <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-xs">
            <div className="flex items-center justify-between text-gray-400 dark:text-gray-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">AI Forwarding Email</span>
              <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-sm font-mono font-bold text-emerald-600 dark:text-emerald-400 truncate">
              {profile.forwardingAlias}@unsub.app
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Forward receipts to auto-track
            </p>
          </div>
        </div>

        {/* Reminders & Notifications Hub (Feature Gated by Plan) */}
        {isPro ? (
          <section className="space-y-4">
            <h2 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              Renewal Reminders & Notifications (Pro Active)
            </h2>
            <TelegramConnectCard initiallyConnected={telegramConnected} />
          </section>
        ) : (
          <section className="rounded-3xl border border-amber-200/80 dark:border-amber-900/40 bg-gradient-to-br from-amber-50/60 via-white to-amber-50/20 dark:from-amber-950/20 dark:via-[#141414] dark:to-amber-950/10 p-6 sm:p-8 shadow-xs">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="space-y-2 max-w-2xl">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 text-xs font-bold border border-amber-200 dark:border-amber-800/50">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  PRO FEATURE LOCKED: AUTOMATED REMINDERS
                </div>
                <h3 className="text-xl font-bold text-[#0a0a0a] dark:text-white">
                  Get Telegram & Browser Alerts 3 Days Before Renewal
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                  Free accounts track receipts & spending statistics. Upgrade to <strong>Unsub Pro for ₹49/month</strong> to unlock automatic Telegram nudges & browser notifications before your credit card gets charged.
                </p>
              </div>

              <div className="shrink-0">
                <a
                  href="#plan-upgrade"
                  className="px-6 py-3 bg-black text-white dark:bg-white dark:text-black font-semibold text-sm rounded-full transition-all shadow-md hover:scale-105 inline-block"
                >
                  Unlock Reminders · ₹49/mo
                </a>
              </div>
            </div>
          </section>
        )}

        {/* Subscription Tracking List */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-[#0a0a0a] dark:text-white">
                Tracked Subscriptions
              </h2>
              {!isPro && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  2 subscription limit · {active.length}/{2} active used
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <AddSubscriptionButton isPro={isPro} activeCount={active.length} />
              <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">
                {subscriptions.length} total recorded
              </span>
            </div>
          </div>

          {subscriptions.length === 0 ? (
            /* Empty State Tutorial Card */
            <div className="text-center py-16 px-6 bg-white dark:bg-[#141414] rounded-3xl border border-gray-100 dark:border-gray-800/80 shadow-xs">
              <div className="w-14 h-14 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-emerald-100 dark:border-emerald-900/50">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-[#0a0a0a] dark:text-white mb-2">
                No subscriptions tracked yet
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto leading-relaxed mb-6">
                Forward your subscription receipts (Netflix, Spotify, ChatGPT, Canva, etc.) to your unique email address below to track them automatically:
              </p>
              <div className="inline-flex items-center gap-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-4 py-2 rounded-xl text-sm font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                <span>{profile.forwardingAlias}@unsub.app</span>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Active Section */}
              {active.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4">
                    Active ({active.length})
                  </h3>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {active.map((sub) => (
                      <SubscriptionCard key={sub.id} sub={sub} />
                    ))}
                  </div>
                </div>
              )}

              {/* Cancelled Section */}
              {cancelled.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4">
                    Cancelled ({cancelled.length})
                  </h3>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 opacity-60">
                    {cancelled.map((sub) => (
                      <SubscriptionCard key={sub.id} sub={sub} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

       
      </main>
    </div>
  );
}
