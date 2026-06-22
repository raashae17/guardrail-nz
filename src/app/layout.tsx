import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Guardrail NZ",
  description: "Cash health for NZ SMBs",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
