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
  last_synced_at?: string | null;
  last_sync_status?: string | null;
  last_sync_error?: string | null;
  notes?: string | null;
}

const emptyForm = {
  service_name: "",
  provider: "",
  category: "AI / API",
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
  status: "active",
  connection_type: "manual",
  credentials: "",
  notes: "",
};

export function ApiIntegrationsCard() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm);

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
    fetchIntegrations();
  }, []);

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

    setSaving(true);
    setError("");

    try {
      const payload = {
        service_name: form.service_name.trim(),
        provider: form.provider.trim(),
        category: form.category || null,

        usage_current:
          form.usage_current === ""
            ? 0
            : Number(form.usage_current),

        usage_limit:
          form.usage_limit === ""
            ? null
            : Number(form.usage_limit),

        usage_unit: form.usage_unit || null,

        credits_remaining:
          form.credits_remaining === ""
            ? null
            : Number(form.credits_remaining),

        credit_limit:
          form.credit_limit === ""
            ? null
            : Number(form.credit_limit),

        billing_period: form.billing_period || null,
        reset_at: form.reset_at || null,
        deadline_at: form.deadline_at || null,
        currency: form.currency || "USD",

        cost:
          form.cost === ""
            ? 0
            : Number(form.cost),

        status: form.status || "active",
        connection_type: form.connection_type || "manual",

        credentials:
          form.credentials.trim() || undefined,

        notes: form.notes.trim() || null,
      };

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
            Add OpenAI, Claude, or any other API to track usage and credits.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {integrations.map((integration) => {
            const usage =
              integration.usage_current ?? 0;

            const limit =
              integration.usage_limit ?? 0;

            const usagePercent =
              limit > 0
                ? Math.min(
                    100,
                    Math.round((usage / limit) * 100),
                  )
                : 0;

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

                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500 text-white">
                        {integration.status || "active"}
                      </span>
                    </div>

                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {integration.provider}
                      {integration.category
                        ? ` • ${integration.category}`
                        : ""}
                    </p>
                  </div>

                  {integration.credits_remaining !== null &&
                    integration.credits_remaining !== undefined && (
                      <div className="text-right shrink-0">
                        <p className="text-[10px] text-gray-400">
                          Credits remaining
                        </p>
                        <p className="text-sm font-bold text-emerald-500">
                          {integration.currency || "USD"}{" "}
                          {integration.credits_remaining}
                        </p>
                      </div>
                    )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                  <div>
                    <p className="text-[10px] text-gray-400">
                      Usage
                    </p>
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                      {usage.toLocaleString()}{" "}
                      {integration.usage_unit || ""}
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] text-gray-400">
                      Limit
                    </p>
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                      {limit
                        ? limit.toLocaleString()
                        : "—"}
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] text-gray-400">
                      Billing
                    </p>
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                      {integration.billing_period || "—"}
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] text-gray-400">
                      Reset
                    </p>
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                      {integration.reset_at
                        ? new Date(
                            integration.reset_at,
                          ).toLocaleDateString("en-IN")
                        : "—"}
                    </p>
                  </div>
                </div>

                {limit > 0 && (
                  <div className="mt-3">
                    <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                      <span>Usage</span>
                      <span>{usagePercent}%</span>
                    </div>

                    <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{
                          width: `${usagePercent}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {integration.deadline_at && (
                  <p className="text-[10px] text-gray-400 mt-3">
                    Deadline:{" "}
                    {new Date(
                      integration.deadline_at,
                    ).toLocaleDateString("en-IN")}
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
                  Add OpenAI, Claude, or any API you want to track.
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

            <form
              onSubmit={handleSubmit}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field
                  label="Service name"
                  value={form.service_name}
                  onChange={(v) =>
                    updateField("service_name", v)
                  }
                  placeholder="OpenAI API"
                  required
                />

                <Field
                  label="Provider"
                  value={form.provider}
                  onChange={(v) =>
                    updateField("provider", v)
                  }
                  placeholder="OpenAI"
                  required
                />

                <Field
                  label="Category"
                  value={form.category}
                  onChange={(v) =>
                    updateField("category", v)
                  }
                  placeholder="AI / API"
                />

                <Field
                  label="Usage unit"
                  value={form.usage_unit}
                  onChange={(v) =>
                    updateField("usage_unit", v)
                  }
                  placeholder="tokens"
                />

                <Field
                  label="Current usage"
                  type="number"
                  value={form.usage_current}
                  onChange={(v) =>
                    updateField("usage_current", v)
                  }
                  placeholder="125000"
                />

                <Field
                  label="Usage limit"
                  type="number"
                  value={form.usage_limit}
                  onChange={(v) =>
                    updateField("usage_limit", v)
                  }
                  placeholder="1000000"
                />

                <Field
                  label="Credits remaining"
                  type="number"
                  step="any"
                  value={form.credits_remaining}
                  onChange={(v) =>
                    updateField("credits_remaining", v)
                  }
                  placeholder="8.50"
                />

                <Field
                  label="Credit limit"
                  type="number"
                  step="any"
                  value={form.credit_limit}
                  onChange={(v) =>
                    updateField("credit_limit", v)
                  }
                  placeholder="10"
                />

                <Field
                  label="Billing period"
                  value={form.billing_period}
                  onChange={(v) =>
                    updateField("billing_period", v)
                  }
                  placeholder="Monthly"
                />

                <Field
                  label="Currency"
                  value={form.currency}
                  onChange={(v) =>
                    updateField("currency", v)
                  }
                  placeholder="USD"
                />

                <Field
                  label="Reset date"
                  type="date"
                  value={form.reset_at}
                  onChange={(v) =>
                    updateField("reset_at", v)
                  }
                />

                <Field
                  label="Deadline"
                  type="date"
                  value={form.deadline_at}
                  onChange={(v) =>
                    updateField("deadline_at", v)
                  }
                />

                <Field
                  label="Cost"
                  type="number"
                  step="any"
                  value={form.cost}
                  onChange={(v) =>
                    updateField("cost", v)
                  }
                  placeholder="10"
                />

                <Field
                  label="Connection type"
                  value={form.connection_type}
                  onChange={(v) =>
                    updateField("connection_type", v)
                  }
                  placeholder="manual"
                />
              </div>

              <Field
                label="API key / credentials (optional)"
                type="password"
                value={form.credentials}
                onChange={(v) =>
                  updateField("credentials", v)
                }
                placeholder="Stored securely"
              />

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">
                  Notes
                </label>

                <textarea
                  value={form.notes}
                  onChange={(e) =>
                    updateField("notes", e.target.value)
                  }
                  rows={3}
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
                  {saving
                    ? "Saving..."
                    : "Add Service"}
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