import Link from "next/link";

export const dynamic = "force-static";

export const metadata = {
  title: "Offline",
};

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[520px] flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-bold">You&apos;re offline</h1>
      <p className="mt-3 text-muted">
        Pages you&apos;ve opened recently still work. Reconnect to approve or RSVP.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex min-h-12 items-center justify-center rounded-xl bg-brand px-5 font-semibold text-accent-fg shadow-[0_6px_20px_-8px_rgb(124_58_237/0.6)] transition-[scale] duration-150 active:scale-[0.97]"
      >
        Back to calendar
      </Link>
    </main>
  );
}
