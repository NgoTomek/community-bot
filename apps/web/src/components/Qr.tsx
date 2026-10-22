import { QRCodeSVG } from "qrcode.react";

/** Always dark on white so phones can scan it in either theme. */
export function Qr({ value, size = 112, label }: { value: string; size?: number; label?: string }) {
  return (
    <figure className="inline-flex flex-col items-center gap-2">
      <span className="rounded-lg bg-white p-2 ring-1 ring-line">
        <QRCodeSVG value={value} size={size} bgColor="#ffffff" fgColor="#111216" level="M" title={label ?? value} />
      </span>
      {label ? <figcaption className="text-xs text-muted">{label}</figcaption> : null}
    </figure>
  );
}
