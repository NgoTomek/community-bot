"use client";

import { useEffect, useState } from "react";
import { QrCode, X } from "lucide-react";
import QRCode from "qrcode";
import { btn } from "./ui";

/** Big QR code of the public event link, for the audience to scan and RSVP. */
export function EventQr({ url }: { url: string }) {
  const [open, setOpen] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (open && !src) QRCode.toDataURL(url, { margin: 1, width: 640 }).then(setSrc).catch(() => {});
  }, [open, src, url]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={btn.small}>
        <QrCode aria-hidden className="size-4" /> QR code
      </button>
      {open && (
        <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" role="dialog" aria-modal="true" aria-label="QR code" onClick={() => setOpen(false)}>
          <div className="pop w-full max-w-sm rounded-3xl bg-white p-6 text-center text-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {src ? <img src={src} alt={`QR code for ${url}`} className="mx-auto w-full" /> : <div className="aspect-square" />}
            <p className="mt-3 break-all text-sm font-medium">{url}</p>
            <button type="button" aria-label="Close" className="mx-auto mt-3 flex size-11 items-center justify-center rounded-full hover:bg-black/5">
              <X aria-hidden className="size-5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
