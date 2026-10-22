import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { copyText } from "../lib/share";

export function CopyButton({
  text,
  label = "Copy",
  copiedLabel = "Copied",
  className = "btn btn-sm",
  icon = true,
  onCopied,
}: {
  text: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
  icon?: boolean;
  onCopied?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        if (await copyText(text)) {
          setCopied(true);
          onCopied?.();
          setTimeout(() => setCopied(false), 1600);
        }
      }}
    >
      {icon ? copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden /> : null}
      <span aria-live="polite">{copied ? copiedLabel : label}</span>
    </button>
  );
}
