"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Handles OAuth callback hashes (#access_token=...) or PKCE codes (?code=...)
 * landed on root pages (e.g. http://localhost:3000/#access_token=...) when
 * Supabase default Site URL is used as the OAuth redirect target.
 */
export function AuthHashHandler() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const pathname = window.location.pathname;
    const hash = window.location.hash;
    const search = window.location.search;

    // Only run if not already on /auth/callback
    if (pathname !== "/auth/callback") {
      if (
        (hash && (hash.includes("access_token=") || hash.includes("error="))) ||
        (search && (search.includes("code=") || search.includes("error=")))
      ) {
        router.replace(`/auth/callback${search}${hash}`);
      }
    }
  }, [router]);

  return null;
}
