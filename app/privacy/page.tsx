import React from "react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | Unsub",
  description: "Learn how Unsub collects, uses, protects, and handles your data, including Gmail OAuth and email forwarding.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 backdrop-blur-md bg-white/70 dark:bg-gray-950/70 border-b border-gray-100 dark:border-gray-800">
        <Link href="/" className="flex items-center gap-2">
          <Logo />
        </Link>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <Link
            href="/"
            className="px-4 py-2 text-sm font-medium rounded-full border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
          >
            ← Back to Home
          </Link>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl mx-auto px-6 py-12 md:py-16 w-full">
        <div className="mb-10 pb-8 border-b border-gray-200 dark:border-gray-800">
          <div className="inline-block px-3 py-1 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-semibold rounded-full text-xs border border-emerald-200 dark:border-emerald-900/50 mb-4">
            Legal & Compliance
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-gray-900 dark:text-gray-50 mb-3">
            Privacy Policy
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
            Last Updated: August 23, 2026
          </p>
        </div>

        <div className="prose prose-gray dark:prose-invert max-w-none space-y-8 text-gray-700 dark:text-gray-300 leading-relaxed">
          {/* Section 1 */}
          <section className="space-y-3">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">
              1. Introduction
            </h2>
            <p>
              Welcome to <strong>Unsub</strong> (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;). Unsub is a subscription management and renewal reminder tool designed to help users track recurring subscription expenses and receive timely notifications before renewal dates.
            </p>
            <p>
              This Privacy Policy explains how we collect, use, disclose, and protect your information when you use our web application at{" "}
              <code className="text-sm bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">https://api-tracker-dun.vercel.app</code>, our Telegram bot, and related services (collectively, the &quot;Service&quot;).
            </p>
            <p>
              By accessing or using Unsub, you agree to the collection and use of information in accordance with this Privacy Policy. If you do not agree with this policy, please do not use our Service.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">
              2. Information We Collect
            </h2>
            <p>We collect information strictly necessary to provide and improve our subscription tracking features:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Telegram Account Details:</strong> When you connect via Telegram, we receive your public Telegram User ID, Telegram Chat ID, and Telegram username (if available) to identify your account and deliver renewal notifications.
              </li>
              <li>
                <strong>Subscription &amp; Receipt Data:</strong> Structured metadata extracted from receipts you forward or authorize us to scan, including service names (e.g., Netflix, Spotify), billed amounts, currency, billing frequency, next renewal date, and deduplication message identifiers.
              </li>
              <li>
                <strong>Google Account Information (Optional):</strong> If you explicitly choose to connect your Google account via OAuth, we receive your Google email address and a secure, encrypted authorization refresh token to scan for subscription receipts.
              </li>
              <li>
                <strong>Usage &amp; Feedback Data:</strong> Responses you submit through Telegram inline buttons (e.g., whether you are still using a subscription, snooze requests, cancellation markers).
              </li>
              <li>
                <strong>Technical &amp; Log Data:</strong> IP address, device type, browser information, and session cookies used solely for account authentication and security monitoring.
              </li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="space-y-4">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">
              3. Google API &amp; Gmail Data Usage (Limited Use Policy)
            </h2>
            <div className="p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 space-y-2 text-sm text-emerald-950 dark:text-emerald-200">
              <p className="font-semibold">
                🛡️ Google API Services User Data Policy Compliance:
              </p>
              <p>
                Unsub&apos;s use and transfer to any other app of information received from Google APIs will adhere to{" "}
                <a
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-medium hover:text-emerald-700 dark:hover:text-emerald-100"
                >
                  Google API Services User Data Policy
                </a>
                , including the Limited Use requirements.
              </p>
            </div>

            <p>
              When you opt into our automated Gmail integration, Unsub requests only the <strong>minimum necessary read-only permissions</strong>:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>
                <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">https://www.googleapis.com/auth/gmail.readonly</code> — Read-only access to search and view subscription receipts and invoices.
              </li>
              <li>
                <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">https://www.googleapis.com/auth/userinfo.email</code> — View your Google account email address for connection identification.
              </li>
            </ul>

            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mt-4">
              How We Use Gmail Data:
            </h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Receipt Scanning Only:</strong> We query your inbox exclusively for candidate subscription and receipt emails (matching queries like receipt, invoice, billing, subscription).
              </li>
              <li>
                <strong>No Full Email Storage:</strong> We do not permanently store your personal email messages or full message bodies. We only extract and retain the structured subscription metadata (merchant, price, billing cycle, renewal date).
              </li>
              <li>
                <strong>No Human Access:</strong> No humans read your raw email messages unless you give explicit, affirmative consent for troubleshooting specific technical errors.
              </li>
              <li>
                <strong>No Advertising or Sale of Data:</strong> We <strong>never</strong> sell user data, transfer Gmail data for serving advertisements, or use Gmail data for retargeting, market research, or lending purposes.
              </li>
              <li>
                <strong>No Model Training:</strong> Your Gmail data is <strong>never</strong> used to train generalized artificial intelligence or machine learning models.
              </li>
            </ul>

            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mt-4">
              Revoking Access &amp; Disconnecting Gmail:
            </h3>
            <p>
              You maintain total control. You can disconnect Gmail at any time by clicking <em>&quot;Disconnect Gmail&quot;</em> in Telegram or on your web dashboard. When disconnected, Unsub calls Google&apos;s revocation endpoint (<code>https://oauth2.googleapis.com/revoke</code>) to invalidate the token, permanently deletes the stored encrypted credentials, and reverts your tracking mode to Private Inbox mode. You can also revoke access directly through{" "}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-emerald-600 dark:hover:text-emerald-400"
              >
                Google Account Security Settings
              </a>
              .
            </p>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">
              4. Private Email Forwarding Mode (Zero Google Permissions)
            </h2>
            <p>
              If you prefer not to connect your Gmail account, Unsub provides a fully private alternative. You are assigned a unique personal forwarding address (e.g., <code>username@unsub.app</code>). You simply forward individual receipts to this address, and our parsing engine extracts the renewal data without requiring any Google OAuth permissions or inbox access.
            </p>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">
              5. How We Use Your Information
            </h2>
            <p>We use collected data solely for the following operational purposes:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>To detect and record your active recurring subscriptions and billing cycles.</li>
              <li>To deliver timely Telegram renewal notifications before you are billed.</li>
              <li>To provide you with a dashboard summarizing your subscriptions, renewal dates, and spending.</li>
              <li>To secure your account, authenticate login sessions, and prevent fraudulent abuse.</li>
              <li>To process optional Pro plan upgrades through our payment gateway.</li>
            </ul>
          </section>

          {/* Section 6 */}
          <section className="space-y-3">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">
              6. Data Storage &amp; Security
            </h2>
            <p>
              We implement industry-standard security measures to safeguard your information:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Cryptographic Encryption:</strong> Google OAuth refresh tokens are encrypted at rest using <strong>AES-256-GCM</strong> encryption with unique initialization vectors (IVs) and authentication tags. Access tokens are kept strictly in transient memory.
              </li>
              <li>
                <strong>Database Security:</strong> Data is stored in secure PostgreSQL databases hosted with Supabase, protected by Row Level Security (RLS) policies and HTTPS/TLS in transit.
              </li>
              <li>
                <strong>Audit Logging:</strong> Critical actions (OAuth initiation, token revocation, mode changes) are logged without sensitive credentials for system integrity and auditing.
              </li>
            </ul>
          </section>

          {/* Section 7 */}
          <section className="space-y-3">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">
              7. Third-Party Service Providers
            </h2>
            <p>
              We share data with trusted third-party service providers only as necessary to operate the Service:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Supabase:</strong> Cloud database infrastructure and secure authentication session storage.
              </li>
              <li>
                <strong>Telegram Bot API:</strong> Messaging infrastructure to deliver notifications and interactive buttons.
              </li>
              <li>
                <strong>Google APIs:</strong> Read-only access to scan subscription receipts when authorized by you.
              </li>
              <li>
                <strong>Groq API:</strong> Artificial intelligence inference used to parse receipt text and extract structured subscription metadata.
              </li>
              <li>
                <strong>Razorpay:</strong> Secure payment processing for optional Pro plan subscriptions. We do not store your credit card or bank details.
              </li>
              <li>
                <strong>Vercel:</strong> Web hosting and serverless application deployment.
              </li>
            </ul>
          </section>

          {/* Section 8 */}
          <section className="space-y-3">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">
              8. Data Retention &amp; Deletion
            </h2>
            <p>
              We retain your information only as long as your account is active or needed to provide the Service. You have the right to request full deletion of your account and associated subscription data at any time. When an account is deleted, all stored subscription records, forwarding aliases, and encrypted OAuth tokens are permanently purged from our database.
            </p>
          </section>

          {/* Section 9 */}
          <section className="space-y-3">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">
              9. Your Rights &amp; Choices
            </h2>
            <p>Depending on your location, you have the right to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Access, review, or export the personal data we hold about you.</li>
              <li>Request correction of inaccurate or incomplete information.</li>
              <li>Request deletion of your account and all associated subscription records.</li>
              <li>Revoke third-party integrations (such as Gmail OAuth) at any time.</li>
              <li>Opt out of Telegram notifications by stopping the bot or disconnecting your Telegram account.</li>
            </ul>
          </section>

          {/* Section 10 */}
          <section className="space-y-3">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">
              10. Children&apos;s Privacy
            </h2>
            <p>
              Unsub is not intended for use by individuals under the age of 18. We do not knowingly collect personal information from children. If you believe a minor has provided us with personal information, please contact us and we will promptly delete it.
            </p>
          </section>

          {/* Section 11 */}
          <section className="space-y-3">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">
              11. Changes to This Privacy Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time to reflect changes in our practices, technology, or legal requirements. When updates occur, we will revise the &quot;Last Updated&quot; date at the top of this page. Continued use of Unsub after changes are posted constitutes your acceptance of the revised policy.
            </p>
          </section>

          {/* Section 12 */}
          <section className="space-y-3 pb-8">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">
              12. Contact Us
            </h2>
            <p>
              If you have any questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us at:
            </p>
            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-sm space-y-1">
              <p><strong>Application:</strong> Unsub</p>
              <p><strong>Email:</strong> <a href="mailto:vj2754108@gmail.com" className="text-emerald-600 dark:text-emerald-400 underline">vj2754108@gmail.com</a> / <a href="mailto:support@unsub.app" className="text-emerald-600 dark:text-emerald-400 underline">support@unsub.app</a></p>
              <p><strong>Website:</strong> <a href="https://api-tracker-dun.vercel.app" className="text-emerald-600 dark:text-emerald-400 underline">https://api-tracker-dun.vercel.app</a></p>
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-gray-100 dark:border-gray-800 text-center text-xs text-gray-500 dark:text-gray-400">
        <p>© 2026 Unsub. All rights reserved. · <Link href="/terms" className="hover:underline">Terms of Service</Link> · <Link href="/privacy" className="hover:underline">Privacy Policy</Link></p>
      </footer>
    </div>
  );
}
