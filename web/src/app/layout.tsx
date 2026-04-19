import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Shell } from "@/components/Shell";
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
  title: "UPPCL Pro",
  description:
    "Power-user analytics for UPPCL SMART prepaid meters. Live balance, runway forecast, anomaly detection, Day × Hour heatmap.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable} dark`}>
      <body className="antialiased">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
