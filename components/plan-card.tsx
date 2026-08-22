"use client";

import { useState } from "react";
import type { UserPlan } from "@/lib/session";

interface PlanCardProps {
  initialPlan: UserPlan;
}

declare global {
  interface Window {
    Razorpay: any;
  }
}

export function PlanCard({ initialPlan }: PlanCardProps) {
  const [plan, setPlan] = useState<UserPlan>(initialPlan);
  const [loading, setLoading] = useState(false);
  const [showDemoModal, setShowDemoModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isPro = plan === "pro";

  function loadRazorpayScript(): Promise<boolean> {
    return new Promise((resolve) => {
      if (typeof window !== "undefined" && window.Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }

  async function handleUpgradeClick() {
    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/payments/create-order", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Could not initiate payment.");
      }

      if (data.demo) {
        setShowDemoModal(true);
        setLoading(false);
        return;
      }

      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        throw new Error("Could not load Razorpay SDK. Please check your internet connection.");
      }

      const options = {
        key: data.keyId,
        amount: data.amount,
        currency: data.currency,
        name: "Unsub",
        description: "Unsub Pro Plan - ₹49 INR/month",
        order_id: data.orderId,
        theme: {
          color: "#10B981", // Emerald primary accent
        },
        handler: async function (response: any) {
          setLoading(true);
          try {
            const verifyRes = await fetch("/api/payments/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            const verifyData = await verifyRes.json();
            if (verifyRes.ok && verifyData.success) {
              setPlan("pro");
            } else {
              setErrorMessage(verifyData.error || "Payment verification failed.");
            }
          } catch {
            setErrorMessage("Could not complete payment verification.");
          } finally {
            setLoading(false);
          }
        },
        modal: {
          ondismiss: function () {
            setLoading(false);
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to start payment checkout.");
      setLoading(false);
    }
  }

  async function confirmDemoUpgrade() {
    setLoading(true);
    try {
      const res = await fetch("/api/payments/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_demo: true }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPlan("pro");
        setShowDemoModal(false);
      } else {
        setErrorMessage(data.error || "Failed to activate Pro plan.");
      }
    } catch {
      setErrorMessage("Network error trying to activate Pro plan.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div id="plan-upgrade" className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-gray-800 p-6 mb-8 shadow-sm transition-all">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Left side: Current Plan Info */}
          <div className="flex items-start gap-4">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border ${
                isPro
                  ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/50"
                  : "bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 border-gray-100 dark:border-gray-800"
              }`}
            >
              {isPro ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Your Current Plan
                </span>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    isPro
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                      : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                  }`}
                >
                  {isPro ? "Pro Plan" : "Free Plan"}
                </span>
              </div>

              <p className="text-sm text-gray-600 dark:text-gray-300">
                {isPro
                  ? "Active Pro Member · Full access to unlimited subscription tracking, Telegram nudges & browser alerts."
                  : "Upgrade to Pro for ₹49 INR/month (≈ $0.59 USD/month) to unlock Telegram & browser renewal reminders."}
              </p>
            </div>
          </div>

          {/* Right side: Upgrade Button */}
          {!isPro && (
            <div className="shrink-0 flex flex-col items-start sm:items-end">
              <button
                type="button"
                onClick={handleUpgradeClick}
                disabled={loading}
                className="px-5 py-2.5 bg-black text-white dark:bg-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200 font-semibold text-sm rounded-full transition-all shadow-sm flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                <span>{loading ? "Processing…" : "Upgrade to Pro"}</span>
                <span className="text-xs opacity-75 font-normal">· ₹49/mo</span>
              </button>
            </div>
          )}
        </div>

        {errorMessage && (
          <p className="text-xs text-red-500 dark:text-red-400 mt-3">{errorMessage}</p>
        )}
      </div>

      {/* Setup / Instructions Modal */}
      {showDemoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#181818] rounded-3xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-700 shadow-2xl space-y-5 animate-fadeIn">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-500" />
                <h3 className="font-bold text-lg text-[#0a0a0a] dark:text-white">Live Payment Setup</h3>
              </div>
              <button
                onClick={() => setShowDemoModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg leading-none"
              >
                ✕
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/50 space-y-1">
              <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 uppercase tracking-wide">
                Razorpay Merchant Name
              </p>
              <p className="text-lg font-bold text-emerald-900 dark:text-emerald-100">
                Unsub Technologies
              </p>
              <p className="text-xs text-emerald-700 dark:text-emerald-400">
                Plan Price: ₹49.00 INR/month (≈ $0.59 USD/month)
              </p>
            </div>

            <div className="text-xs text-gray-600 dark:text-gray-300 space-y-2 leading-relaxed">
              <p>
                To accept live payments under <strong>"Unsub"</strong>, add your Razorpay keys to <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-emerald-600 dark:text-emerald-400 font-mono">.env.local</code>:
              </p>
              <pre className="bg-gray-100 dark:bg-gray-900 p-3 rounded-xl font-mono text-[11px] overflow-x-auto text-gray-800 dark:text-gray-200">
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_live_xxx
RAZORPAY_KEY_ID=rzp_live_xxx
RAZORPAY_KEY_SECRET=xxx
              </pre>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowDemoModal(false)}
                className="px-6 py-2.5 bg-black text-white dark:bg-white dark:text-black rounded-full font-semibold text-xs transition-all hover:bg-gray-800 dark:hover:bg-gray-200"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
