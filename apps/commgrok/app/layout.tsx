import type { Metadata, Viewport } from "next";
import "./globals.css";
import { APP_NAME, CALENDAR_DESCRIPTION, CALENDAR_NAME } from "@/lib/config";
import { Toaster } from "@/components/Toaster";
import { SwRegister } from "@/components/SwRegister";

export const metadata: Metadata = {
  title: { default: `${CALENDAR_NAME} · ${APP_NAME}`, template: `%s · ${APP_NAME}` },
  description: CALENDAR_DESCRIPTION,
  applicationName: APP_NAME,
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  other: { "mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0a10" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body className="min-h-dvh">
        {children}
        <Toaster />
        <SwRegister />
      </body>
    </html>
  );
}
