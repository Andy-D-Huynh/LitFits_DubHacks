import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Fraunces, DM_Sans } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const display = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
});

const body = DM_Sans({
  subsets: ['latin'],
  variable: '--font-body',
});

export const metadata: Metadata = {
  title: 'FitMirror',
  description: 'See which size fits you, and how it looks on you.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
