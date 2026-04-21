import type { Metadata, Viewport } from "next";
import { LanguageProvider } from "@/components/LanguageProvider";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { AbortErrorSuppressor } from "@/components/AbortErrorSuppressor";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0d0d12",
};

export const metadata: Metadata = {
  title: "Openworld — Live events & places near you",
  description:
    "Map-based discovery for events and cafés around your real location—always live, wherever you are.",
  keywords: ["events near me", "places near me", "local events", "map discovery", "Openworld"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased min-h-dvh text-[var(--text-primary)]">
        <AbortErrorSuppressor />
        <QueryProvider>
          <LanguageProvider>
            {children}
          </LanguageProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
