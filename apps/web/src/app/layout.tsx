import type { Metadata } from "next";
import Script from "next/script";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/app-shell";

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono" });

export const metadata: Metadata = {
  // Absolute base for canonical and Open Graph URLs. Override with NEXT_PUBLIC_SITE_URL on a custom domain.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://web-two-pied-ft7sms1616.vercel.app"),
  title: "Coftra — on-chain tasks that finish themselves",
  openGraph: { siteName: "Coftra", type: "website" },
  description:
    "Fund a task, set its rules, and let Reactive Network release milestones, close out sessions and recover leftovers on verifiable on-chain events.",
};

// Applies the saved theme before first paint. Preference only; nothing authoritative lives in storage.
const themeScript = `try{var t=localStorage.getItem('coftra.theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      {/* next/script injects this outside React's hydrated tree. A raw <script> in <head> was hydrated by
          React, and wallet extensions (MetaMask, Meteor, …) that inject their own <head> scripts caused
          hydration mismatches. */}
      <body>
        <Script id="coftra-theme" strategy="beforeInteractive">
          {themeScript}
        </Script>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
