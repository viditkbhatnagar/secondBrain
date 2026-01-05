# ⚡ Blazing Fast Search - Setup Instructions

## 🎯 What You Get

Transform your search from **45+ seconds** to **1-2 seconds** (or < 100ms for cached queries)!

## 🚀 Quick Setup (2 minutes)

### 1. Backend is Already Set Up! ✅

All backend services are already implemented:
- ✅ Multi-level caching (Memory + Redis)
- ✅ Ultra-fast RAG service
- ✅ Blazing search API endpoint (`/api/blazing/search`)
- ✅ Cache management endpoints

### 2. Start Your Services

```bash
# Terminal 1: Start backend
cd backend
npm run dev

# Terminal 2: Start frontend
cd frontend
npm start
```

### 3. Test the Blazing Search

Open your browser and navigate to `http://localhost:3000`

#### Option A: Use the Example Component

Add this to your app to see it in action:

```tsx
import { BlazingSearchExample } from './components/BlazingSearchExample';

function App() {
  return <BlazingSearchExample />;
}
```

#### Option B: Use in Your Existing Component

```tsx
import { useBlazingSearch } from './hooks/useBlazingSearch';

function YourComponent() {
  const { search, loading, response, error } = useBlazingSearch();

  const handleSearch = async () => {
    const result = await search('What is this about?');
    console.log('Response in', result.responseTime, 'ms');
  };

  return (
    <div>
      <button onClick={handleSearch} disabled={loading}>
        Search
      </button>
      {response && <div>{response.answer}</div>}
    </div>
  );
}
```

## 📊 Verify Performance

### Test 1: First Query (Cold Start)
```bash
curl -X POST http://localhost:3001/api/blazing/search \
  -H "Content-Type: application/json" \
  -d '{"query": "What is machine learning?", "maxSources": 3}'
```

**Expected:** ~1-2 seconds

### Test 2: Repeat Query (Cached)
Run the same curl command again.

**Expected:** < 100ms (Check `X-Cache: HIT` header)

### Test 3: Cache Statistics
```bash
curl http://localhost:3001/api/blazing/stats
```

**Expected:**
```json
{
  "success": true,
  "stats": {
    "hits": 1,
    "misses": 1,
    "hitRate": 0.5,
    "memoryCacheSize": 1,
    "hotCacheSize": 0
  }
}
```

## 🎨 UI Integration Examples

### Example 1: Simple Search Bar

```tsx
import { useState } from 'react';
import { useBlazingSearch } from '../hooks/useBlazingSearch';

export function SimpleSearch() {
  const [query, setQuery] = useState('');
  const { search, loading, response } = useBlazingSearch();

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Ask a question..."
      />
      <button 
        onClick={() => search(query)}
        disabled={loading}
      >
        {loading ? 'Searching...' : 'Search'}
      </button>
      
      {response && (
        <div>
          <p>{response.answer}</p>
          <small>
            {response.cached ? '⚡ Cached' : '🔍 Fresh'} 
            ({response.responseTime}ms)
          </small>
        </div>
      )}
    </div>
  );
}
```

### Example 2: With Performance Metrics

```tsx
import { useBlazingSearch } from '../hooks/useBlazingSearch';

export function SearchWithMetrics() {
  const { search, loading, response, cacheStats } = useBlazingSearch();

  return (
    <div>
      {/* Search UI */}
      <input ... />
      <button onClick={() => search(query)}>Search</button>
      
      {/* Performance Metrics */}
      {response && (
        <div className="metrics">
          <span className={response.cached ? 'cached' : 'fresh'}>
            {response.cached ? '⚡ Instant' : '🔍 Fresh'}
          </span>
          <span>{response.responseTime}ms</span>
          <span>{response.confidence}% confidence</span>
          {response.cached && (
            <span>from {response.metadata.cacheLayer}</span>
          )}
        </div>
      )}
      
      {/* Cache Stats */}
      <div className="cache-stats">
        Memory Cache: {cacheStats.memoryCacheSize} entries
        Total Hits: {cacheStats.totalHits}
      </div>
    </div>
  );
}
```

### Example 3: With Error Handling

```tsx
import { useBlazingSearch } from '../hooks/useBlazingSearch';

export function RobustSearch() {
  const { search, loading, response, error } = useBlazingSearch();
  
  const handleSearch = async (query: string) => {
    try {
      await search(query);
    } catch (err) {
      console.error('Search failed:', err);
      // Error is already in the 'error' state
    }
  };

  return (
    <div>
      <input ... />
      <button onClick={() => handleSearch(query)}>Search</button>
      
      {error && (
        <div className="error">
          ❌ {error}
        </div>
      )}
      
      {response && (
        <div className="results">
          {response.answer}
        </div>
      )}
    </div>
  );
}
```

## 🔧 Configuration

### Backend: Cache TTL

Edit `backend/src/services/ultraFastRagService.ts`:

```typescript
// High confidence answers cached for 2 hours
const cacheTTL = confidence > 80 ? 7200 : 3600;
```

### Frontend: Cache Size

Edit `frontend/src/utils/browserCache.ts`:

```typescript
private maxMemoryCacheSize = 100; // Max entries in memory
```

## 🎯 Performance Tuning

### For Maximum Speed (< 1 second)

```typescript
await search(query, {
  maxSources: 2,      // Reduce sources
  useCache: true      // Always use cache
});
```

### For Maximum Quality

```typescript
await search(query, {
  maxSources: 5,      // More sources
  useCache: true,     // Still use cache
  forceRefresh: false // Don't bypass cache
});
```

### For Fresh Results

```typescript
await search(query, {
  forceRefresh: true  // Bypass cache
});
```

## 🎨 Pre-warm Cache at Startup

Add this to your app initialization:

```typescript
// App.tsx or index.tsx
import { useEffect } from 'react';

function App() {
  useEffect(() => {
    // Pre-warm cache with common queries
    const commonQueries = [
      'What is this about?',
      'How do I get started?',
      'What are the main features?'
    ];

    fetch('/api/blazing/prewarm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queries: commonQueries })
    }).then(() => {
      console.log('✅ Cache pre-warmed');
    });
  }, []);

  return <YourApp />;
}
```

## 🗑️ Clear Cache After Document Changes

```typescript
import { clearSearchCache } from '../hooks/useBlazingSearch';

async function handleFileUpload(file: File) {
  // Upload file
  const response = await uploadFile(file);
  
  if (response.ok) {
    // Clear all caches
    await fetch('/api/blazing/cache/invalidate', { method: 'POST' });
    await clearSearchCache();
    
    alert('File uploaded and caches cleared!');
  }
}
```

## 📊 Monitor Performance

### In Browser Console

```javascript
// Get cache stats
fetch('/api/blazing/stats')
  .then(r => r.json())
  .then(data => {
    const hitRate = (data.stats.hitRate * 100).toFixed(2);
    console.log(`Cache hit rate: ${hitRate}%`);
    console.log(`Memory cache size: ${data.stats.memoryCacheSize}`);
  });
```

### In Browser DevTools

1. Open DevTools (F12)
2. Go to Network tab
3. Search something
4. Look for:
   - `X-Cache: HIT` or `MISS` header
   - `X-Cache-Layer: hot|memory|redis` header
   - Request timing

## ✅ Checklist

After setup, verify:

- [ ] Backend starts without errors
- [ ] Frontend starts without errors
- [ ] Can search and get results in 1-2 seconds
- [ ] Repeat search completes in < 100ms
- [ ] See `X-Cache: HIT` on repeat searches
- [ ] Browser cache working (check IndexedDB in DevTools)
- [ ] Cache stats endpoint returns data
- [ ] Can clear cache successfully

## 🎉 Success Indicators

You'll know it's working when:

1. **First search:** 1-2 seconds ✅
2. **Same search again:** < 100ms ⚡
3. **Cache hit rate:** > 70% after a few queries 📈
4. **Browser DevTools:** See `X-Cache: HIT` header 🎯
5. **IndexedDB:** See cached entries in Application tab 💾

## 🚨 Troubleshooting

### Problem: Still taking 45 seconds

**Solution:** Make sure you're calling the new endpoint:
```typescript
// ✅ Correct
fetch('/api/blazing/search', ...)

// ❌ Wrong
fetch('/api/search', ...)
```

### Problem: Cache not working

**Check:**
1. Redis running? (optional but recommended)
2. IndexedDB enabled in browser?
3. Service worker registered?

```bash
# Check Redis
redis-cli ping
# Should return: PONG

# Check service worker
# Open DevTools > Application > Service Workers
```

### Problem: Getting stale results

**Solution:** Clear cache after document changes:
```typescript
await fetch('/api/blazing/cache/invalidate', { method: 'POST' });
await clearSearchCache();
```

## 📚 Documentation

- [Detailed Documentation](./BLAZING_FAST_SEARCH.md)
- [Migration Guide](./MIGRATION_TO_BLAZING_SEARCH.md)
- Example Component: `frontend/src/components/BlazingSearchExample.tsx`

## 🎯 Next Steps

1. ✅ Verify setup works
2. 🔄 Replace old search calls with new hook
3. 🚀 Add cache invalidation on document changes
4. 📊 Monitor cache performance
5. 🎨 Customize UI for your needs
6. ⚡ Enjoy blazing-fast search!

---

**Questions?** Check the documentation or inspect the example component for reference.

**Ready to experience sub-second search?** 🚀 Start with step 1 above!

