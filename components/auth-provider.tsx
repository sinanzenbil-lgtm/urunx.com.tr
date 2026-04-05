'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useStockStore } from '@/lib/store';
import { canAccessPath, firstAllowedPath } from '@/lib/route-access';

export default function AuthProvider({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const isAuthenticated = useStockStore((state) => state.isAuthenticated);
    const user = useStockStore((state) => state.user);
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

    useEffect(() => {
        if (!mounted || !isAuthenticated || !user) return;
        const isAuthPage = pathname === '/login' || pathname === '/register';
        if (isAuthPage) return;
        if (!canAccessPath(user, pathname)) {
            router.replace(firstAllowedPath(user));
        }
    }, [mounted, isAuthenticated, user, pathname, router]);

    if (!mounted) {
        return null;
    }

    const isAuthPage = pathname === '/login' || pathname === '/register';
    if (!isAuthenticated && !isAuthPage) {
        return null;
    }

    return <>{children}</>;
}
