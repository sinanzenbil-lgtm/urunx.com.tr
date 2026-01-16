export type TransactionType = 'IN' | 'OUT';

export interface Transaction {
    id: string;
    date: string; // ISO string
    type: TransactionType;
    quantity: number;
    channel?: 'Pazaryeri' | 'Perakende' | 'Toptan';
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
    addItem: (item: StockItem) => void;
    updateItem: (id: string, updates: Partial<StockItem>) => void;
    removeItem: (id: string) => void;
    addTransaction: (itemId: string, transaction: Transaction) => void;
    getItemByBarcode: (barcode: string) => StockItem | undefined;
    searchItems: (query: string) => StockItem[];
    login: (user: User) => void;
    logout: () => void;
    setItems: (items: StockItem[]) => void;
    removeTransactions: (ids: string[]) => void;
}
