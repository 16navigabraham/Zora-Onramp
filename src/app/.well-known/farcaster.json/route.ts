import { NextResponse } from 'next/server';

export async function GET() {
  const manifest = {
    accountAssociation: {
      header: process.env.NEXT_PUBLIC_FARCASTER_ACCOUNT_HEADER || "",
      payload: process.env.NEXT_PUBLIC_FARCASTER_ACCOUNT_PAYLOAD || "",
      signature: process.env.NEXT_PUBLIC_FARCASTER_ACCOUNT_SIGNATURE || "",
    },
    frame: {
      version: "next",
      name: "ASAP - Zora Onramp",
      iconUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://useasap.xyz'}/icon.png`,
      splashImageUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://useasap.xyz'}/splash.png`,
      splashBackgroundColor: "#3B82F6",
      homeUrl: process.env.NEXT_PUBLIC_APP_URL || "https://useasap.xyz",
      webhookUrl: process.env.NEXT_PUBLIC_BACKEND_URL 
        ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/farcaster/webhook`
        : "https://zora-onramp-backend.onrender.com/api/farcaster/webhook",
    },
    miniApp: {
      name: "ASAP - Zora Onramp",
      description: "Fast and easy onramp to USDC on Base for Zora, Base app, and Wallet users",
      url: process.env.NEXT_PUBLIC_APP_URL || "https://useasap.xyz",
    }
  };

  return NextResponse.json(manifest);
}
