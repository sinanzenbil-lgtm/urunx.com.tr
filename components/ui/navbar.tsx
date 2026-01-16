'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useStockStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { LayoutDashboard, LogIn, LogOut, Search, Package, History } from 'lucide-react';

export default function Navbar() {
    const pathname = usePathname();

    const routes = [
        {
            href: '/',
            label: 'Özet',
            icon: LayoutDashboard,
        },
        {
            href: '/giris',
            label: 'Stok Giriş',
            icon: LogIn,
        },
        {
            href: '/cikis',
            label: 'Hızlı Çıkış',
            icon: LogOut,
        },
        {
            href: '/urunler',
            label: 'Ürün Listesi',
            icon: Package,
        },
        {
            href: '/hareketler',
            label: 'Hareketler',
            icon: History,
        },
        {
            href: '/ara',
            label: 'Stok Ara',
            icon: Search,
        },
    ];

    const user = useStockStore((state) => state.user);

    return (
        <nav className="border-b border-white/10 bg-zinc-950 sticky top-0 z-50 backdrop-blur-xl">
            <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                <Link href="/" className="flex items-center gap-2 font-bold text-xl text-white tracking-tighter hover:opacity-80 transition-opacity">
                    <div className="bg-primary p-1.5 rounded-lg text-white">
                        <Package size={20} />
                    </div>
                    <span>URUNX</span>
                    <span className="hidden sm:inline font-normal text-zinc-500 text-sm border-l border-white/10 pl-2">
                        {user?.companyName === 'Demo Company' ? 'SPEEDSPOR' : (user?.companyName || 'SPEEDSPOR')}
                    </span>
                </Link>
                <div className="flex items-center gap-1 md:gap-2">
                    {routes.map((route) => {
                        const Icon = route.icon;
                        const isActive = pathname === route.href;
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
                </div>
            </div>
        </nav>
    );
}
