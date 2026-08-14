'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Product, Category, Customer } from '@/app/types';
import {
  getProducts,
  getCategories,
  saveProducts,
  saveCategories,
  putProduct,
  getProduct,
  deleteProductLocal,
  addToSyncQueue,
  getCustomers,
  saveCustomers,
  putCustomer,
} from './offlineDB';

// ── Helpers ───────────────────────────────────────────────────────────────────

function uuid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ── Hook return type ──────────────────────────────────────────────────────────

export interface OfflineDataResult {
  products: Product[];
  categories: Category[];
  customers: Customer[];
  isLoading: boolean;
  loadError: string | null;
  isOfflineLoad: boolean;      // true when data came from IndexedDB (not API)
  loadData: () => Promise<void>;
  handleAddProduct:           (p: Omit<Product, 'id'>) => Promise<void>;
  handleUpdateProductPrice:   (id: string, price: number) => Promise<void>;
  handleUpdateProductDetails: (id: string, fields: Partial<Product>) => Promise<void>;
  handleDeleteProduct:        (id: string) => Promise<void>;
  handleResetToDefault:       () => Promise<void>;
}

/**
 * Unified data layer for products/categories/customers.
 * - Online  → fetches from API, caches to IndexedDB
 * - Offline → loads from IndexedDB, queues mutations for sync
 *
 * Uses navigator.onLine directly so it stays correct in stale closures.
 */
export function useOfflineData(): OfflineDataResult {
  const [products,      setProducts]      = useState<Product[]>([]);
  const [categories,    setCategories]    = useState<Category[]>([]);
  const [customers,     setCustomers]     = useState<Customer[]>([]);
  const [isLoading,     setIsLoading]     = useState(true);
  const [loadError,     setLoadError]     = useState<string | null>(null);
  const [isOfflineLoad, setIsOfflineLoad] = useState(false);

  // ── loadData ─────────────────────────────────────────────────────────────
  // Stable reference (empty deps). Uses navigator.onLine directly to avoid
  // stale-closure issues with reactive isOnline state.

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    // ── Try network first ───────────────────────────────────────────────────
    if (navigator.onLine) {
      try {
        const [prodRes, catRes, custRes] = await Promise.all([
          fetch('/api/products'),
          fetch('/api/categories'),
          fetch('/api/customers?limit=1000'),   // full-sync: no search filter
        ]);

        // First-load retry on 5xx / 405
        if (!prodRes.ok || !catRes.ok) {
          const status = !prodRes.ok ? prodRes.status : catRes.status;
          if (status === 405 || status === 503 || status === 500) {
            await new Promise((r) => setTimeout(r, 1500));
            // Retry once
            const [p2, c2, cu2] = await Promise.all([
              fetch('/api/products'),
              fetch('/api/categories'),
              fetch('/api/customers?limit=1000'),
            ]);
            if (!p2.ok || !c2.ok) throw new Error(`API ${status}`);
            const [pd, cd] = await Promise.all([p2.json(), c2.json()]);
            const cuData: Customer[] = cu2.ok ? await cu2.json() : [];
            await _applyAndCache(pd, cd, cuData);
            return;
          }
          const body = await (!prodRes.ok ? prodRes : catRes).json().catch(() => ({}));
          throw new Error(body?.error || `API error ${!prodRes.ok ? prodRes.status : catRes.status}`);
        }

        let [prodData, catData] = await Promise.all([prodRes.json(), catRes.json()]);
        const custData: Customer[] = custRes.ok ? await custRes.json() : [];

        // Auto-seed empty DB on first visit
        if (prodData.length === 0) {
          await fetch('/api/seed', { method: 'POST' });
          [prodData, catData] = await Promise.all([
            fetch('/api/products').then((r) => r.json()),
            fetch('/api/categories').then((r) => r.json()),
          ]);
        }

        await _applyAndCache(prodData, catData, custData);
        return;
      } catch (err) {
        console.warn('[OfflineData] API load failed, falling back to IndexedDB:', err);
        // Fall through to IndexedDB
      }
    }

    // ── Offline / API failure: load from IndexedDB ─────────────────────────
    try {
      const [localProds, localCats, localCusts] = await Promise.all([
        getProducts(),
        getCategories(),
        getCustomers(),
      ]);

      if (localProds.length > 0 || localCats.length > 0) {
        setProducts(localProds as Product[]);
        setCategories(localCats as Category[]);
        setCustomers(localCusts as Customer[]);
        setIsOfflineLoad(true);
      } else {
        // No cached data at all
        setLoadError(
          navigator.onLine
            ? 'Failed to connect to database. Check MONGODB_URI in .env.local and restart the dev server.'
            : 'No cached data available. Please open the app while connected to the internet at least once.'
        );
      }
    } catch (idbErr) {
      console.error('[OfflineData] IndexedDB read failed:', idbErr);
      setLoadError('Failed to load local data.');
    } finally {
      setIsLoading(false);
    }
  }, []); // ← intentionally empty; uses navigator.onLine directly

  // Helper: update state + cache to IDB
  const _applyAndCache = useCallback(async (prodData: Product[], catData: Category[], custData: Customer[]) => {
    setProducts(prodData);
    setCategories(catData);
    setCustomers(custData);
    setIsOfflineLoad(false);
    setLoadError(null);
    setIsLoading(false);
    try {
      await Promise.all([
        saveProducts(prodData),
        saveCategories(catData),
        custData.length > 0 ? saveCustomers(custData) : Promise.resolve(),
      ]);
    } catch (e) {
      console.warn('[OfflineData] IDB cache write failed:', e);
    }
  }, []);


  // ── Initial load on mount ──────────────────────────────────────────────────
  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Auto-refresh: tab visibility + window focus ────────────────────────────
  // When user switches back to this tab / app window, silently reload from
  // the server so they always see the latest data from other devices.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        loadData();
      }
    };
    const handleFocus = () => {
      if (navigator.onLine) loadData();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadData]);

  // ── Background polling every 60 s (while online) ───────────────────────────
  // Keeps all open devices in sync even if the tab stays open and focused.
  useEffect(() => {
    const id = setInterval(() => {
      if (navigator.onLine) loadData();
    }, 60_000);
    return () => clearInterval(id);
  }, [loadData]);

  // ── Mutation: Add Product ─────────────────────────────────────────────────

  const handleAddProduct = useCallback(async (newProduct: Omit<Product, 'id'>) => {
    const tempId            = `prod_${uuid()}`;
    const optimisticProduct : Product = { ...newProduct, id: tempId };

    setProducts((prev) => [...prev, optimisticProduct]);

    if (navigator.onLine) {
      try {
        const res = await fetch('/api/products', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ ...newProduct, id: tempId }),
        });
        if (!res.ok) throw new Error('Add product failed');
        const created: Product = await res.json();
        setProducts((prev) => prev.map((p) => (p.id === tempId ? created : p)));
        await putProduct(created);
      } catch (err) {
        console.error('[OfflineData] handleAddProduct failed:', err);
        setProducts((prev) => prev.filter((p) => p.id !== tempId));
      }
    } else {
      await putProduct(optimisticProduct);
      await addToSyncQueue({
        id:                   uuid(),
        type:                 'create',
        entity:               'product',
        productId:            tempId,
        payload:              { ...newProduct, id: tempId } as Record<string, unknown>,
        clientTransactionId:  tempId,
        createdAt:            Date.now(),
        status:               'pending',
        retryCount:           0,
      });
    }
  }, []);

  // ── Mutation: Update Price ────────────────────────────────────────────────

  const handleUpdateProductPrice = useCallback(async (productId: string, newPrice: number) => {
    // Optimistic UI
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, price: newPrice } : p))
    );

    // Update IDB immediately (read-modify-write)
    try {
      const existing = await getProduct(productId) as Product | undefined;
      if (existing) await putProduct({ ...existing, price: newPrice });
    } catch { /* non-fatal */ }

    if (navigator.onLine) {
      try {
        const res = await fetch(`/api/products/${productId}`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ price: newPrice }),
        });
        if (!res.ok) throw new Error('Price update failed');
      } catch (err) {
        console.error('[OfflineData] handleUpdateProductPrice failed:', err);
        // Revert by reloading
        await loadData();
      }
    } else {
      await addToSyncQueue({
        id:                  uuid(),
        type:                'update',
        entity:              'product',
        productId,
        payload:             { price: newPrice },
        clientTransactionId: uuid(),
        createdAt:           Date.now(),
        status:              'pending',
        retryCount:          0,
      });
    }
  }, [loadData]);

  // ── Mutation: Update Details ──────────────────────────────────────────────

  const handleUpdateProductDetails = useCallback(async (
    productId: string,
    updatedFields: Partial<Product>
  ) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, ...updatedFields } : p))
    );

    try {
      const existing = await getProduct(productId) as Product | undefined;
      if (existing) await putProduct({ ...existing, ...updatedFields });
    } catch { /* non-fatal */ }

    if (navigator.onLine) {
      try {
        const res = await fetch(`/api/products/${productId}`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(updatedFields),
        });
        if (!res.ok) throw new Error('Update failed');
      } catch (err) {
        console.error('[OfflineData] handleUpdateProductDetails failed:', err);
        await loadData();
      }
    } else {
      await addToSyncQueue({
        id:                  uuid(),
        type:                'update',
        entity:              'product',
        productId,
        payload:             updatedFields as Record<string, unknown>,
        clientTransactionId: uuid(),
        createdAt:           Date.now(),
        status:              'pending',
        retryCount:          0,
      });
    }
  }, [loadData]);

  // ── Mutation: Delete Product ──────────────────────────────────────────────

  const handleDeleteProduct = useCallback(async (productId: string) => {
    if (!confirm('Are you sure you want to delete this product from inventory?')) return;

    setProducts((prev) => prev.filter((p) => p.id !== productId));
    await deleteProductLocal(productId);

    if (navigator.onLine) {
      try {
        const res = await fetch(`/api/products/${productId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Delete failed');
      } catch (err) {
        console.error('[OfflineData] handleDeleteProduct failed:', err);
        await loadData();
      }
    } else {
      await addToSyncQueue({
        id:                  uuid(),
        type:                'delete',
        entity:              'product',
        productId,
        payload:             {},
        clientTransactionId: uuid(),
        createdAt:           Date.now(),
        status:              'pending',
        retryCount:          0,
      });
    }
  }, [loadData]);

  // ── Mutation: Reset to Default ────────────────────────────────────────────

  const handleResetToDefault = useCallback(async () => {
    if (!confirm(
      'This will restore any missing default products and categories. Your custom names and prices will be kept. Continue?'
    )) return;

    if (!navigator.onLine) {
      alert('Resetting to defaults requires an internet connection.');
      return;
    }

    try {
      setIsLoading(true);
      const res = await fetch('/api/seed', { method: 'POST' });
      if (!res.ok) throw new Error('Seed failed');
      await loadData();
    } catch (err) {
      console.error('[OfflineData] handleResetToDefault failed:', err);
      setIsLoading(false);
      alert('Failed to reset defaults. Please check MongoDB connection.');
    }
  }, [loadData]);

  return {
    products,
    categories,
    customers,
    isLoading,
    loadError,
    isOfflineLoad,
    loadData,
    handleAddProduct,
    handleUpdateProductPrice,
    handleUpdateProductDetails,
    handleDeleteProduct,
    handleResetToDefault,
  };
}

// ── Customer cache helpers (used by POSRegister via putCustomer) ──────────────
export { putCustomer };
