import type { MenuRouteKey, User } from '@/types';
import { ALL_MENU_KEYS } from '@/types';

/** Path → menü yetki anahtarı (alt sayfalar üst menüyle aynı yetki) */
export function pathToMenuKey(pathname: string): MenuRouteKey | null {
  const p = pathname.split('?')[0] || '/';
  if (p === '/' || p === '') return 'ozet';
  const seg = p.split('/').filter(Boolean)[0];
  const map: Record<string, MenuRouteKey> = {
    giris: 'giris',
    iade: 'iade',
    cikis: 'cikis',
    satis: 'satis',
    cari: 'cari',
    urunler: 'urunler',
    hareketler: 'hareketler',
    ara: 'ara',
    raporlar: 'raporlar',
    ayarlar: 'ayarlar',
  };
  return map[seg] ?? null;
}

export function hrefForMenuKey(key: MenuRouteKey): string {
  const map: Record<MenuRouteKey, string> = {
    ozet: '/',
    giris: '/giris',
    iade: '/iade',
    cikis: '/cikis',
    satis: '/satis',
    cari: '/cari',
    urunler: '/urunler',
    hareketler: '/hareketler',
    ara: '/ara',
    raporlar: '/raporlar',
    ayarlar: '/ayarlar',
  };
  return map[key];
}

/** İlk erişilebilir menü URL’si (yetkisiz sayfadan yönlendirme) */
export function firstAllowedPath(user: User | null): string {
  if (!user) return '/';
  const routes = user.menuRoutes?.length ? user.menuRoutes : ALL_MENU_KEYS;
  for (const key of ALL_MENU_KEYS) {
    if (routes.includes(key)) return hrefForMenuKey(key);
  }
  return '/';
}

export function pathnameMatchesRoute(pathname: string, href: string): boolean {
  const p = pathname.split('?')[0] || '/';
  if (href === '/') return p === '/' || p === '';
  return p === href || p.startsWith(`${href}/`);
}

export function canAccessPath(user: User | null, pathname: string): boolean {
  if (!user) return false;
  if (pathname === '/login' || pathname === '/register') return true;
  const key = pathToMenuKey(pathname);
  if (!key) return true;
  const routes = user.menuRoutes;
  if (!routes || routes.length === 0) return true;
  return routes.includes(key);
}
