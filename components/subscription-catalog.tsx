"use client";

import { useState } from "react";

interface Subscription {
  id: string;
  service_name: string;
  amount: number | null;
  currency: string;
  billing_cycle: string | null;
  renewal_date: string | null;
  status: string;
  source: string | null;
  created_at: string;
}

interface SubscriptionCatalogProps {
  subscriptions: Subscription[];
}

export function SubscriptionCatalog({ subscriptions: initialSubscriptions }: SubscriptionCatalogProps) {
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("renewal_date");

  const filteredAndSorted = initialSubscriptions.filter((sub) => {
    switch (filter) {
      case "active":
        return sub.status === "active";
      case "cancelled":
        return sub.status === "cancelled";
      case "gmail":
        return sub.source === "GMAIL";
      case "manual":
        return sub.source === null || sub.source !== "GMAIL";
      default:
        return true;
    }
  }).sort((a, b) => {
    switch (sort) {
      case "amount":
        const aMonthly = a.amount ? (a.billing_cycle === "yearly" ? a.amount / 12 : a.amount) : 0;
        const bMonthly = b.amount ? (b.billing_cycle === "yearly" ? b.amount / 12 : b.amount) : 0;
        return bMonthly - aMonthly;
      case "created_at":
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      case "service_name":
        return a.service_name.localeCompare(b.service_name);
      case "renewal_date":
      default:
        if (!a.renewal_date) return 1;
        if (!b.renewal_date) return -1;
        return new Date(a.renewal_date).getTime() - new Date(b.renewal_date).getTime();
    }
  });

  const active = filteredAndSorted.filter((s) => s.status === "active");
  const cancelled = filteredAndSorted.filter((s) => s.status === "cancelled");

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight text-[#0a0a0a] dark:text-white">
          Subscription Catalog
        </h2>
        <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">
          {filteredAndSorted.length} shown
        </span>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">Filter:</span>
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filter === "all"
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60"
                : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            All ({initialSubscriptions.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("active")}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filter === "active"
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60"
                : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            Active
          </button>
          <button
            type="button"
            onClick={() => setFilter("cancelled")}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filter === "cancelled"
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60"
                : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            Cancelled
          </button>
          <button
            type="button"
            onClick={() => setFilter("gmail")}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filter === "gmail"
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60"
                : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            Gmail
          </button>
          <button
            type="button"
            onClick={() => setFilter("manual")}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filter === "manual"
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60"
                : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            Manual
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">Sort by:</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="renewal_date">Renewal Date</option>
            <option value="amount">Monthly Cost</option>
            <option value="created_at">Recently Added</option>
            <option value="service_name">Name</option>
          </select>
        </div>
      </div>

      {filteredAndSorted.length === 0 ? (
        <div className="text-center py-16 px-6 bg-white dark:bg-[#141414] rounded-3xl border border-gray-100 dark:border-gray-800/80 shadow-xs">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No subscriptions match the current filter.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
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
