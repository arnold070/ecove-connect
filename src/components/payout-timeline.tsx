import { Check, Clock, X, Loader2, AlertTriangle } from "lucide-react";

export type PayoutStatus =
  | "requested"
  | "approved"
  | "processing"
  | "paid"
  | "failed"
  | "rejected"
  | "cancelled";

const STEPS: Array<{ id: PayoutStatus; label: string }> = [
  { id: "requested", label: "Requested" },
  { id: "approved", label: "Approved" },
  { id: "processing", label: "Processing" },
  { id: "paid", label: "Paid" },
];

const TERMINAL_ERRORS: PayoutStatus[] = ["failed", "rejected", "cancelled"];

interface Props {
  status: PayoutStatus;
  updatedAt?: string | null;
  createdAt?: string | null;
  processedAt?: string | null;
  failureReason?: string | null;
  reference?: string | null;
  compact?: boolean;
}

function fmt(ts?: string | null): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

export function PayoutStatusTimeline({
  status,
  updatedAt,
  createdAt,
  processedAt,
  failureReason,
  reference,
  compact = false,
}: Props) {
  const isError = TERMINAL_ERRORS.includes(status);
  const currentIdx = STEPS.findIndex((s) => s.id === status);
  const reachedIdx = isError ? STEPS.findIndex((s) => s.id === "approved") : currentIdx;

  const lastUpdated = processedAt ?? updatedAt ?? createdAt;

  return (
    <div className={compact ? "text-xs" : "text-sm"}>
      <ol className="flex items-center gap-2">
        {STEPS.map((step, idx) => {
          const reached = idx <= reachedIdx;
          const active = idx === currentIdx && !isError;
          return (
            <li key={step.id} className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition ${
                  reached
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground"
                } ${active ? "ring-2 ring-primary/30" : ""}`}
              >
                {active ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : reached ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <Clock className="h-3 w-3" />
                )}
              </span>
              <span
                className={`whitespace-nowrap ${reached ? "font-medium text-foreground" : "text-muted-foreground"}`}
              >
                {step.label}
              </span>
              {idx < STEPS.length - 1 && (
                <span className={`h-px w-6 ${idx < reachedIdx ? "bg-primary" : "bg-border"}`} />
              )}
            </li>
          );
        })}
        {isError && (
          <li className="ml-2 flex items-center gap-2 text-destructive">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground">
              {status === "cancelled" ? <X className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
            </span>
            <span className="font-medium capitalize">{status}</span>
          </li>
        )}
      </ol>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span>Last updated: <span className="font-mono">{fmt(lastUpdated)}</span></span>
        {reference && <span>Ref: <span className="font-mono">{reference}</span></span>}
        {failureReason && isError && (
          <span className="text-destructive">Reason: {failureReason}</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Refund request status (buyer-visible)
// ---------------------------------------------------------------------------
export type RefundStatus =
  | "requested"
  | "approved"
  | "refunded"
  | "rejected"
  | "cancelled";

const REFUND_STEPS: Array<{ id: RefundStatus; label: string }> = [
  { id: "requested", label: "Requested" },
  { id: "approved", label: "Approved" },
  { id: "refunded", label: "Refunded" },
];
const REFUND_ERRORS: RefundStatus[] = ["rejected", "cancelled"];

interface RefundProps {
  status: RefundStatus;
  createdAt?: string | null;
  updatedAt?: string | null;
  processedAt?: string | null;
  adminNote?: string | null;
  compact?: boolean;
}

export function RefundStatusTimeline({
  status,
  createdAt,
  updatedAt,
  processedAt,
  adminNote,
  compact = true,
}: RefundProps) {
  const isError = REFUND_ERRORS.includes(status);
  const currentIdx = REFUND_STEPS.findIndex((s) => s.id === status);
  const reachedIdx = isError ? REFUND_STEPS.findIndex((s) => s.id === "approved") - 1 : currentIdx;
  const lastUpdated = processedAt ?? updatedAt ?? createdAt;
  return (
    <div className={compact ? "text-xs" : "text-sm"}>
      <ol className="flex items-center gap-2">
        {REFUND_STEPS.map((step, idx) => {
          const reached = idx <= reachedIdx;
          const active = idx === currentIdx && !isError;
          return (
            <li key={step.id} className="flex items-center gap-2">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                  reached
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground"
                } ${active ? "ring-2 ring-primary/30" : ""}`}
              >
                {active ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : reached ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <Clock className="h-3 w-3" />
                )}
              </span>
              <span className={`whitespace-nowrap ${reached ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                {step.label}
              </span>
              {idx < REFUND_STEPS.length - 1 && (
                <span className={`h-px w-5 ${idx < reachedIdx ? "bg-primary" : "bg-border"}`} />
              )}
            </li>
          );
        })}
        {isError && (
          <li className="ml-2 flex items-center gap-2 text-destructive">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground">
              {status === "cancelled" ? <X className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
            </span>
            <span className="font-medium capitalize">{status}</span>
          </li>
        )}
      </ol>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span>Last updated: <span className="font-mono">{fmt(lastUpdated)}</span></span>
        {adminNote && <span>Note: {adminNote}</span>}
      </div>
    </div>
  );
}

