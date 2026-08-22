"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { createBrowserClient } from "@/lib/supabase-browser";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const processedRef = useRef(false);

  useEffect(() => {
    const supabase = createBrowserClient();

    async function handleSession(accessToken: string) {
      if (processedRef.current) return;
      processedRef.current = true;

      try {
        const response = await fetch("/api/auth/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access_token: accessToken }),
        });
        const result = await response.json();
        if (!response.ok) {
          setError(result.error ?? "Could not start your Unsub session.");
          return;
        }

        router.replace("/dashboard");
        router.refresh();
      } catch {
        setError("Could not reach Unsub server. Please try again.");
      }
    }

    // 1. Listen for auth state change (catches PKCE code exchange & OAuth redirects)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        handleSession(session.access_token);
      }
    });

    // 2. Check existing session as fallback
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) {
        setError("Sign-in could not be completed: " + sessionError.message);
      } else if (data?.session?.access_token) {
        handleSession(data.session.access_token);
      }
    });

    // Safety timeout after 10s if session resolution is delayed
    const timer = setTimeout(() => {
      if (!processedRef.current) {
        setError("Sign-in verification timed out. Return to login and try again.");
      }
    }, 10000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#D9F5EC] to-white dark:from-[#0a1f1a] dark:to-[#0a0a0a] px-4">
      <div className="text-center max-w-md">
        <div className="flex justify-center mb-6">
          <Logo size="lg" />
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          {error ?? "Finishing your sign-in…"}
        </p>
        {error && (
          <Link
            href="/login"
            className="inline-block px-5 py-2.5 bg-emerald-600 text-white hover:bg-emerald-700 rounded-full text-sm font-semibold transition-colors"
          >
            Back to login
          </Link>
        )}
      </div>
    </div>
  );
}

