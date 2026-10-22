import type { Metadata } from "next";
import { DirectionProvider } from "@/components/direction-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "יועץ הרכב – שטראוס",
  description: "מה יקרה לנטו שלי אם אחליף או אוותר על רכב החברה?",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="he" dir="rtl" className="h-full antialiased">
      <head>
        {/* Heebo (docs/DESIGN.md). Loaded by the browser, so a build without network still works (system fallback). */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700&display=swap" />
      </head>
      <body className="min-h-full flex flex-col">
        <DirectionProvider>{children}</DirectionProvider>
      </body>
    </html>
  );
}
