import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { StockStore, StockItem, Transaction } from '@/types';
import { v4 as uuidv4 } from 'uuid';

export const useStockStore = create<StockStore>()(
    persist(
        (set, get) => ({
            items: [],
            user: null,
            isAuthenticated: false,
            addItem: (item) => set((state) => ({ items: [...state.items, item] })),
            updateItem: (id, updates) =>
                set((state) => ({
                    items: state.items.map((item) =>
                        item.id === id ? { ...item, ...updates, updatedAt: new Date().toISOString() } : item
                    ),
                })),
            removeItem: (id) =>
                set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
            addTransaction: (itemId, transaction) =>
                set((state) => ({
                    items: state.items.map((item) => {
                        if (item.id === itemId) {
                            const newQuantity =
                                transaction.type === 'IN'
                                    ? item.quantity + transaction.quantity
                                    : item.quantity - transaction.quantity;
                            return {
                                ...item,
                                quantity: newQuantity,
                                transactions: [transaction, ...item.transactions],
                                updatedAt: new Date().toISOString(),
                            };
                        }
                        return item;
                    }),
                })),
            getItemByBarcode: (barcode) => {
                return get().items.find((item) => item.barcode === barcode);
            },
            searchItems: (query) => {
                const lowerQuery = query.toLowerCase();
                return get().items.filter(
                    (item) =>
                        item.name.toLowerCase().includes(lowerQuery) ||
                        item.barcode.includes(lowerQuery) ||
                        item.brand?.toLowerCase().includes(lowerQuery) ||
                        item.stockCode?.toLowerCase().includes(lowerQuery)
                );
            },
            login: (user) => set({ user, isAuthenticated: true }),
            logout: () => set({ user: null, isAuthenticated: false }),
            setItems: (items) => set({ items }),
        }),
        {
            name: 'urunx-storage', // Rebranding storage name
            storage: createJSONStorage(() => localStorage),
        }
    )
);
