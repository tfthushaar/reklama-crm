import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/forms";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Reklama CRM", template: "%s · Reklama CRM" },
  description: "Leads, screens, quotes, bookings and billing for Reklama Global.",
};

export const viewport: Viewport = {
  themeColor: "#0f2640",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body className="min-h-screen font-sans antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
