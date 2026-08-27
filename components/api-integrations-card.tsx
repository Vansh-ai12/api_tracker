"use client";

import { useEffect, useState } from "react";

interface Integration {
  id: string;
  service_name: string;
  provider: string;
  category?: string | null;
  usage_current?: number | null;
  usage_limit?: number | null;
  usage_unit?: string | null;
  credits_remaining?: number | null;
  credit_limit?: number | null;
  billing_period?: string | null;
  reset_at?: string | null;
  deadline_at?: string | null;
  currency?: string | null;
  cost?: number | null;
  status?: string | null;
  connection_type?: string | null;
  sync_enabled?: boolean | null;
  last_synced_at?: string | null;
  last_sync_status?: string | null;
  last_sync_error?: string | null;
  verification_status?: string | null;
  notes?: string | null;
}

const PROVIDERS = [
  { value: "openai", label: "OpenAI", description: "Admin API key required for usage data" },
  { value: "anthropic", label: "Anthropic", description: "Admin API key required (currently unavailable)" },
  { value: "gemini", label: "Google Gemini", description: "Cloud credentials required (currently unavailable)" },
  { value: "manual", label: "Manual Tracking", description: "Enter usage manually" },
];

const emptyForm = {
  service_name: "",
  provider: "openai",
  category: "AI / API",
  credentials: "",
  // Manual fields
  usage_current: "",
  usage_limit: "",
  usage_unit: "tokens",
  credits_remaining: "",
  credit_limit: "",
  billing_period: "Monthly",
  reset_at: "",
  deadline_at: "",
  currency: "USD",
  cost: "",
  notes: "",
};

export function ApiIntegrationsCard({ isPro }: { isPro: boolean }) {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());

  async function fetchIntegrations() {
    try {
      const res = await fetch("/api/api-integrations", {
        cache: "no-store",
      });

      if (!res.ok) {
        setIntegrations([]);
        return;
      }

      const data = await res.json();

      setIntegrations(
        Array.isArray(data.integrations)
          ? data.integrations
          : Array.isArray(data)
            ? data
            : [],
      );
    } catch {
      setIntegrations([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isPro) {
      setLoading(false);
      setIntegrations([]);
      return;
    }

    fetchIntegrations();
  }, [isPro]);

  function updateField(
    field: keyof typeof emptyForm,
    value: string,
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.service_name.trim() || !form.provider.trim()) {
      setError("Service name and provider are required.");
      return;
    }

    const isManual = form.provider === "manual";

    if (!isManual && !form.credentials.trim()) {
      setError("API key is required for automatic tracking.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const payload: any = {
        service_name: form.service_name.trim(),
        provider: form.provider.trim(),
        category: form.category || null,
        connection_type: isManual ? "manual" : "automatic",
        credentials: form.credentials.trim() || undefined,
        notes: form.notes.trim() || null,
      };

      // Only include manual fields if manual tracking
      if (isManual) {
        payload.usage_current = form.usage_current === "" ? 0 : Number(form.usage_current);
        payload.usage_limit = form.usage_limit === "" ? null : Number(form.usage_limit);
        payload.usage_unit = form.usage_unit || null;
        payload.credits_remaining = form.credits_remaining === "" ? null : Number(form.credits_remaining);
        payload.credit_limit = form.credit_limit === "" ? null : Number(form.credit_limit);
        payload.billing_period = form.billing_period || null;
        payload.reset_at = form.reset_at || null;
        payload.deadline_at = form.deadline_at || null;
        payload.currency = form.currency || "USD";
        payload.cost = form.cost === "" ? 0 : Number(form.cost);
      }

      const res = await fetch("/api/api-integrations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(
          data?.error || "Failed to add API integration.",
        );
      }

      setForm(emptyForm);
      setShowForm(false);

      await fetchIntegrations();
    } catch (err: any) {
      setError(
        err?.message || "Failed to add API integration.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSync(integrationId: string) {
    if (syncingIds.has(integrationId)) return;

    setSyncingIds((prev) => new Set(prev).add(integrationId));

    try {
      const res = await fetch(`/api/api-integrations/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ integration_id: integrationId }),
      });

      if (res.ok) {
        await fetchIntegrations();
      }
    } catch {
      // Ignore errors
    } finally {
      setSyncingIds((prev) => {
        const next = new Set(prev);
        next.delete(integrationId);
        return next;
      });
    }
  }

  async function handleDelete(integrationId: string) {
    try {
      const res = await fetch(`/api/api-integrations/${integrationId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await fetchIntegrations();
      }
    } catch {
      // Ignore errors
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#141414] p-5 sm:p-6 shadow-xs">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 dark:bg-gray-800 rounded w-1/3" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 bg-gray-100 dark:bg-gray-800 rounded-xl"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const selectedProvider = PROVIDERS.find(p => p.value === form.provider);
  const isManual = form.provider === "manual";

  // Locked state for Free users
  if (!isPro) {
    return (
      <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#141414] p-5 sm:p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-[#0a0a0a] dark:text-white">
              API & Integrations
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Track API usage, credits, limits and billing.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">
              Pro feature
            </span>
            <span className="text-xs px-2 py-1 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
              🔒 Locked
            </span>
          </div>
        </div>

        <div className="rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 p-8 text-center">
          <div className="text-4xl mb-4">🔒</div>
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
            API usage tracking is a Pro feature
          </h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Connect OpenAI, Anthropic, Gemini, and other providers for automatic usage tracking and verification.
          </p>
          <button
            type="button"
            className="rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 text-xs font-semibold transition"
          >
            Upgrade to Pro
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#141414] p-5 sm:p-6 shadow-xs">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-[#0a0a0a] dark:text-white">
            API & Integrations
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Track API usage, credits, limits and billing.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">
            {integrations.length} services
          </span>

          <button
            type="button"
            onClick={() => {
              setError("");
              setShowForm(true);
            }}
            className="rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-2 text-xs font-semibold transition"
          >
            + Add Service
          </button>
        </div>
      </div>

      {integrations.length === 0 ? (
        <div className="rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 p-6 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No API services tracked yet.
          </p>

          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Connect OpenAI, Anthropic, or Gemini for automatic tracking, or add manual entries.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {integrations.map((integration) => {
            const isAuto = integration.connection_type === "automatic";
            const usage = integration.usage_current ?? 0;
            const limit = integration.usage_limit ?? 0;
            const usagePercent = limit > 0 ? Math.min(100, Math.round((usage / limit) * 100)) : 0;

            return (
              <div
                key={integration.id}
                className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800/50"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-[#0a0a0a] dark:text-white">
                        {integration.service_name}
                      </span>

                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${isAuto ? "bg-blue-500" : "bg-gray-500"} text-white`}>
                        {isAuto ? "Auto" : "Manual"}
                      </span>

                      {integration.verification_status && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                          integration.verification_status === "verified" ? "bg-emerald-500" :
                          integration.verification_status === "mismatch" ? "bg-orange-500" :
                          integration.verification_status === "unavailable" ? "bg-gray-500" :
                          "bg-rose-500"
                        } text-white`}>
                          {integration.verification_status}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {integration.provider}
                      {integration.category ? ` • ${integration.category}` : ""}
                    </p>

                    {isAuto && integration.last_synced_at && (
                      <p className="text-[10px] text-gray-400 mt-1">
                        Last synced: {new Date(integration.last_synced_at).toLocaleString()}
                      </p>
                    )}

                    {!isAuto && (
                      <p className="text-[10px] text-gray-400 mt-1">
                        Manual tracking
                      </p>
                    )}
                  </div>

                  {isAuto && (
                    <button
                      type="button"
                      onClick={() => handleSync(integration.id)}
                      disabled={syncingIds.has(integration.id)}
                      className="rounded-lg bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white px-3 py-1.5 text-xs font-semibold transition"
                    >
                      {syncingIds.has(integration.id) ? "Syncing..." : "Sync Now"}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                  <div>
                    <p className="text-[10px] text-gray-400">Usage</p>
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                      {usage !== null ? usage.toLocaleString() : "—"}
                      {integration.usage_unit ? ` ${integration.usage_unit}` : ""}
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] text-gray-400">Limit</p>
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                      {limit ? limit.toLocaleString() : "Unavailable"}
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] text-gray-400">Cost</p>
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                      {integration.cost !== null && integration.cost !== undefined ? `${integration.currency || "USD"} ${integration.cost.toFixed(2)}` : "Unavailable"}
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] text-gray-400">Balance</p>
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                      {integration.credits_remaining !== null ? `${integration.currency || "USD"} ${integration.credits_remaining}` : "Unavailable"}
                    </p>
                  </div>
                </div>

                {limit > 0 && usagePercent > 0 && (
                  <div className="mt-3">
                    <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                      <span>Usage</span>
                      <span>{usagePercent}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${usagePercent}%` }}
                      />
                    </div>
                  </div>
                )}

                {integration.last_sync_error && (
                  <p className="text-[10px] text-rose-500 mt-3">
                    Last error: {integration.last_sync_error}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-gray-800 bg-[#141414] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-white">
                  Add API Service
                </h2>
                <p className="text-xs text-gray-400 mt-1">
                  Connect a provider for automatic tracking or enter usage manually.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="text-gray-400 hover:text-white text-xl"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field
                  label="Service name"
                  value={form.service_name}
                  onChange={(v) => updateField("service_name", v)}
                  placeholder="My OpenAI API"
                  required
                />

                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">
                    Provider
                  </label>
                  <select
                    value={form.provider}
                    onChange={(e) => updateField("provider", e.target.value)}
                    className="w-full rounded-lg border border-gray-700 bg-[#0d0d0d] text-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  >
                    {PROVIDERS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  {selectedProvider && (
                    <p className="text-[10px] text-gray-400 mt-1">
                      {selectedProvider.description}
                    </p>
                  )}
                </div>

                <Field
                  label="Category"
                  value={form.category}
                  onChange={(v) => updateField("category", v)}
                  placeholder="AI / API"
                />

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-300 mb-1">
                    {isManual ? "API key / credentials (optional)" : "API key (required)"}
                  </label>
                  <input
                    type="password"
                    value={form.credentials}
                    onChange={(e) => updateField("credentials", e.target.value)}
                    placeholder={isManual ? "Stored securely (optional)" : "sk-proj-... for OpenAI Admin API"}
                    required={!isManual}
                    className="w-full rounded-lg border border-gray-700 bg-[#0d0d0d] text-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  />
                  {!isManual && (
                    <p className="text-[10px] text-gray-400 mt-1">
                      Credentials are encrypted and stored securely.
                    </p>
                  )}
                </div>

                {isManual && (
                  <>
                    <Field
                      label="Current usage"
                      type="number"
                      value={form.usage_current}
                      onChange={(v) => updateField("usage_current", v)}
                      placeholder="125000"
                    />

                    <Field
                      label="Usage limit"
                      type="number"
                      value={form.usage_limit}
                      onChange={(v) => updateField("usage_limit", v)}
                      placeholder="1000000"
                    />

                    <Field
                      label="Usage unit"
                      value={form.usage_unit}
                      onChange={(v) => updateField("usage_unit", v)}
                      placeholder="tokens"
                    />

                    <Field
                      label="Credits remaining"
                      type="number"
                      step="any"
                      value={form.credits_remaining}
                      onChange={(v) => updateField("credits_remaining", v)}
                      placeholder="8.50"
                    />

                    <Field
                      label="Credit limit"
                      type="number"
                      step="any"
                      value={form.credit_limit}
                      onChange={(v) => updateField("credit_limit", v)}
                      placeholder="10"
                    />

                    <Field
                      label="Billing period"
                      value={form.billing_period}
                      onChange={(v) => updateField("billing_period", v)}
                      placeholder="Monthly"
                    />

                    <Field
                      label="Currency"
                      value={form.currency}
                      onChange={(v) => updateField("currency", v)}
                      placeholder="USD"
                    />

                    <Field
                      label="Reset date"
                      type="date"
                      value={form.reset_at}
                      onChange={(v) => updateField("reset_at", v)}
                    />

                    <Field
                      label="Deadline"
                      type="date"
                      value={form.deadline_at}
                      onChange={(v) => updateField("deadline_at", v)}
                    />

                    <Field
                      label="Cost"
                      type="number"
                      step="any"
                      value={form.cost}
                      onChange={(v) => updateField("cost", v)}
                      placeholder="10"
                    />
                  </>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">
                  Notes
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) => updateField("notes", e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-gray-700 bg-[#0d0d0d] text-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  placeholder="Optional notes"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-rose-900/50 bg-rose-950/30 px-3 py-2 text-xs text-rose-400">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white"
                >
                  {saving ? "Saving..." : "Add Service"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  step,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  step?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-300 mb-1">
        {label}
      </label>
      <input
        type={type}
        step={step}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-700 bg-[#0d0d0d] text-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
      />
    </div>
  );
}