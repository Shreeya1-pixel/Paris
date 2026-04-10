"use client";

import { cn } from "@/lib/utils";

interface SkeletonCardProps {
  variant?: "landscape" | "portrait" | "row" | "place";
  className?: string;
}

function Shimmer({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded", className)} style={{ background: "var(--bg-glass)" }}>
      <div className="w-full h-full rounded"
        style={{ background: "linear-gradient(90deg, var(--bg-glass) 0%, rgba(255,255,255,0.05) 50%, var(--bg-glass) 100%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite" }} />
    </div>
  );
}

export function SkeletonCard({ variant = "portrait", className }: SkeletonCardProps) {
  if (variant === "landscape") {
    return (
      <div className={cn("glass-card overflow-hidden shrink-0 w-[280px] h-[180px]", className)}>
        <Shimmer className="w-full h-full" />
      </div>
    );
  }

  if (variant === "row") {
    return (
      <div className={cn("glass-card flex items-center gap-3 p-3", className)}>
        <Shimmer className="w-10 h-10 rounded-[10px]" />
        <div className="flex-1 space-y-2">
          <Shimmer className="h-4 rounded w-3/4" />
          <Shimmer className="h-3 rounded w-1/2" />
        </div>
      </div>
    );
  }

  if (variant === "place") {
    return (
      <div className={cn("glass-card overflow-hidden w-[180px] shrink-0", className)}>
        <Shimmer className="w-full h-[120px]" />
        <div className="p-3 space-y-2">
          <Shimmer className="h-4 rounded w-3/4" />
          <Shimmer className="h-3 rounded w-1/2" />
        </div>
      </div>
    );
  }

  // portrait (default)
  return (
    <div className={cn("glass-card overflow-hidden", className)}>
      <Shimmer className="w-full h-[120px]" />
      <div className="p-3 space-y-2">
        <Shimmer className="h-4 rounded w-3/4" />
        <Shimmer className="h-3 rounded w-1/2" />
        <Shimmer className="h-3 rounded w-1/3" />
      </div>
    </div>
  );
}
