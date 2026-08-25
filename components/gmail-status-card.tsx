"use client";

import { useState } from "react";

interface GmailStatusProps {
  initialStatus: {
    tracking_mode: "GMAIL" | "PRIVATE_EMAIL";
    gmail_connected: boolean;
    gmail_email: string | null;
    gmail_last_scan_at: string | null;
    gmail_last_scan_status: string;
    forwarding_alias: string;
  };
}

export function GmailStatusCard({ initialStatus }: GmailStatusProps) {
  const [status, setStatus] = useState(initialStatus);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function fetchLatestStatus() {
    try {
      const res = await fetch("/api/user/gmail", {
        method: "GET",
        cache: "no-store",
      });

      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {
      // Ignore
    }
  }

  async function handleConnectGmail() {
    setLoading(true);
    setMessage("Preparing secure Google authorization...");
    try {
      const res = await fetch("/api/user/gmail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "connect" }),
      });
      const data = await res.json();
      if (res.ok && data.oauth_url) {
        window.location.href = data.oauth_url;
      } else {
        setMessage(data.error || "Could not start Gmail connection.");
      }
    } catch {
      setMessage("Network error occurred.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    if (
      !confirm(
        "Are you sure you want to disconnect Gmail? This will revoke access and delete your stored credentials.",
      )
    ) {
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/user/gmail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect" }),
      });
      if (res.ok) {
        setMessage("Gmail disconnected. Tracking set to Private Inbox.");
        await fetchLatestStatus();
      } else {
        setMessage("Failed to disconnect Gmail. Please try again.");
      }
    } catch {
      setMessage("Network error occurred.");
    } finally {
      setLoading(false);
    }
  }

  async function handleScan() {
    setLoading(true);
    setMessage("Scanning inbox for subscription emails...");

    try {
      const res = await fetch("/api/user/gmail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "scan" }),
        cache: "no-store",
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setMessage(
          `Scan complete! ${data.newSubscriptionsCount || 0} new subscriptions found.`,
        );

        // Give the database a moment to commit the completed scan state,
        // then retrieve the fresh Gmail status.
        await new Promise((resolve) => setTimeout(resolve, 300));

        await fetchLatestStatus();
      } else {
        setMessage(data.error || "Scan failed.");
        await fetchLatestStatus();
      }
    } catch {
      setMessage("Scan failed due to network error.");
    } finally {
      setLoading(false);
    }
  }

  const isGmail = status.gmail_connected && status.tracking_mode === "GMAIL";

  return (
    <div className="rounded-2xl border border-emerald-100 dark:border-emerald-900/40 bg-white dark:bg-[#141414] p-5 sm:p-6 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-100 dark:border-emerald-900/50">
            {isGmail ? (
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            ) : (
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`h-2 w-2 rounded-full ${isGmail ? "bg-emerald-500 animate-pulse" : "bg-blue-500"}`}
              />
              <h3 className="font-bold text-sm text-[#0a0a0a] dark:text-white">
                {isGmail
                  ? "🟢 Gmail Tracking Active"
                  : "🔒 Private Inbox Mode Active"}
              </h3>
            </div>

            {isGmail ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Connected to{" "}
                <strong className="text-gray-800 dark:text-gray-200">
                  {status.gmail_email}
                </strong>
                . Read-only permissions active. Last scan:{" "}
                {status.gmail_last_scan_at
                  ? new Date(status.gmail_last_scan_at).toLocaleString("en-IN")
                  : "Never"}
                .
              </p>
            ) : (
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                No Gmail access. Forward subscription receipts to{" "}
                <strong className="text-emerald-600 dark:text-emerald-400 font-mono">
                  {status.forwarding_alias}@unsub.app
                </strong>{" "}
                to auto-track, or connect Gmail below.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isGmail ? (
            <>
              <button
                type="button"
                onClick={handleScan}
                disabled={
                  loading || status.gmail_last_scan_status === "scanning"
                }
                className="px-4 py-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
              >
                {loading ? "Working..." : "📬 Scan Inbox"}
              </button>

              <button
                type="button"
                onClick={handleDisconnect}
                disabled={loading}
                className="px-4 py-2 rounded-full border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleConnectGmail}
              disabled={loading}
              className="px-4 py-2 rounded-full bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200 text-xs font-semibold transition-colors shadow-xs cursor-pointer disabled:opacity-50"
            >
              {loading ? "Connecting…" : "🔗 Connect Gmail"}
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className="mt-3 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 p-2.5 rounded-xl border border-emerald-100 dark:border-emerald-900/40">
          {message}
        </div>
      )}
    </div>
  );
}
