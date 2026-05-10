import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "assets-produce",
  description: "Creator workspace for the assets-produce agent platform",
  // SSE streaming uses ?token=<jwt> in the URL because EventSource does not
  // support custom headers. no-referrer keeps the browser from sending that
  // URL via the Referer header on outbound clicks.
  referrer: "no-referrer",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
