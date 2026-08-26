"use client";

import { useState } from "react";

interface SubscriptionFiltersProps {
  onFilterChange: (filter: string) => void;
  onSortChange: (sort: string) => void;
  totalSubscriptions: number;
}

export function SubscriptionFilters({ onFilterChange, onSortChange, totalSubscriptions }: SubscriptionFiltersProps) {
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("renewal_date");

  const handleFilterChange = (newFilter: string) => {
    setFilter(newFilter);
    onFilterChange(newFilter);
  };

  const handleSortChange = (newSort: string) => {
    setSort(newSort);
    onSortChange(newSort);
  };

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">Filter:</span>
        <button
          type="button"
          onClick={() => handleFilterChange("all")}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            filter === "all"
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60"
              : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700"
          }`}
        >
          All ({totalSubscriptions})
        </button>
        <button
          type="button"
          onClick={() => handleFilterChange("active")}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            filter === "active"
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60"
              : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700"
          }`}
        >
          Active
        </button>
        <button
          type="button"
          onClick={() => handleFilterChange("cancelled")}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            filter === "cancelled"
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60"
              : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700"
          }`}
        >
          Cancelled
        </button>
        <button
          type="button"
          onClick={() => handleFilterChange("gmail")}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            filter === "gmail"
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60"
              : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700"
          }`}
        >
          Gmail
        </button>
        <button
          type="button"
          onClick={() => handleFilterChange("manual")}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            filter === "manual"
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60"
              : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700"
          }`}
        >
          Manual
        </button>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">Sort by:</span>
        <select
          value={sort}
          onChange={(e) => handleSortChange(e.target.value)}
          className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="renewal_date">Renewal Date</option>
          <option value="amount">Monthly Cost</option>
          <option value="created_at">Recently Added</option>
          <option value="service_name">Name</option>
        </select>
      </div>
    </div>
  );
}
