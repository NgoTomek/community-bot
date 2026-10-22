import { RefreshCw, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="card space-y-3 p-4" aria-hidden>
      <div className="flex items-center gap-3">
        <Skeleton className="size-8 rounded-full" />
        <Skeleton className="h-3 w-32" />
      </div>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={`h-3 ${i === lines - 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, body, action, compact = false }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center text-center ${compact ? "gap-2 px-4 py-6" : "gap-3 px-6 py-12"}`}>
      {icon ? <div className="text-faint">{icon}</div> : null}
      <p className={`font-medium ${compact ? "text-sm" : ""}`}>{title}</p>
      {body ? <div className="max-w-sm text-sm text-muted">{body}</div> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", message, onRetry }: { title?: string; message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="card flex flex-col gap-3 border-bad/30 bg-bad-soft p-4 sm:flex-row sm:items-center">
      <TriangleAlert size={20} className="shrink-0 text-bad" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted">{message}</p>
      </div>
      {onRetry ? (
        <button type="button" className="btn btn-sm" onClick={onRetry}>
          <RefreshCw size={14} aria-hidden /> Try again
        </button>
      ) : null}
    </div>
  );
}
