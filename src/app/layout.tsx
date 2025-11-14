import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ASAP - Zora Onramp",
  description: "Fast and easy onramp to USDC on Base for Zora, Base app, and Wallet users",
  icons: {
    icon: '/Form.png',
  },
  openGraph: {
    title: "ASAP - Zora Onramp",
    description: "Fast and easy onramp to USDC on Base for Zora, Base app, and Wallet users",
    images: ["/og-image.png"],
  },
  other: {
    "fc:frame": "vNext",
    "fc:frame:name": "ASAP - Zora Onramp",
    "fc:frame:icon": "/icon.png",
    "fc:frame:splash": "/splash.png",
    "fc:frame:splash:background_color": "#3B82F6",
    "fc:frame:home_url": process.env.NEXT_PUBLIC_APP_URL || "https://useasap.xyz",
    "fc:frame:webhook_url": process.env.NEXT_PUBLIC_BACKEND_URL 
      ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/farcaster/webhook`
      : "https://zora-onramp-backend.onrender.com/api/farcaster/webhook",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/api/farcaster-manifest" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
