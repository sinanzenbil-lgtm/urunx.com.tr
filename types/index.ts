export type TransactionType = 'IN' | 'OUT';
export type TransactionKind = 'NORMAL' | 'RETURN' | 'OPENING';

export interface Customer {
    id: string;
    customerCode?: string;
    name: string;
    createdAt?: string;
    openingBalance?: number;   // + alacak açılışı, - borç açılışı
    openingBalanceDate?: string;
    // Yeni borç/alacak kurgusu
    creditTotal?: number;      // toplam satış - satış iade (alacak doğuran)
    collectionTotal?: number;  // toplam tahsilat
    creditBalance?: number;    // kalan alacak = creditTotal - collectionTotal
    debtTotal?: number;        // toplam alış (borç doğuran)
    paymentTotal?: number;     // toplam ödeme
    debtBalance?: number;      // kalan borç = debtTotal - paymentTotal
    // Eski alanlar (geriye dönük): bazı ekranlar sadece var olmasını bekleyebilir
    salesTotal?: number;
    balance?: number;
}

export interface Transaction {
    id: string;
    date: string; // ISO string
    type: TransactionType;
    kind?: TransactionKind;
    quantity: number;
    channel?: 'Pazaryeri' | 'Perakende' | 'Toptan';
    unitPrice?: number;   // gerçekleşen birim satış fiyatı (OUT için)
    totalPrice?: number;  // gerçekleşen toplam tutar (OUT için) => unitPrice * quantity
    customerId?: string;
    customerName?: string;
    customerCode?: string;
}

export type PaymentMethod = 'Banka' | 'Nakit' | 'Diğer';

export interface CustomerPayment {
    id: string;
    customerId: string;
    date: string;
    amount: number;
    direction?: 'IN' | 'OUT'; // IN=tahsilat, OUT=ödeme
    method: PaymentMethod;
    description?: string;
    createdAt?: string;
}

export interface CompanySettings {
    companyName: string;
    tradeName: string;
    address: string;
    phone: string;
    email: string;
    logo?: string;
    stockInterestMonthlyRate?: number; // Aylık faiz oranı (%)
    updatedAt?: string;
}

export interface StockItem {
    id: string;
    barcode: string;
    stockCode?: string;
    name: string;
    image?: string;
    description?: string;
    brand?: string;
    vatRate: number;
    buyPrice: number;
    sellPrice: number;
    quantity: number;
    transactions: Transaction[];
    createdAt: string;
    updatedAt: string;
}

/** Navbar / yetki anahtarları (URL segment ile eşleşir) */
export type MenuRouteKey =
    | 'ozet'
    | 'giris'
    | 'iade'
    | 'cikis'
    | 'satis'
    | 'cari'
    | 'urunler'
    | 'hareketler'
    | 'ara'
    | 'raporlar'
    | 'ayarlar';

export const ALL_MENU_KEYS: MenuRouteKey[] = [
    'ozet',
    'giris',
    'iade',
    'cikis',
    'satis',
    'cari',
    'urunler',
    'hareketler',
    'ara',
    'raporlar',
    'ayarlar',
];

export const MENU_ROUTE_OPTIONS: { key: MenuRouteKey; label: string }[] = [
    { key: 'ozet', label: 'Özet' },
    { key: 'giris', label: 'Stok Giriş' },
    { key: 'iade', label: 'İade' },
    { key: 'cikis', label: 'Hızlı Çıkış' },
    { key: 'satis', label: 'Satış' },
    { key: 'cari', label: 'Cari Takip' },
    { key: 'urunler', label: 'Ürün Listesi' },
    { key: 'hareketler', label: 'Hareketler' },
    { key: 'ara', label: 'Stok Ara' },
    { key: 'raporlar', label: 'Raporlar' },
    { key: 'ayarlar', label: 'Ayarlar' },
];

export interface User {
    id?: string;
    email?: string;
    username?: string;
    firstName?: string;
    lastName?: string;
    companyName: string;
    /** Tanımlı değil veya boş: tüm menüler (eski oturumlar) */
    menuRoutes?: MenuRouteKey[];
    salesPerakende?: boolean;
    salesToptan?: boolean;
}

export type MemberPublic = {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    menuRoutes: MenuRouteKey[];
    salesPerakende: boolean;
    salesToptan: boolean;
};

export interface StockStore {
    items: StockItem[];
    user: User | null;
    isAuthenticated: boolean;
    dbSyncStatus: 'idle' | 'syncing' | 'synced' | 'error';
    addItem: (item: StockItem) => void;
    updateItem: (id: string, updates: Partial<StockItem>) => void;
    removeItem: (id: string) => void;
    addTransaction: (itemId: string, transaction: Transaction) => void;
    getItemByBarcode: (barcode: string) => StockItem | undefined;
    searchItems: (query: string) => StockItem[];
    login: (user: User) => void;
    logout: () => void;
    setItems: (items: StockItem[]) => void;
    setDbSyncStatus: (status: StockStore['dbSyncStatus']) => void;
    removeTransactions: (ids: string[]) => void;
}
