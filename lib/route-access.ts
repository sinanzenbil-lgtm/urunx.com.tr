import type { MenuRouteKey, User } from '@/types';
import { ALL_MENU_KEYS, LATER_ADDED_MENU_KEYS } from '@/types';

/**
 * Kullanıcının etkin menü listesi. Boş liste = tüm menüler; yeni menüler eklenmeden
 * önceki tüm menülere sahip (tam yetkili) hesaplar da tüm menüleri görür.
 */
export function effectiveMenuRoutes(user: User | null): MenuRouteKey[] {
  const routes = user?.menuRoutes;
  if (!routes || routes.length === 0) return ALL_MENU_KEYS;
  const legacyAll = ALL_MENU_KEYS.filter((k) => !LATER_ADDED_MENU_KEYS.includes(k));
  if (legacyAll.every((k) => routes.includes(k))) return ALL_MENU_KEYS;
  return routes;
}

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
    teklif: 'teklif',
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
    teklif: '/teklif',
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
  const routes = effectiveMenuRoutes(user);
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
  return effectiveMenuRoutes(user).includes(key);
}
