import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface OfflineDB extends DBSchema {
  pendingSearches: {
    key: string;
    value: {
      id: string;
      query: string;
      timestamp: number;
    };
  };
  cachedResults: {
    key: string;
    value: {
      query: string;
      result: any;
      timestamp: number;
      expiresAt: number;
    };
    indexes: { 'by-query': string };
  };
  offlineDocuments: {
    key: string;
    value: {
      id: string;
      name: string;
      content: string;
      savedAt: number;
    };
  };
}

const DB_NAME = 'secondbrain-offline';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<OfflineDB>> | null = null;

export async function getDB(): Promise<IDBPDatabase<OfflineDB>> {
  if (!dbPromise) {
    dbPromise = openDB<OfflineDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Pending searches store
        if (!db.objectStoreNames.contains('pendingSearches')) {
          db.createObjectStore('pendingSearches', { keyPath: 'id' });
        }

        // Cached results store
        if (!db.objectStoreNames.contains('cachedResults')) {
          const store = db.createObjectStore('cachedResults', { keyPath: 'query' });
          store.createIndex('by-query', 'query');
        }

        // Offline documents store
        if (!db.objectStoreNames.contains('offlineDocuments')) {
          db.createObjectStore('offlineDocuments', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

// Cache search result
export async function cacheSearchResult(query: string, result: any, ttlMs = 24 * 60 * 60 * 1000): Promise<void> {
  const db = await getDB();
  await db.put('cachedResults', {
    query,
    result,
    timestamp: Date.now(),
    expiresAt: Date.now() + ttlMs,
  });
}

// Get cached search result
export async function getCachedSearchResult(query: string): Promise<any | null> {
  const db = await getDB();
  const cached = await db.get('cachedResults', query);
  
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }
  
  // Remove expired cache
  if (cached) {
    await db.delete('cachedResults', query);
  }
  
  return null;
}

// Save document for offline access
export async function saveDocumentOffline(doc: { id: string; name: string; content: string }): Promise<void> {
  const db = await getDB();
  await db.put('offlineDocuments', {
    ...doc,
    savedAt: Date.now(),
  });
}

// Get offline documents
export async function getOfflineDocuments(): Promise<Array<{ id: string; name: string; content: string; savedAt: number }>> {
  const db = await getDB();
  return db.getAll('offlineDocuments');
}

// Delete offline document
export async function deleteOfflineDocument(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('offlineDocuments', id);
}

// Clear all offline data
export async function clearOfflineData(): Promise<void> {
  const db = await getDB();
  await db.clear('pendingSearches');
  await db.clear('cachedResults');
  await db.clear('offlineDocuments');
}
