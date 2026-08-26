"use client";

import { useState, useEffect } from "react";

interface Integration {
  name: string;
  purpose: string;
  access: string;
  status: "connected" | "not_connected" | "error" | "available";
  lastUsed?: string | null;
  icon: string;
}

export function ApiIntegrationsCard() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchIntegrations() {
      try {
        const res = await fetch("/api/integrations");
        if (res.ok) {
          const data = await res.json();
          setIntegrations(data.integrations);
        }
      } catch {
        // Ignore errors
      } finally {
        setLoading(false);
      }
    }
    fetchIntegrations();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "connected":
        return "bg-emerald-500";
      case "available":
        return "bg-blue-500";
      case "error":
        return "bg-rose-500";
      default:
        return "bg-gray-400";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "connected":
        return "Connected";
      case "available":
        return "Available";
      case "error":
        return "Error";
      default:
        return "Not Connected";
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#141414] p-5 sm:p-6 shadow-xs">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 dark:bg-gray-800 rounded w-1/3"></div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-xl"></div>
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
          API & Integrations
        </h3>
        <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">
          {integrations.length} services
        </span>
      </div>

      <div className="space-y-3">
        {integrations.map((integration) => (
          <div
            key={integration.name}
            className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800/50"
          >
            <div className="text-2xl shrink-0">{integration.icon}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-sm text-[#0a0a0a] dark:text-white">
                  {integration.name}
                </span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${getStatusColor(
                    integration.status
                  )} text-white`}
                >
                  {getStatusText(integration.status)}
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                {integration.purpose}
              </p>
              <div className="flex items-center gap-3 text-[10px] text-gray-400 dark:text-gray-500">
                <span>Access: {integration.access}</span>
                {integration.lastUsed && (
                  <span>Last used: {new Date(integration.lastUsed).toLocaleDateString("en-IN")}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
