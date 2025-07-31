"use client"

import { cn } from "@/lib/utils"

interface SimpleProgressProps {
  value?: number;
  className?: string;
}

export function SimpleProgress({ value = 0, className }: SimpleProgressProps) {
  return (
    <div
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-primary/20",
        className
      )}
    >
      <div
        className="h-full bg-primary transition-all"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}