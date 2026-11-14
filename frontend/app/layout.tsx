import type { Metadata, Viewport } from "next";
import { Inter, Manrope } from "next/font/google";

import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { Providers } from "@/components/providers";
import { ServiceWorkerRegistration } from "@/components/pwa";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "Findora Spaces — Find a space, or let us find it for you",
    template: "%s · Findora Spaces",
  },
  description:
    "Honest rental discovery and assisted property finding in Kenya. Browse approved, freshly confirmed homes and commercial spaces, or ask a local Findora team to help.",
  applicationName: "Findora Spaces",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Findora Spaces",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "Findora Spaces",
    description:
      "Find a rental yourself, or let a verified local team help. Transparent rent, real availability and a Property Passport for every listing.",
    type: "website",
    locale: "en_KE",
    siteName: "Findora Spaces",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0E403B",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-KE" className={`${inter.variable} ${manrope.variable}`}>
      <body className="min-h-screen bg-ivory-50 font-sans text-ink-800 antialiased">
        <Providers>
          <a href="#main-content" className="skip-link">
            Skip to main content
          </a>
          <Header />
          <main id="main-content" className="min-h-[60vh]">
            {children}
          </main>
          <Footer />
          <ServiceWorkerRegistration />
        </Providers>
      </body>
    </html>
  );
}
