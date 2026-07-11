import type { Metadata } from "next";

import { DesktopShell } from "./DesktopShell";

export const metadata: Metadata = {
  title: "MCOP Desktop",
  description:
    "Native motion-glass product shell for Dialectical Studio, the cinematic showcase, and the offline MCOP triad.",
  robots: { index: false, follow: false },
};

export default function DesktopPage() {
  return <DesktopShell />;
}
