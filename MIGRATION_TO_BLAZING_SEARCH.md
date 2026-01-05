# Migration Guide: Switch to Blazing Fast Search

This guide helps you migrate from the old search endpoint to the new blazing-fast search.

## 🎯 Quick Start (5 minutes)

### Step 1: Update Your Frontend Component

**Before (Old Search):**
```typescript
const response = await fetch('/api/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query })
});
```

**After (Blazing Search):**
```typescript
import { useBlazingSearch } from '../hooks/useBlazingSearch';

function YourComponent() {
  const { search, loading, response } = useBlazingSearch();
  
  const handleSearch = async (query: string) => {
    await search(query);
  };
  
  // ... rest of your component
}
```

### Step 2: Clear Cache After Document Changes

Add this wherever you upload or delete documents:

```typescript
import { clearSearchCache } from '../hooks/useBlazingSearch';

async function handleDocumentUpload() {
  // ... upload logic ...
  
  // Clear caches
  await fetch('/api/blazing/cache/invalidate', { method: 'POST' });
  await clearSearchCache();
}
```

### Step 3: Test It!

1. Start your backend: `npm run dev`
2. Start your frontend: `npm start`
3. Try a search - should complete in 1-2 seconds
4. Try the same search again - should complete in < 100ms! 🚀

## 📊 Performance Comparison

### Example Search: "What is machine learning?"

**Old Endpoint (`/api/search`):**
```
Query normalization:     ~200ms
Query expansion:         ~1500ms
Embedding generation:    ~300ms
Vector search:           ~400ms
Reranking:              ~2000ms
LLM answer generation:   ~40000ms
Response validation:     ~1000ms
─────────────────────────────────
Total:                   ~45400ms (45.4 seconds)
```

**New Endpoint (`/api/blazing/search`):**
```
[Cache miss - first time]
Embedding generation:    ~200ms
Vector search:           ~100ms
LLM answer (optimized):  ~1200ms
─────────────────────────────────
Total:                   ~1500ms (1.5 seconds)

[Cache hit - repeat query]
Browser cache lookup:    < 1ms
─────────────────────────────────
Total:                   < 1ms (instant!)
```

## 🔄 API Differences

### Request Format

Both endpoints use similar request format:

**Old:**
```json
{
  "query": "your question",
  "strategy": "hybrid",
  "rerank": true
}
```

**New:**
```json
{
  "query": "your question",
  "maxSources": 3,
  "useCache": true
}
```

### Response Format

**Old:**
```json
{
  "answer": "...",
  "relevantChunks": [...],
  "confidence": 85,
  "sources": [...]
}
```

**New:**
```json
{
  "success": true,
  "data": {
    "answer": "...",
    "sources": [...],
    "confidence": 85,
    "responseTime": 1234,
    "cached": false,
    "metadata": {
      "fromCache": false,
      "searchTime": 234,
      "llmTime": 1000
    }
  }
}
```

## 🎛️ Feature Comparison

| Feature | Old Search | Blazing Search | Notes |
|---------|-----------|----------------|-------|
| Response Time (cold) | 45s | 1-2s | ✅ 95% faster |
| Response Time (cached) | 45s | < 100ms | ✅ Instant repeats |
| Multi-level caching | ❌ | ✅ | Memory + IndexedDB + Redis |
| Browser caching | ❌ | ✅ | Survives refresh |
| Offline support | ❌ | ✅ | Via service worker |
| Query expansion | ✅ | ❌ | Skipped for speed |
| Reranking | ✅ | ❌ (optional) | Skipped for speed |
| Response validation | ✅ | ❌ | Skipped for speed |
| Conversation history | ✅ | ⏳ | Coming soon |
| Streaming | ✅ | ⏳ | Coming soon |

## 🚀 Advanced Features

### Pre-warm Cache

Pre-compute answers for common questions:

```typescript
const commonQuestions = [
  'What is this document about?',
  'How do I get started?',
  'What are the main features?'
];

await fetch('/api/blazing/prewarm', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ queries: commonQuestions })
});
```

### Cache Statistics

Monitor cache performance:

```typescript
const stats = await fetch('/api/blazing/stats').then(r => r.json());
console.log(`Cache hit rate: ${(stats.stats.hitRate * 100).toFixed(2)}%`);
```

### Force Refresh

Bypass cache when needed:

```typescript
const { search } = useBlazingSearch();
await search(query, { forceRefresh: true });
```

## 🔧 Configuration Options

### Backend Configuration

Edit `backend/src/services/ultraFastRagService.ts`:

```typescript
const options = {
  maxSources: 3,           // Number of source chunks (default: 3)
  skipRerank: true,        // Skip expensive reranking (default: true)
  minConfidence: 0.4,      // Minimum similarity threshold (default: 0.4)
};
```

### Frontend Configuration

Edit `frontend/src/hooks/useBlazingSearch.ts`:

```typescript
const { search } = useBlazingSearch();

await search(query, {
  maxSources: 3,          // Number of sources to return
  useCache: true,         // Use browser cache
  forceRefresh: false     // Bypass cache
});
```

## 🐛 Troubleshooting

### Issue: Still seeing 45s response times

**Solution:** Make sure you're calling the new endpoint:
```typescript
// ✅ Correct
fetch('/api/blazing/search', ...)

// ❌ Wrong - this is the old endpoint
fetch('/api/search', ...)
```

### Issue: Cache not working

**Check:**
1. Browser DevTools > Application > IndexedDB - should see `KnowledgeBaseCache`
2. Network tab - look for `X-Cache: HIT` header
3. Console - should see cache hit messages

### Issue: Stale results after uploading documents

**Solution:** Clear caches after document changes:
```typescript
await fetch('/api/blazing/cache/invalidate', { method: 'POST' });
await clearSearchCache();
```

### Issue: "Cache layer: none" in all responses

**Cause:** Queries are slightly different each time

**Solution:** Normalize your queries before searching:
```typescript
const normalized = query.trim().toLowerCase();
await search(normalized);
```

## 📈 Expected Performance

### First Query (Cold Start)
- **Target:** 1-2 seconds
- **Acceptable:** < 3 seconds
- **Slow:** > 3 seconds (check network/API latency)

### Repeat Query (Cached)
- **Target:** < 100ms
- **Acceptable:** < 500ms
- **Slow:** > 500ms (check browser cache)

### Cache Hit Rate
- **Good:** > 70%
- **Excellent:** > 80%
- **Poor:** < 50% (consider pre-warming)

## 🎯 Optimization Checklist

- [ ] Replace old `/api/search` calls with `/api/blazing/search`
- [ ] Use `useBlazingSearch()` hook in React components
- [ ] Add cache invalidation after document uploads/deletes
- [ ] Pre-warm cache with common queries
- [ ] Monitor cache hit rate
- [ ] Add loading states for better UX
- [ ] Test with network throttling

## 🔜 Coming Soon

- [ ] Streaming support for blazing search
- [ ] Conversation history support
- [ ] Automatic cache warming based on analytics
- [ ] Predictive pre-fetching
- [ ] Cache compression for larger datasets

## 💡 Best Practices

1. **Always use cache** unless you have a specific reason not to
2. **Pre-warm** cache at application startup
3. **Clear cache** after document mutations
4. **Monitor** cache hit rate regularly
5. **Test** with realistic query patterns

## 📞 Need Help?

If you encounter issues:
1. Check the [BLAZING_FAST_SEARCH.md](./BLAZING_FAST_SEARCH.md) documentation
2. Review browser console for errors
3. Check server logs for cache performance
4. Monitor cache statistics endpoint

---

**Ready to experience blazing-fast search?** 🚀

Start with the Quick Start section above and see your response times drop from 45s to 1-2s!

