"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Logo } from "@/components/logo";
import { createBrowserClient } from "@/lib/supabase-browser";

type Mode = "login" | "signup";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode: Mode = searchParams.get("mode") === "signup" ? "signup" : "login";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function selectMode(nextMode: Mode) {
    setError(null);
    setConfirmPassword("");
    router.replace(`/login?mode=${nextMode}`);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (mode === "signup" && password !== confirmPassword) {
      setError("Your passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createBrowserClient();
      const { data, error: authError } = signingUp
        ? await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
          })
        : await supabase.auth.signInWithPassword({ email, password });

      if (authError) {
        setError(authError.message);
        return;
      }

      if (!data.session) {
        setError("Check your email to confirm your account, then return here to log in.");
        return;
      }

      await createApplicationSession(data.session.access_token);
    } catch {
      setError("We could not reach Unsub. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function createApplicationSession(accessToken: string) {
    const response = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: accessToken }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Could not start your Unsub session.");
    router.replace("/dashboard");
    router.refresh();
  }

  async function signInWithGoogle() {
    setError(null);
    setLoading(true);
    try {
      const { error: authError } = await createBrowserClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (authError) setError(authError.message);
    } catch {
      setError("Google sign-in could not be started. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const signingUp = mode === "signup";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#D9F5EC] to-white dark:from-[#0a1f1a] dark:to-[#0a0a0a] px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center mb-8"><Logo size="lg" /></div>
        <div className="bg-white dark:bg-[#141414] rounded-3xl border border-gray-100 dark:border-gray-800 shadow-xl shadow-gray-100/50 dark:shadow-none p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-[#0a0a0a] dark:text-white mb-2">
              {signingUp ? "Create your Unsub account" : "Welcome back"}
            </h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">
              {signingUp ? "Start tracking subscriptions in a few seconds." : "Log in to manage your subscriptions."}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-gray-100 dark:bg-[#1a1a1a] mb-6">
            <button type="button" onClick={() => selectMode("signup")} className={`rounded-lg py-2 text-sm font-semibold transition-colors ${signingUp ? "bg-white dark:bg-[#303030] text-[#0a0a0a] dark:text-white shadow-sm" : "text-gray-500 dark:text-gray-400"}`}>
              Sign up
            </button>
            <button type="button" onClick={() => selectMode("login")} className={`rounded-lg py-2 text-sm font-semibold transition-colors ${!signingUp ? "bg-white dark:bg-[#303030] text-[#0a0a0a] dark:text-white shadow-sm" : "text-gray-500 dark:text-gray-400"}`}>
              Log in
            </button>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email address</label>
              <input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1a1a1a] text-[#0a0a0a] dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition-all" placeholder="you@example.com" />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Password</label>
              <input id="password" type="password" autoComplete={signingUp ? "new-password" : "current-password"} minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1a1a1a] text-[#0a0a0a] dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition-all" placeholder={signingUp ? "At least 8 characters" : "Your password"} />
            </div>
            {signingUp && <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Confirm password</label>
              <input id="confirm-password" type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1a1a1a] text-[#0a0a0a] dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition-all" placeholder="Repeat your password" />
            </div>}
            {error && <p className="text-sm text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-xl px-4 py-3">{error}</p>}
            <button type="submit" disabled={loading} className="w-full py-3 bg-black dark:bg-white text-white dark:text-black rounded-full font-semibold text-sm hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
              {loading ? "Please wait…" : signingUp ? "Create account" : "Log in"}
            </button>
            <div className="flex items-center gap-3 py-1 text-xs text-gray-400"><span className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />or<span className="h-px flex-1 bg-gray-200 dark:bg-gray-800" /></div>
            <button type="button" onClick={signInWithGoogle} disabled={loading} className="w-full py-3 border border-gray-200 dark:border-gray-700 rounded-full font-semibold text-sm text-[#0a0a0a] dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50">
              Continue with Google
            </button>
          </form>
        </div>
        <p className="text-center text-xs text-gray-400 dark:text-gray-600 mt-6">Telegram is optional. Connect it from your dashboard when you’re ready for reminders.</p>
        <p className="text-center text-xs text-gray-400 dark:text-gray-600 mt-3">Back to <Link href="/" className="text-emerald-600 dark:text-emerald-400 hover:underline">Unsub homepage</Link></p>
      </div>
    </div>
  );
}
