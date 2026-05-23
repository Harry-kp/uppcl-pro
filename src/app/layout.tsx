import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Shell } from "@/components/Shell";
import { I18nProvider } from "@/components/I18nProvider";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans-loaded",
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-loaded",
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "UPPCL Pro — Kinetic Vault",
    template: "%s | UPPCL Pro",
  },
  description:
    "Analytics dashboard for UPPCL SMART prepaid electricity meters. Live balance, runway forecast, anomaly detection, recharge planner, 1912 complaint tracking.",
  keywords: [
    "UPPCL", "SMART", "prepaid meter", "electricity", "dashboard",
    "PVVNL", "MVVNL", "PuVVNL", "DVVNL", "KESCo",
    "balance", "runway", "consumption", "analytics",
  ],
  authors: [{ name: "Harry KP", url: "https://github.com/Harry-kp" }],
  openGraph: {
    title: "UPPCL Pro — Kinetic Vault",
    description: "Analytics dashboard for UPPCL SMART prepaid electricity meters. Live balance, runway forecast, anomaly detection.",
    url: "https://github.com/Harry-kp/uppcl-pro",
    siteName: "UPPCL Pro",
    type: "website",
    images: [
      {
        url: "https://harry-kp.github.io/uppcl-pro/screenshots/home-dark.png",
        width: 1920,
        height: 1080,
        alt: "UPPCL Pro dashboard",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "UPPCL Pro — Kinetic Vault",
    description: "Analytics dashboard for UPPCL SMART prepaid meters.",
    images: ["https://harry-kp.github.io/uppcl-pro/screenshots/home-dark.png"],
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
  manifest: "/manifest.json",
  metadataBase: new URL("https://uppcl-pro.vercel.app"),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable} dark`}>
      <body className="antialiased">
        <I18nProvider>
          <Shell>{children}</Shell>
        </I18nProvider>
      </body>
    </html>
  );
}
