const PHASES = [
  { id: "matching", label: "Match" },
  { id: "negotiating", label: "Negotiate" },
  { id: "compiling", label: "Deal" },
  { id: "pending_approval", label: "Responses" },
  { id: "confirmed", label: "Published" },
] as const;

function currentIndex(status: string | null): number {
  switch (status) {
    case "matching":
      return 0;
    case "negotiating":
      return 1;
    case "compiling":
      return 2;
    case "pending_approval":
    case "declined":
      return 3;
    case "confirmed":
      return 4;
    default:
      return -1;
  }
}

function phaseState(index: number, current: number, status: string | null): "done" | "current" | "todo" {
  if (status === "confirmed") return "done";
  if (current < 0) return "todo";
  if (index < current) return "done";
  if (index === current) return "current";
  return "todo";
}

export function PhaseTracker({ status }: { status: string | null }) {
  const current = currentIndex(status);
  return (
    <ol className="phases" aria-label="Run phase">
      {PHASES.map((phase, index) => {
        const state = phaseState(index, current, status);
        return (
          <li key={phase.label} className={state} aria-current={state === "current" ? "step" : undefined}>
            {phase.label}
          </li>
        );
      })}
    </ol>
  );
}
