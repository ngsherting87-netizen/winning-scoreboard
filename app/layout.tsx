import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://ngsherting87-netizen.github.io/winning-scoreboard/'),
  title: 'Winning Scoreboard｜代理活动量管理',
  description: '代理每日行动、自动计分与 AD Serene 管理员总览。',
  openGraph: {
    title: 'Winning Scoreboard｜代理活动量管理计分板',
    description: '代理每日行动、自动计分与 AD Serene 管理员总览。',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Winning Scoreboard 代理活动量管理计分板' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Winning Scoreboard｜代理活动量管理计分板',
    description: '代理每日行动、自动计分与 AD Serene 管理员总览。',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hans">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
