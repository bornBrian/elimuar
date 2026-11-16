import type { Metadata, Viewport } from "next";
import { NavProgress } from "@/components/NavProgress";
import { Toaster } from "@/components/toast";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "ElimuAR Portal", template: "%s · ElimuAR" },
  description:
    "ElimuAR — augmented-reality ICT practicals for Tanzanian secondary schools. Staff portal for teachers, school heads and administrators.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#163A70",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preload" href="/fonts/inter-latin-var.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/plex-mono-400.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body>
        <NavProgress />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
