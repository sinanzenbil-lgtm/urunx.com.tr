import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/ui/navbar';
import AuthProvider from '@/components/auth-provider';
import DbSyncProvider from '@/components/db-sync-provider';
import { Toaster } from 'sonner';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'URUNX | SPEEDSPOR',
  description: 'Hızlı ve Profesyonel Stok Takip Sistemi',
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/icon.png',
  },
  openGraph: {
    title: 'URUNX | Stok Takip',
    description: 'SPEEDSPOR Hızlı Stok Takip Sistemi',
    images: [{ url: '/og-image.png' }],
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr" className="dark">
      <body className={inter.className}>
        <AuthProvider>
          <DbSyncProvider>
            <Navbar />
            <main className="container mx-auto p-4 md:p-8">
              {children}
            </main>
            <Toaster position="bottom-right" theme="dark" />
          </DbSyncProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
