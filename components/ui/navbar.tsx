'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useStockStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { LayoutDashboard, LogIn, LogOut, Search, Package, History, BarChart3, ShoppingCart, Users, RotateCcw, Settings, FileText } from 'lucide-react';
import type { MenuRouteKey } from '@/types';
import { effectiveMenuRoutes, pathnameMatchesRoute } from '@/lib/route-access';
import { logoutSession } from '@/lib/auth-actions';
import { useRouter } from 'next/navigation';

const iconByKey: Record<MenuRouteKey, typeof LayoutDashboard> = {
    ozet: LayoutDashboard,
    giris: LogIn,
    iade: RotateCcw,
    cikis: LogOut,
    satis: ShoppingCart,
    cari: Users,
    teklif: FileText,
    urunler: Package,
    hareketler: History,
    ara: Search,
    raporlar: BarChart3,
    ayarlar: Settings,
};

const routes: { href: string; label: string; key: MenuRouteKey }[] = [
    { href: '/', label: 'Özet', key: 'ozet' },
    { href: '/giris', label: 'Stok Giriş', key: 'giris' },
    { href: '/iade', label: 'İade', key: 'iade' },
    { href: '/cikis', label: 'Hızlı Çıkış', key: 'cikis' },
    { href: '/satis', label: 'Satış', key: 'satis' },
    { href: '/cari', label: 'Cari Takip', key: 'cari' },
    { href: '/teklif', label: 'Teklif', key: 'teklif' },
    { href: '/urunler', label: 'Ürün Listesi', key: 'urunler' },
    { href: '/hareketler', label: 'Hareketler', key: 'hareketler' },
    { href: '/ara', label: 'Stok Ara', key: 'ara' },
    { href: '/raporlar', label: 'Raporlar', key: 'raporlar' },
    { href: '/ayarlar', label: 'Ayarlar', key: 'ayarlar' },
];

export default function Navbar() {
    const pathname = usePathname();
    const user = useStockStore((state) => state.user);
    const logout = useStockStore((state) => state.logout);
    const router = useRouter();
    const handleLogout = async () => {
        try {
            await logoutSession();
        } finally {
            logout();
            router.replace('/login');
        }
    };
    const allowed = new Set(effectiveMenuRoutes(user));

    const visibleRoutes = routes.filter((r) => allowed.has(r.key));

    return (
        <nav className="border-b border-white/10 bg-zinc-950 sticky top-0 z-50 backdrop-blur-xl">
            <div className="container mx-auto px-4 min-h-16 py-2 flex items-center justify-between gap-3">
                <Link href="/" className="flex items-center gap-2 font-bold text-xl text-white tracking-tighter hover:opacity-80 transition-opacity">
                    <div className="bg-primary p-1.5 rounded-lg text-white">
                        <Package size={20} />
                    </div>
                    <span>URUNX</span>
                    <span className="hidden sm:inline font-normal text-zinc-500 text-sm border-l border-white/10 pl-2">
                        {user?.companyName === 'Demo Company' ? 'SPEEDSPOR' : (user?.companyName || 'SPEEDSPOR')}
                    </span>
                </Link>
                <div className="flex items-center gap-1 md:gap-2 flex-wrap justify-end gap-y-1">
                    {visibleRoutes.map((route) => {
                        const Icon = iconByKey[route.key];
                        const isActive = pathnameMatchesRoute(pathname, route.href);
                        return (
                            <Link
                                key={route.href}
                                href={route.href}
                                className={cn(
                                    "px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2",
                                    isActive
                                        ? "bg-white/10 text-white shadow-[0_0_10px_-5px_rgba(255,255,255,0.3)]"
                                        : "text-zinc-400 hover:text-white hover:bg-white/5"
                                )}
                            >
                                <Icon size={18} />
                                <span className="hidden md:inline">{route.label}</span>
                            </Link>
                        );
                    })}
                    {user ? (
                        <button
                            type="button"
                            onClick={handleLogout}
                            title="Oturumu kapat"
                            className="px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 text-zinc-500 hover:text-rose-300 hover:bg-white/5"
                        >
                            <LogOut size={18} />
                            <span className="hidden lg:inline">Çıkış</span>
                        </button>
                    ) : null}
                </div>
            </div>
        </nav>
    );
}
