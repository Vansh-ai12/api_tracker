"use client";

import { useEffect, useState } from "react";

type Status = "idle" | "unsupported" | "checking" | "enabled" | "enabling" | "error";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

export function PushNotificationButton() {
  const [status, setStatus] = useState<Status>("checking");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setStatus("unsupported");
      return;
    }

    if (Notification.permission === "granted") {
      // Check if we actually have an active push subscription already.
      navigator.serviceWorker.ready.then((reg) =>
        reg.pushManager.getSubscription(),
      ).then((sub) => {
        setStatus(sub ? "enabled" : "idle");
      }).catch(() => setStatus("idle"));
    } else if (Notification.permission === "denied") {
      setStatus("error");
      setErrorMsg("Notifications are blocked in your browser settings.");
    } else {
      setStatus("idle");
    }
  }, []);

  async function handleEnable() {
    setStatus("enabling");
    setErrorMsg(null);

    try {
      // 1. Register (or get existing) the service worker.
      const reg = await navigator.serviceWorker.register("/sw.js");

      // 2. Request notification permission if not already granted.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("error");
        setErrorMsg("Permission denied. Allow notifications in your browser to continue.");
        return;
      }

      // 3. Subscribe to push using the VAPID public key.
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      // 4. Send subscription to server — no user_id needed, server reads session cookie.
      const res = await fetch("/api/notifications/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save subscription");
      }

      setStatus("enabled");
    } catch (err: unknown) {
      console.error("[push] Enable error:", err);
      setStatus("error");
      setErrorMsg(
        err instanceof Error ? err.message : "Something went wrong. Try again.",
      );
    }
  }

  if (status === "unsupported") {
    return (
      <p className="text-sm text-gray-400 dark:text-gray-500">
        Browser push notifications are not supported in this browser.
      </p>
    );
  }

  if (status === "enabled") {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 font-medium">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        Browser notifications enabled
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end">
      <button
        id="enable-push-btn"
        onClick={handleEnable}
        disabled={status === "enabling" || status === "checking"}
        className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full text-sm font-semibold transition-all shadow-sm hover:shadow disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {status === "enabling" ? "Enabling…" : "Enable browser notifications"}
      </button>
      {status === "error" && errorMsg && errorMsg.includes("blocked") && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
