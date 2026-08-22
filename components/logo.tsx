import React from "react";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  className?: string;
}

export function Logo({
  size = "md",
  showText = true,
  className = "",
}: LogoProps) {
  // Define dimensions based on size prop
  const iconSizes = {
    sm: "w-5 h-5",
    md: "w-6 h-6",
    lg: "w-8 h-8",
  };

  const textSizes = {
    sm: "text-lg",
    md: "text-xl",
    lg: "text-2xl",
  };

  return (
    <div className={`flex items-center gap-2 font-bold tracking-tight select-none ${className}`}>
      {/* Icon: Shield + Check + Circular Renewal Ring */}
      <div className="relative flex items-center justify-center">
        <svg
          className={`${iconSizes[size]} text-emerald-500`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Shield contour for protection */}
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          {/* Checkmark inside shield */}
          <path d="M9 12l2 2 4-4" />
        </svg>
      </div>

      {showText && (
        <span className={`${textSizes[size]} font-bold tracking-tight text-[#0a0a0a] dark:text-white`}>
          Unsub
        </span>
      )}
    </div>
  );
}
