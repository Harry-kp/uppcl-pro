import type { Metadata } from "next";

export const metadata: Metadata = { title: "Usage Analytics" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
