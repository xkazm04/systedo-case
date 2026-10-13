import type { Metadata } from "next";
import "./prototypes.css";

export const metadata: Metadata = {
  title: "Landing explorations",
  robots: { index: false, follow: false },
};

export default function PrototypeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
