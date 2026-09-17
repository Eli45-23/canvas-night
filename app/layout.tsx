import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shop overtime canvas",
  description: "Overtime offers, staffing, and worker totals for your shop.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
