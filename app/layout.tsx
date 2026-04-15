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
  title: "Openworld Paris — Discover the City Like a Local",
  description:
    "Real-time event and place discovery hyper-focused on Paris. Find apéros, jazz nights, marchés, hidden cafés and more — always live.",
  keywords: ["Paris events", "Paris nightlife", "Paris café", "Paris marché", "what to do in Paris"],
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
