import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GiveMePlans",
  description: "Find events that match your interests",
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
