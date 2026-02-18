export type TransactionType = 'IN' | 'OUT';
export type TransactionKind = 'NORMAL' | 'RETURN';

export interface Customer {
    id: string;
    customerCode?: string;
    name: string;
    createdAt?: string;
    salesTotal?: number;
    paymentTotal?: number;
    balance?: number; // satış - tahsilat
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
    method: PaymentMethod;
    description?: string;
    createdAt?: string;
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

export interface User {
    email: string;
    companyName: string;
}

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
