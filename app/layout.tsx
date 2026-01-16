import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/ui/navbar';
import AuthProvider from '@/components/auth-provider';
import DbSyncProvider from '@/components/db-sync-provider';
import { Toaster } from 'sonner';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'URUNX',
  description: 'Hızlı Stok Takip Sistemi',
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
