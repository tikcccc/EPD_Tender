import type { Metadata } from "next";
import { Noto_Sans_TC, Noto_Serif_TC } from "next/font/google";
import "./globals.css";

const notoSansTc = Noto_Sans_TC({
  variable: "--font-ui-family",
  weight: ["400", "500", "700"],
  display: "swap",
  fallback: ["PingFang TC", "Microsoft JhengHei", "sans-serif"],
});

const notoSerifTc = Noto_Serif_TC({
  variable: "--font-doc-family",
  weight: ["400", "600", "700"],
  display: "swap",
  fallback: ["Noto Serif CJK TC", "PMingLiU", "serif"],
});

export const metadata: Metadata = {
  title: "EPD Tender Workspace",
  description: "Tender analysis workspace for standards, evidence and report export.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${notoSansTc.variable} ${notoSerifTc.variable}`}>{children}</body>
    </html>
  );
}
