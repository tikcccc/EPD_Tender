import type { Metadata } from "next";
import { Noto_Sans_TC, Noto_Serif_TC, Source_Sans_3 } from "next/font/google";
import "./globals.css";

const sourceSans3 = Source_Sans_3({
  variable: "--font-ui-latin-family",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  fallback: ["Segoe UI", "Helvetica Neue", "Arial", "sans-serif"],
});

const notoSansTc = Noto_Sans_TC({
  variable: "--font-ui-cjk-family",
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
      <body className={`${sourceSans3.variable} ${notoSansTc.variable} ${notoSerifTc.variable}`}>{children}</body>
    </html>
  );
}
