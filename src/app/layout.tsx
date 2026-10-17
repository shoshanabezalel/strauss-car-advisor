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
      <body className="min-h-full flex flex-col">
        <DirectionProvider>{children}</DirectionProvider>
      </body>
    </html>
  );
}
