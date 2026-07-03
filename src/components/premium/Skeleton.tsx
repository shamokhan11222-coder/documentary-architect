import * as React from "react";
import { cn } from "@/lib/utils";
import { radius, type Radius } from "./tokens";

export interface PSkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  rounded?: Radius;
}

/** Shimmering skeleton placeholder. */
export function PSkeleton({ className, rounded = "sm", ...props }: PSkeletonProps) {
  return <div className={cn("shimmer", radius[rounded], className)} {...props} />;
}

/** Ready-made card skeleton composed from the base skeleton. */
export function PSkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-card", className)}>
      <PSkeleton className="h-32 w-full" rounded="md" />
      <PSkeleton className="h-4 w-2/3" />
      <PSkeleton className="h-4 w-1/2" />
      <div className="flex gap-2">
        <PSkeleton className="h-8 w-20" rounded="md" />
        <PSkeleton className="h-8 w-20" rounded="md" />
      </div>
    </div>
  );
}
