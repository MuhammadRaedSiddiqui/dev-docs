// app/layout.tsx
// Root layout — applies to every route in the application.
// Wires the Lora + Inter fonts (self-hosted via next/font, no CDN),
// loads global CSS, and sets the base HTML metadata.
import type { Metadata, Viewport } from "next";
import { ClerkProvider } from '@clerk/nextjs';
import { TRPCProvider } from '@/components/providers/trpc-provider';
import { ToastProvider } from '@/lib/toast';
import { ToastStack } from '@/components/ui/ToastStack';
import "@/app/globals.css";

export const metadata: Metadata = {
  title: {
    default:  "DevDocs AI — Pre-build planning for developers",
    template: "%s | DevDocs AI",
  },
  description:
    "Interview with AI before you write a line of code. Generate a project-specific documentation bundle for your coding workflow.",
  keywords: ["AI", "developer tools", "documentation", "planning", "Next.js", "Claude"],
  authors:  [{ name: "DevDocs AI" }],
  creator:  "DevDocs AI",
  openGraph: {
    type:        "website",
    locale:      "en_US",
    url:         "https://devdocs.ai",
    siteName:    "DevDocs AI",
    title:       "DevDocs AI — Pre-build planning for developers",
    description: "Interview with AI before you write a line of code.",
  },
  twitter: {
    card:    "summary_large_image",
    title:   "DevDocs AI",
    creator: "@devdocsai",
  },
  robots: {
    index:  true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width:        "device-width",
  initialScale: 1,
  themeColor:   "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // NOTE: Clerk CDN script versions are pinned via NEXT_PUBLIC_CLERK_JS_VERSION /
    // NEXT_PUBLIC_CLERK_UI_VERSION (see .env.local). The loader otherwise requests
    // unpinned aliases (@clerk/clerk-js@6, @clerk/ui@1), which the Clerk CDN
    // 307-redirects — and browsers refuse redirects on CORS preflights, breaking
    // sign-in with "Failed to load Clerk JS".
    <ClerkProvider>
      <TRPCProvider>
        <html lang="en">
          <body className="font-sans antialiased bg-vellum text-ink">
            <ToastProvider>
              {children}
              <ToastStack />
            </ToastProvider>
          </body>
        </html>
      </TRPCProvider>
    </ClerkProvider>
  );
}
