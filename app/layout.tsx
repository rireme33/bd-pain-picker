import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BD - Reddit Pain Gate",
  description: "Find explicit Reddit pain signals and copy clean WILL-ready inputs.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
