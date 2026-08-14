// ── IndexedDB wrapper for Autoparts POS offline storage ──────────────────────
// Database: autoparts-pos
// Stores:   products | categories | syncQueue | customers | salesQueue

const DB_NAME    = 'autoparts-pos';
const DB_VERSION = 3; // v2 added customers, v3 added salesQueue

// ── Types ─────────────────────────────────────────────────────────────────────

export type SyncOperationType = 'create' | 'update' | 'delete';
export type SyncStatus        = 'pending' | 'syncing' | 'synced' | 'failed';

export interface SyncQueueItem {
  id: string;                         // unique client-side UUID for this queue entry
  type: SyncOperationType;
  entity: 'product' | 'customer';
  productId?: string;                 // used when entity === 'product'
  customerId?: string;                // used when entity === 'customer'
  payload: Record<string, unknown>;
  clientTransactionId: string;        // idempotency key sent to server
  createdAt: number;
  status: SyncStatus;
  retryCount: number;
}

// Shape of a pending offline sale
export interface PendingSale {
  id: string;                        // client-generated idempotency key (= invoiceNumber)
  payload: Record<string, unknown>;  // full body to POST to /api/sales
  createdAt: number;
  status: SyncStatus;
  retryCount: number;
}

// ── DB singleton ──────────────────────────────────────────────────────────────

let _dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;

  _dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;

      // ── v1 stores ────────────────────────────────────────────────────────
      if (!db.objectStoreNames.contains('products')) {
        db.createObjectStore('products', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('categories')) {
        db.createObjectStore('categories', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('syncQueue')) {
        const store = db.createObjectStore('syncQueue', { keyPath: 'id' });
        store.createIndex('status',    'status',    { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // ── v2 store: customers ──────────────────────────────────────────────
      if (!db.objectStoreNames.contains('customers')) {
        const cs = db.createObjectStore('customers', { keyPath: 'customerId' });
        cs.createIndex('name',  'name',  { unique: false });
        cs.createIndex('phone', 'phone', { unique: false });
      }

      // ── v3 store: salesQueue ─────────────────────────────────────────────
      if (!db.objectStoreNames.contains('salesQueue')) {
        const sq = db.createObjectStore('salesQueue', { keyPath: 'id' });
        sq.createIndex('status',    'status',    { unique: false });
        sq.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => { _dbPromise = null; reject(req.error); };
  });

  return _dbPromise;
}

// ── Generic helpers ───────────────────────────────────────────────────────────

function txPromise(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
    tx.onabort    = () => reject(tx.error);
  });
}

function reqPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

// ── Products ──────────────────────────────────────────────────────────────────

/** Replace the entire products cache */
export async function saveProducts(products: unknown[]): Promise<void> {
  const db = await getDB();
  const tx    = db.transaction('products', 'readwrite');
  const store = tx.objectStore('products');
  store.clear();
  for (const p of products) store.put(p);
  return txPromise(tx);
}

/** Read all cached products */
export async function getProducts(): Promise<unknown[]> {
  const db = await getDB();
  return reqPromise(db.transaction('products', 'readonly').objectStore('products').getAll());
}

/** Upsert a single product in the local cache */
export async function putProduct(product: unknown): Promise<void> {
  const db = await getDB();
  const tx  = db.transaction('products', 'readwrite');
  tx.objectStore('products').put(product);
  return txPromise(tx);
}

/** Get a single product by id */
export async function getProduct(id: string): Promise<unknown | undefined> {
  const db = await getDB();
  return reqPromise(db.transaction('products', 'readonly').objectStore('products').get(id));
}

/** Delete a single product from the local cache */
export async function deleteProductLocal(productId: string): Promise<void> {
  const db = await getDB();
  const tx  = db.transaction('products', 'readwrite');
  tx.objectStore('products').delete(productId);
  return txPromise(tx);
}

// ── Categories ────────────────────────────────────────────────────────────────

export async function saveCategories(categories: unknown[]): Promise<void> {
  const db = await getDB();
  const tx    = db.transaction('categories', 'readwrite');
  const store = tx.objectStore('categories');
  store.clear();
  for (const c of categories) store.put(c);
  return txPromise(tx);
}

export async function getCategories(): Promise<unknown[]> {
  const db = await getDB();
  return reqPromise(db.transaction('categories', 'readonly').objectStore('categories').getAll());
}

// ── Customers ─────────────────────────────────────────────────────────────────

/** Replace the entire customers cache (used for full-sync from API) */
export async function saveCustomers(customers: unknown[]): Promise<void> {
  const db = await getDB();
  const tx    = db.transaction('customers', 'readwrite');
  const store = tx.objectStore('customers');
  store.clear();
  for (const c of customers) store.put(c);
  return txPromise(tx);
}

/** Read all cached customers */
export async function getCustomers(): Promise<unknown[]> {
  const db = await getDB();
  return reqPromise(db.transaction('customers', 'readonly').objectStore('customers').getAll());
}

/** Upsert a single customer (used after online create or offline update) */
export async function putCustomer(customer: unknown): Promise<void> {
  const db = await getDB();
  const tx  = db.transaction('customers', 'readwrite');
  tx.objectStore('customers').put(customer);
  return txPromise(tx);
}

/** Get a single customer by customerId */
export async function getCustomerById(customerId: string): Promise<unknown | undefined> {
  const db = await getDB();
  return reqPromise(
    db.transaction('customers', 'readonly').objectStore('customers').get(customerId)
  );
}

/**
 * Search customers locally by name or phone.
 * Does a case-insensitive substring match over all cached customers.
 */
export async function searchCustomersLocal(query: string): Promise<unknown[]> {
  const db  = await getDB();
  const all = await reqPromise<unknown[]>(
    db.transaction('customers', 'readonly').objectStore('customers').getAll()
  );
  if (!query.trim()) return all;
  const q = query.trim().toLowerCase();
  return (all as Array<{ name?: string; phone?: string }>).filter(
    (c) =>
      (c.name  ?? '').toLowerCase().includes(q) ||
      (c.phone ?? '').toLowerCase().includes(q)
  );
}

// ── Sync Queue ────────────────────────────────────────────────────────────────

export async function addToSyncQueue(item: SyncQueueItem): Promise<void> {
  const db = await getDB();
  const tx  = db.transaction('syncQueue', 'readwrite');
  tx.objectStore('syncQueue').put(item);
  return txPromise(tx);
}

export async function getPendingSyncItems(): Promise<SyncQueueItem[]> {
  const db = await getDB();
  return reqPromise(
    db.transaction('syncQueue', 'readonly')
      .objectStore('syncQueue')
      .index('status')
      .getAll('pending')
  ) as Promise<SyncQueueItem[]>;
}

export async function updateSyncItemStatus(id: string, status: SyncStatus): Promise<void> {
  const db    = await getDB();
  const tx    = db.transaction('syncQueue', 'readwrite');
  const store = tx.objectStore('syncQueue');

  const existing = await reqPromise<SyncQueueItem>(store.get(id));
  if (existing) {
    store.put({
      ...existing,
      status,
      retryCount: status === 'failed' ? existing.retryCount + 1 : existing.retryCount,
    });
  }
  return txPromise(tx);
}

export async function getPendingCount(): Promise<number> {
  const db = await getDB();
  const syncPending = await reqPromise<number>(
    db.transaction('syncQueue', 'readonly')
      .objectStore('syncQueue')
      .index('status')
      .count('pending')
  );
  const salesPending = await reqPromise<number>(
    db.transaction('salesQueue', 'readonly')
      .objectStore('salesQueue')
      .index('status')
      .count('pending')
  );
  return syncPending + salesPending;
}

// ── Sales Queue (offline sales) ───────────────────────────────────────────────

export async function addToSalesQueue(item: PendingSale): Promise<void> {
  const db = await getDB();
  const tx  = db.transaction('salesQueue', 'readwrite');
  tx.objectStore('salesQueue').put(item);
  return txPromise(tx);
}

export async function getPendingSales(): Promise<PendingSale[]> {
  const db = await getDB();
  return reqPromise(
    db.transaction('salesQueue', 'readonly')
      .objectStore('salesQueue')
      .index('status')
      .getAll('pending')
  ) as Promise<PendingSale[]>;
}

export async function updateSaleQueueStatus(id: string, status: SyncStatus): Promise<void> {
  const db    = await getDB();
  const tx    = db.transaction('salesQueue', 'readwrite');
  const store = tx.objectStore('salesQueue');

  const existing = await reqPromise<PendingSale>(store.get(id));
  if (existing) {
    store.put({
      ...existing,
      status,
      retryCount: status === 'failed' ? existing.retryCount + 1 : existing.retryCount,
    });
  }
  return txPromise(tx);
}
