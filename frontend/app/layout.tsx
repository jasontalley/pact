import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '@/styles/globals.css';
import { Providers } from './providers';
import { Toaster } from 'sonner';
import { GlobalComponents } from '@/components/GlobalComponents';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Pact - Intent Atom Management',
  description: 'Capture, refine, and manage product intent with AI-assisted workflows',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>
          {children}
          <GlobalComponents />
          <Toaster position="bottom-right" />
        </Providers>
      </body>
    </html>
  );
}
