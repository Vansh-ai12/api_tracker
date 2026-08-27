"use client";

import { useState, useEffect } from "react";

interface ApiIntegration {
  id: string;
  service_name: string;
  provider: string;
  usage_current: number | null;
  usage_limit: number | null;
  usage_unit: string;
  credits_remaining: number | null;
  credit_limit: number | null;
  reset_at: string | null;
  currency: string;
  cost: number | null;
  status: string;
  connection_type: string;
  last_synced_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  next_sync_at: string | null;
  verification_status: string | null;
  verification_provider_total: number | null;
  verification_calculated_total: number | null;
  verification_difference: number | null;
  verification_difference_percentage: number | null;
  verification_checked_at: string | null;
  verification_reason: string | null;
}

interface ApiUsageCardProps {
  isPro: boolean;
}

export function ApiUsageCard({ isPro }: ApiUsageCardProps) {
  const [integrations, setIntegrations] = useState<ApiIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  const [verifyingIds, setVerifyingIds] = useState<Set<string>>(new Set());
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState<ApiIntegration | null>(null);

  useEffect(() => {
    if (isPro) {
      fetchIntegrations();
    } else {
      setLoading(false);
    }
  }, [isPro]);

  async function fetchIntegrations() {
    try {
      const res = await fetch("/api/api-integrations");
      if (res.ok) {
        const data = await res.json();
        setIntegrations(data.integrations || []);
      }
    } catch {
      // Ignore errors
    } finally {
      setLoading(false);
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

  async function handleVerify(integrationId: string) {
    if (verifyingIds.has(integrationId)) return;

    setVerifyingIds((prev) => new Set(prev).add(integrationId));

    try {
      const res = await fetch(`/api/api-integrations/${integrationId}/verify`, {
        method: "POST",
      });

      if (res.ok) {
        await fetchIntegrations();
      }
    } catch {
      // Ignore errors
    } finally {
      setVerifyingIds((prev) => {
        const next = new Set(prev);
        next.delete(integrationId);
        return next;
      });
    }
  }

  const getVerificationStatus = (integration: ApiIntegration) => {
    if (verifyingIds.has(integration.id)) return "verifying";
    if (!integration.verification_status) return "never";
    return integration.verification_status;
  };

  const getVerificationIcon = (status: string) => {
    switch (status) {
      case "verified": return "✓";
      case "mismatch": return "⚠";
      case "unavailable": return "—";
      case "failed": return "✕";
      case "verifying": return "⟳";
      default: return "—";
    }
  };

  const getVerificationColor = (status: string) => {
    switch (status) {
      case "verified": return "text-emerald-600 dark:text-emerald-400";
      case "mismatch": return "text-orange-600 dark:text-orange-400";
      case "unavailable": return "text-gray-400 dark:text-gray-500";
      case "failed": return "text-rose-600 dark:text-rose-400";
      case "verifying": return "text-blue-600 dark:text-blue-400";
      default: return "text-gray-400 dark:text-gray-500";
    }
  };

  const getUsagePercentage = (current: number | null, limit: number | null) => {
    if (current === null || limit === null || limit === 0) return null;
    return Math.round((current / limit) * 100);
  };

  const getWarningLevel = (percentage: number | null) => {
    if (percentage === null) return "normal";
    if (percentage >= 100) return "limit-reached";
    if (percentage >= 90) return "near-limit";
    if (percentage >= 70) return "approaching";
    return "normal";
  };

  const getWarningColor = (level: string) => {
    switch (level) {
      case "limit-reached":
        return "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border-rose-200 dark:border-rose-900/50";
      case "near-limit":
        return "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400 border-orange-200 dark:border-orange-900/50";
      case "approaching":
        return "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400 border-yellow-200 dark:border-yellow-900/50";
      default:
        return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/50";
    }
  };

  const getWarningLabel = (level: string) => {
    switch (level) {
      case "limit-reached": return "Limit reached";
      case "near-limit": return "Near limit";
      case "approaching": return "Approaching limit";
      default: return "Within limit";
    }
  };

  const getSyncStatus = (integration: ApiIntegration) => {
    if (syncingIds.has(integration.id)) return "syncing";
    if (integration.last_sync_status === "syncing") return "syncing";
    if (integration.last_sync_status === "failed") return "failed";
    if (integration.last_synced_at) return "synced";
    return "never";
  };

  const getSyncStatusText = (status: string, integration: ApiIntegration) => {
    switch (status) {
      case "syncing": return "Syncing...";
      case "failed": return integration.last_sync_error || "Sync failed";
      case "synced":
        if (!integration.last_synced_at) return "Never synced";
        const lastSync = new Date(integration.last_synced_at as string);
        const now = new Date();
        const diffMins = Math.floor((now.getTime() - lastSync.getTime()) / 60000);
        if (diffMins < 1) return "Just synced";
        if (diffMins < 60) return `${diffMins}m ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;
        return lastSync.toLocaleDateString("en-IN");
      case "never": return "Never synced";
      default: return status;
    }
  };

  const getSyncStatusColor = (status: string) => {
    switch (status) {
      case "syncing": return "text-blue-600 dark:text-blue-400";
      case "failed": return "text-rose-600 dark:text-rose-400";
      default: return "text-emerald-600 dark:text-emerald-400";
    }
  };

  if (!isPro) {
    return (
      <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#141414] p-5 sm:p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-[#0a0a0a] dark:text-white">
            API & Service Usage
          </h3>
        </div>
        <div className="text-center py-8 px-6 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-800/50">
          <div className="w-12 h-12 bg-gradient-to-br from-purple-50 to-indigo-100 dark:from-purple-950/50 dark:to-indigo-900/30 text-purple-600 dark:text-purple-400 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-purple-100 dark:border-purple-900/50">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-[#0a0a0a] dark:text-white mb-2">
            Pro Feature
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Track API usage, limits, and credits for external services.
          </p>
          <button className="px-4 py-2 rounded-full bg-black dark:bg-white text-white dark:text-black text-xs font-semibold hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors cursor-pointer">
            Upgrade to Pro
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#141414] p-5 sm:p-6 shadow-xs">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 dark:bg-gray-800 rounded w-1/3"></div>
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-24 bg-gray-100 dark:bg-gray-800 rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#141414] p-5 sm:p-6 shadow-xs">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-[#0a0a0a] dark:text-white">
          API & Service Usage
        </h3>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="px-3 py-1.5 rounded-full bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold transition-colors cursor-pointer"
        >
          + Add Service
        </button>
      </div>

      {integrations.length === 0 ? (
        <div className="text-center py-8 px-6 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-800/50">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No API integrations tracked yet. Add your first service to monitor usage.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {integrations.map((integration) => {
            const percentage = getUsagePercentage(integration.usage_current, integration.usage_limit);
            const warningLevel = getWarningLevel(percentage);
            const remaining = integration.usage_limit && integration.usage_current
              ? integration.usage_limit - integration.usage_current
              : null;
            const syncStatus = getSyncStatus(integration);

            return (
              <div
                key={integration.id}
                className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800/50"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="font-semibold text-sm text-[#0a0a0a] dark:text-white">
                      {integration.service_name}
                    </h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                      {integration.provider} • {integration.connection_type === "automatic" ? "Connected" : "Manual"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${getWarningColor(warningLevel)}`}>
                      {getWarningLabel(warningLevel)}
                    </span>
                    {integration.connection_type === "automatic" && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedIntegration(integration);
                          setShowVerificationModal(true);
                        }}
                        className={`text-[10px] font-medium ${getVerificationColor(getVerificationStatus(integration))} hover:underline cursor-pointer`}
                        title={integration.verification_reason || "Click for details"}
                      >
                        {getVerificationIcon(getVerificationStatus(integration))} {getVerificationStatus(integration) === "verifying" ? "Verifying..." : getVerificationStatus(integration) === "never" ? "Not verified" : getVerificationStatus(integration)}
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div>
                    <p className="text-[10px] font-medium text-gray-400 dark:text-gray-500 mb-0.5">
                      Usage
                    </p>
                    <p className="text-sm font-bold text-[#0a0a0a] dark:text-white">
                      {integration.usage_current !== null ? integration.usage_current.toLocaleString() : "N/A"}
                      {integration.usage_limit !== null && ` / ${integration.usage_limit.toLocaleString()}`}
                      <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">
                        {integration.usage_unit}
                      </span>
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium text-gray-400 dark:text-gray-500 mb-0.5">
                      Remaining
                    </p>
                    <p className="text-sm font-bold text-[#0a0a0a] dark:text-white">
                      {remaining !== null ? remaining.toLocaleString() : "N/A"}
                      <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">
                        {integration.usage_unit}
                      </span>
                    </p>
                  </div>
                </div>

                {percentage !== null && (
                  <div className="mb-3">
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          warningLevel === "limit-reached"
                            ? "bg-rose-500"
                            : warningLevel === "near-limit"
                            ? "bg-orange-500"
                            : warningLevel === "approaching"
                            ? "bg-yellow-500"
                            : "bg-emerald-500"
                        }`}
                        style={{ width: `${Math.min(percentage, 100)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                      {percentage}% used
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between mb-3">
                  <div className="text-[10px] text-gray-400 dark:text-gray-500">
                    {integration.reset_at && (
                      <span>Reset: {new Date(integration.reset_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}</span>
                    )}
                  </div>
                  <div className="text-[10px] font-medium">
                    <span className={getSyncStatusColor(syncStatus)}>
                      {syncStatus === "syncing" && "⟳ "}
                      {getSyncStatusText(syncStatus, integration)}
                    </span>
                  </div>
                </div>

                {integration.connection_type === "automatic" && (
                  <div className="flex gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => handleSync(integration.id)}
                      disabled={syncingIds.has(integration.id) || verifyingIds.has(integration.id)}
                      className="flex-1 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white text-xs font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed"
                    >
                      {syncingIds.has(integration.id) ? "Syncing..." : "Sync Now"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleVerify(integration.id)}
                      disabled={syncingIds.has(integration.id) || verifyingIds.has(integration.id)}
                      className="flex-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white text-xs font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed"
                    >
                      {verifyingIds.has(integration.id) ? "Verifying..." : "Verify Now"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-gray-800 p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-[#0a0a0a] dark:text-white">
                Add API Integration
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                ✕
              </button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Manual tracking is available. Automatic sync for specific providers requires provider API integration.
            </p>
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="w-full px-4 py-2 rounded-full bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {showVerificationModal && selectedIntegration && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-gray-800 p-6 w-full max-w-lg shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-[#0a0a0a] dark:text-white">
                Verification Details
              </h3>
              <button
                type="button"
                onClick={() => setShowVerificationModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-1">Service</p>
                <p className="text-sm font-semibold text-[#0a0a0a] dark:text-white">{selectedIntegration.service_name}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-1">Provider</p>
                <p className="text-sm text-[#0a0a0a] dark:text-white capitalize">{selectedIntegration.provider}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-1">Verification Status</p>
                <p className={`text-sm font-semibold ${getVerificationColor(getVerificationStatus(selectedIntegration))}`}>
                  {getVerificationIcon(getVerificationStatus(selectedIntegration))} {getVerificationStatus(selectedIntegration) === "never" ? "Not verified" : getVerificationStatus(selectedIntegration)}
                </p>
              </div>
              {selectedIntegration.verification_checked_at && (
                <div>
                  <p className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-1">Last Checked</p>
                  <p className="text-sm text-[#0a0a0a] dark:text-white">
                    {new Date(selectedIntegration.verification_checked_at as string).toLocaleString()}
                  </p>
                </div>
              )}
              {selectedIntegration.verification_provider_total !== null && (
                <div>
                  <p className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-1">Provider Reported</p>
                  <p className="text-sm text-[#0a0a0a] dark:text-white">
                    {selectedIntegration.verification_provider_total.toLocaleString()} {selectedIntegration.usage_unit}
                  </p>
                </div>
              )}
              {selectedIntegration.verification_calculated_total !== null && (
                <div>
                  <p className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-1">Calculated</p>
                  <p className="text-sm text-[#0a0a0a] dark:text-white">
                    {selectedIntegration.verification_calculated_total.toLocaleString()} {selectedIntegration.usage_unit}
                  </p>
                </div>
              )}
              {selectedIntegration.verification_difference !== null && (
                <div>
                  <p className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-1">Difference</p>
                  <p className="text-sm text-[#0a0a0a] dark:text-white">
                    {selectedIntegration.verification_difference.toLocaleString()} {selectedIntegration.usage_unit}
                    {selectedIntegration.verification_difference_percentage !== null && ` (${selectedIntegration.verification_difference_percentage.toFixed(2)}%)`}
                  </p>
                </div>
              )}
              {selectedIntegration.verification_reason && (
                <div>
                  <p className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-1">Reason</p>
                  <p className="text-sm text-[#0a0a0a] dark:text-white">{selectedIntegration.verification_reason}</p>
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setShowVerificationModal(false);
                  handleVerify(selectedIntegration.id);
                }}
                disabled={verifyingIds.has(selectedIntegration.id)}
                className="w-full px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white text-sm font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                {verifyingIds.has(selectedIntegration.id) ? "Verifying..." : "Verify Now"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
