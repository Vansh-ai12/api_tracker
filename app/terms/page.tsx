import React from "react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | Unsub",
  description: "Review the Terms of Service governing your use of the Unsub subscription tracking application and services.",
};

export default function TermsOfServicePage() {
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
            Terms of Service
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
            Last Updated: August 23, 2026
          </p>
        </div>

        <div className="prose prose-gray dark:prose-invert max-w-none space-y-8 text-gray-700 dark:text-gray-300 leading-relaxed">
          {/* Section 1 */}
          <section className="space-y-3">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">
              1. Acceptance of Terms
            </h2>
            <p>
              By accessing or using the <strong>Unsub</strong> web application (<code className="text-sm bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">https://api-tracker-dun.vercel.app</code>), Telegram bot (<code className="text-sm bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">@UnsubGbot</code>), API endpoints, or any associated services (collectively, the &quot;Service&quot;), you agree to be bound by these Terms of Service (&quot;Terms&quot;).
            </p>
            <p>
              If you do not agree to all terms and conditions herein, you must not access or use the Service.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">
              2. Description of the Service
            </h2>
            <p>
              Unsub is a personal subscription tracking platform that helps users monitor recurring expenses and receive proactive renewal reminders. Features include:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Automated &amp; Forwarded Receipt Parsing:</strong> Extracting subscription details (vendor name, price, renewal frequency, billing date) from forwarded receipts or connected Gmail accounts.
              </li>
              <li>
                <strong>Telegram Renewal Alerts:</strong> Sending timely notifications and actionable prompts prior to renewal billing dates.
              </li>
              <li>
                <strong>Spending &amp; Usage Dashboard:</strong> Providing an overview of active subscriptions, estimated recurring costs, and renewal schedules.
              </li>
            </ul>
            <p>
              <em>Important Disclaimer:</em> Unsub is an independent tracking and reminder utility. Unsub is not a financial institution, bank, payment gateway, or subscription cancellation agent. Unsub does not automatically cancel subscriptions on third-party merchant websites unless specifically facilitated by merchant links.
            </p>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">
              3. User Accounts &amp; Telegram Authentication
            </h2>
            <p>
              You access Unsub via Telegram pairing, one-time passwords (OTP), or web session tokens. You are responsible for safeguarding your login credentials and devices. You agree to notify us immediately of any unauthorized access or security breach involving your account.
            </p>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">
              4. Gmail / Google Account Authorization
            </h2>
            <p>
              If you choose to connect your Google account, you authorize Unsub to access your Gmail inbox on a <strong>read-only</strong> basis strictly to search for and parse subscription receipts and billing statements.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>You may disconnect your Google account at any time via the Telegram bot or web dashboard.</li>
              <li>Disconnecting revokes authorization with Google and deletes all stored encrypted tokens.</li>
              <li>You may also revoke permissions at any time directly through Google Account Security settings.</li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">
              5. Acceptable Use Policy
            </h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Use the Service for any unlawful, fraudulent, or abusive purpose.</li>
              <li>Attempt to reverse-engineer, decompile, or compromise the security of the Service.</li>
              <li>Interfere with or disrupt the normal operation of the servers, APIs, or networks connected to Unsub.</li>
              <li>Forward spam, phishing materials, malicious files, or emails that do not belong to you to the Unsub forwarding address.</li>
              <li>Abuse, spam, or overload our Telegram bot or webhook infrastructure.</li>
            </ul>
          </section>

          {/* Section 6 */}
          <section className="space-y-3">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">
              6. Subscriptions, Fees, &amp; Billing
            </h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Free Tier &amp; Trial:</strong> Unsub may provide free tracking tiers and a 7-day free trial for new users.
              </li>
              <li>
                <strong>Pro Plan:</strong> Pro subscription features (including advanced automated reminders and unlimited tracking) are available for ₹49/month (or equivalent currency shown at checkout).
              </li>
              <li>
                <strong>Payment Processing:</strong> Payments are securely processed through authorized payment partners (such as Razorpay). Unsub does not directly collect or store sensitive payment card information.
              </li>
              <li>
                <strong>Cancellation:</strong> You may cancel your paid plan subscription at any time. Upon cancellation, your Pro benefits remain active through the end of your current billing period.
              </li>
            </ul>
          </section>

          {/* Section 7 */}
          <section className="space-y-3">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">
              7. Intellectual Property
            </h2>
            <p>
              The Unsub website, user interface, brand assets, logos, design, code, and documentation are the exclusive intellectual property of Unsub and its creators. You are granted a limited, non-exclusive, non-transferable license to access and use the Service for personal, non-commercial purposes.
            </p>
          </section>

          {/* Section 8 */}
          <section className="space-y-3">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">
              8. Third-Party Services
            </h2>
            <p>
              Unsub integrates with third-party platforms including Google, Telegram, Groq, Supabase, and Razorpay. Your use of these services is subject to their respective terms and privacy policies. Unsub is not responsible for the availability, downtime, or policy changes of any third-party provider.
            </p>
          </section>

          {/* Section 9 */}
          <section className="space-y-3">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">
              9. Service Availability &amp; Modifications
            </h2>
            <p>
              We strive for continuous availability, but we do not guarantee uninterrupted, error-free operation. We reserve the right to modify, suspend, or discontinue any aspect of the Service at any time with or without prior notice.
            </p>
          </section>

          {/* Section 10 */}
          <section className="space-y-3">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">
              10. Disclaimer of Warranties
            </h2>
            <p className="uppercase text-xs font-semibold tracking-wider text-gray-500 dark:text-gray-400">
              Please read this section carefully.
            </p>
            <p>
              THE SERVICE IS PROVIDED ON AN &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; BASIS WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.
            </p>
            <p>
              UNSUB DOES NOT WARRANT THAT RECEIPT PARSING WILL ALWAYS BE 100% ACCURATE OR THAT RENEWAL NOTIFICATIONS WILL ALWAYS BE DELIVERED WITHOUT DELAY. YOU REMAIN SOLELY RESPONSIBLE FOR VERIFYING YOUR BANKING AND SUBSCRIPTION BILLING DATES.
            </p>
          </section>

          {/* Section 11 */}
          <section className="space-y-3">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">
              11. Limitation of Liability
            </h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL UNSUB, ITS DEVELOPERS, OR AFFILIATES BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES (INCLUDING LOSS OF PROFITS, DATA, OR SUBSCRIPTION FEES CHARGED BY THIRD PARTIES) ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF THE SERVICE.
            </p>
          </section>

          {/* Section 12 */}
          <section className="space-y-3">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">
              12. Termination
            </h2>
            <p>
              We reserve the right to suspend or terminate your access to the Service at our sole discretion, without prior notice, if you violate these Terms or engage in conduct harmful to other users or the Service.
            </p>
          </section>

          {/* Section 13 */}
          <section className="space-y-3">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">
              13. Changes to These Terms
            </h2>
            <p>
              We may revise these Terms from time to time. The most current version will always be posted on this page with the revised &quot;Last Updated&quot; date. Your continued use of Unsub after revisions become effective constitutes your binding acceptance of the updated Terms.
            </p>
          </section>

          {/* Section 14 */}
          <section className="space-y-3 pb-8">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">
              14. Contact Information
            </h2>
            <p>
              If you have any questions or comments regarding these Terms of Service, please contact us at:
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
