export const metadata = {
  title: 'ASAP - Zora Onramp',
  description: 'Fast and easy onramp to USDC on Base',
  openGraph: {
    title: 'ASAP - Zora Onramp',
    description: 'Fast and easy onramp to USDC on Base for Zora, Base app, and Wallet users',
    images: ['/og-image.png'],
  },
  other: {
    'fc:frame': 'vNext',
    'fc:frame:name': 'ASAP - Zora Onramp',
    'fc:frame:icon': '/icon.png',
    'fc:frame:splash': '/splash.png',
    'fc:frame:splash:background_color': '#3B82F6',
    'fc:frame:home_url': process.env.NEXT_PUBLIC_APP_URL || 'https://zora-onramp.vercel.app',
    'fc:frame:webhook_url': process.env.NEXT_PUBLIC_BACKEND_URL ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/farcaster/webhook` : 'https://zora-onramp-backend.onrender.com/api/farcaster/webhook',
  },
}
