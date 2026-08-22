"use client";

import { useEffect, useRef, useState } from "react";

type ConnectionState = "idle" | "waiting" | "connected" | "error";

export function TelegramConnectCard({ initiallyConnected }: { initiallyConnected: boolean }) {
  const [state, setState] = useState<ConnectionState>(initiallyConnected ? "connected" : "idle");
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  async function checkConnection() {
    const response = await fetch("/api/auth/telegram-link", { cache: "no-store" });
    const data = await response.json();
    if (response.ok && data.connected) {
      setState("connected");
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  async function connect() {
    setLoading(true);
    try {
      const response = await fetch("/api/auth/telegram-link", { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        // Fallback open direct bot link if backend payload generation has missing config
        window.open("https://t.me/UnsubGbot", "_blank", "noopener,noreferrer");
        setState("waiting");
        return;
      }
      if (data.connected) {
        setState("connected");
        return;
      }

      window.open(data.telegram_url || "https://t.me/UnsubGbot", "_blank", "noopener,noreferrer");
      setState("waiting");
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        checkConnection().catch(() => {
          if (intervalRef.current) clearInterval(intervalRef.current);
          intervalRef.current = null;
        });
      }, 2500);
    } catch {
      window.open("https://t.me/UnsubGbot", "_blank", "noopener,noreferrer");
      setState("waiting");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-sky-100/60 dark:border-sky-900/30 bg-sky-50/50 dark:bg-sky-950/20 p-5 sm:p-6 backdrop-blur-xs transition-all">
      <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#229ED9]/10 text-[#229ED9] flex items-center justify-center shrink-0 border border-[#229ED9]/20">
            <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0zm5.56 8.16l-2.02 9.51c-.15.68-.55.85-1.12.53l-3.08-2.27-1.49 1.43c-.16.16-.3.3-.61.3l.22-3.14 5.72-5.17c.25-.22-.05-.34-.39-.12l-7.07 4.45-3.05-.95c-.66-.21-.67-.66.14-.98l11.9-4.59c.55-.2 1.03.13.85.98z" />
            </svg>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`h-2 w-2 rounded-full ${state === "connected" ? "bg-emerald-500 animate-pulse" : "bg-sky-400"}`} />
              <h3 className="font-semibold text-sm text-[#0a0a0a] dark:text-white">
                Telegram Renewal Reminders
              </h3>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed max-w-xl">
              {state === "connected"
                ? "Connected! You will receive Telegram nudges 3 days before every renewal."
                : state === "waiting"
                  ? "Telegram bot opened. Click START in Telegram to complete pairing."
                  : "Connect Telegram to get pinged before your card gets charged. No Chat ID setup needed."}
            </p>
          </div>
        </div>

        {state !== "connected" && (
          <button
            type="button"
            onClick={connect}
            disabled={loading}
            className="shrink-0 rounded-full bg-[#229ED9] hover:bg-[#1e8dbf] px-5 py-2.5 text-xs font-semibold text-white transition-all shadow-sm cursor-pointer disabled:opacity-50"
          >
            {loading ? "Connecting…" : state === "waiting" ? "Open Telegram again" : "Connect Telegram"}
          </button>
        )}
      </div>
    </div>
  );
}
