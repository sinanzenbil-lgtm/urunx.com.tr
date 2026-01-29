'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useStockStore } from '@/lib/store';

export default function AuthProvider({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const isAuthenticated = useStockStore((state) => state.isAuthenticated);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!mounted) return;

        const isAuthPage = pathname === '/login' || pathname === '/register';

        if (!isAuthenticated && !isAuthPage) {
            router.push('/login');
        } else if (isAuthenticated && isAuthPage) {
            router.push('/');
        }
    }, [isAuthenticated, pathname, router, mounted]);

    // Prevent flashing of content before redirect check
    if (!mounted) {
        return null; // Or a loading spinner
    }

    // Don't render children if not auth and not on auth page to prevent flash
    const isAuthPage = pathname === '/login' || pathname === '/register';
    if (!isAuthenticated && !isAuthPage) {
        return null;
    }

    return <>{children}</>;
}
