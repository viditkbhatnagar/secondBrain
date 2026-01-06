# Cache Fix - Deployment Guide

## Problem Summary

The production environment was experiencing a caching issue where:
- **Hard refresh** (Ctrl+Shift+R / Cmd+Shift+R) showed the latest code with Admin button
- **Normal refresh** showed old cached code without Admin button

### Root Cause

The Service Worker was using a **`CacheFirst`** strategy for JavaScript and CSS files, which meant:
1. Browser checked cache first
2. If found, served cached version WITHOUT checking for updates
3. Only fetched from network if not in cache

This caused users to get stale JavaScript files even after new deployments.

---

## Fixes Applied

### 1. **Service Worker Caching Strategy** ✅
**File:** `frontend/src/sw-template.js`

**Changed from:** `CacheFirst` (serve cache, never check network)  
**Changed to:** `StaleWhileRevalidate` (serve cache immediately, check network in background)

```javascript
// Old (BAD)
new CacheFirst({
  cacheName: 'static-assets',
  plugins: [...],
})

// New (GOOD)
new StaleWhileRevalidate({
  cacheName: 'static-assets',
  plugins: [
    new CacheableResponsePlugin({ statuses: [0, 200] }),
    new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 7 * 24 * 60 * 60 }), // 7 days
  ],
})
```

**Benefits:**
- Still fast (serves from cache immediately)
- Always checks for updates in background
- Next page load gets fresh content

### 2. **Immediate Service Worker Activation** ✅
**File:** `frontend/src/sw-template.js`

Added aggressive update mechanism:

```javascript
// Activate new service worker immediately (no waiting)
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(), // Take control immediately
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            // Delete old caches not in whitelist
            if (!cacheName.startsWith('workbox-') && 
                !['static-assets', 'images', 'fonts', ...].includes(cacheName)) {
              return caches.delete(cacheName);
            }
          })
        );
      })
    ])
  );
});
```

**Benefits:**
- New service workers activate immediately (no manual refresh needed)
- Old caches are cleaned up automatically
- Users get updates faster

### 3. **HTML Cache Prevention** ✅
**File:** `frontend/public/index.html`

Added explicit cache control meta tags:

```html
<!-- Cache Control - Prevent HTML caching -->
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
<meta http-equiv="Pragma" content="no-cache" />
<meta http-equiv="Expires" content="0" />
```

### 4. **Service Worker Build Configuration** ✅
**File:** `frontend/craco.config.js`

Excluded `index.html` from service worker precaching:

```javascript
exclude: [
  /\.map$/,
  /asset-manifest\.json$/,
  /LICENSE/,
  /index\.html$/, // Never precache index.html - always fetch fresh
],
```

**Benefits:**
- HTML is always fetched fresh from server
- Ensures latest version info reaches browser

---

## Deployment Instructions

### Step 1: Commit and Push Changes

```bash
cd /Users/viditkbhatnagar/codes/personal-knowledge-base

# Review changes
git status
git diff

# Stage changes
git add frontend/src/sw-template.js
git add frontend/public/index.html
git add frontend/craco.config.js

# Commit
git commit -m "fix: aggressive caching causing stale code in production

- Changed service worker strategy from CacheFirst to StaleWhileRevalidate for JS/CSS
- Added immediate service worker activation (skipWaiting)
- Added cache cleanup on activation
- Excluded index.html from service worker precaching
- Added HTML cache control meta tags

This fixes the issue where hard refresh showed new code but normal refresh showed old cached code."

# Push to trigger deployment
git push origin main
```

### Step 2: Wait for Deployment

Monitor your deployment platform (Render) for the build to complete:
- Build time: ~5-10 minutes
- The service worker will be regenerated with new settings
- Static files will be served with proper cache headers

### Step 3: Test the Fix

After deployment completes:

1. **Clear existing cache** (one-time for existing users):
   ```javascript
   // In browser console
   navigator.serviceWorker.getRegistrations().then(registrations => {
     registrations.forEach(reg => reg.unregister())
   })
   caches.keys().then(keys => keys.forEach(key => caches.delete(key)))
   location.reload()
   ```

2. **Test normal refresh**:
   - Open your production site
   - Log in as admin
   - Verify Admin button is visible
   - Press F5 or normal refresh
   - Admin button should STILL be visible ✅

3. **Test auto-updates**:
   - Make a small change (like console.log)
   - Deploy again
   - On the live site, wait ~30 seconds
   - You should see an update banner: "Update available"
   - Click "Update" button
   - Site reloads with new code ✅

---

## How It Works Now

### Initial Load
1. Browser requests `index.html` → Always fetched fresh (no-cache)
2. HTML references JS/CSS with content hashes (e.g., `main.abc123.js`)
3. Service worker downloads and caches new files

### Subsequent Visits
1. **Service worker serves cached JS/CSS** (instant load)
2. **In parallel, checks network for updates**
3. If updates found, downloads in background
4. Shows update notification to user
5. User clicks "Update" → Reloads with fresh code

### After New Deployment
1. Service worker detects new `service-worker.js`
2. Installs in background
3. Activates immediately (`skipWaiting()`)
4. Claims all clients (`clients.claim()`)
5. Shows update notification
6. User refreshes → Gets new code

---

## User Impact

### For End Users
- **Faster:** Still benefits from caching (instant loads)
- **Fresher:** Always get updates within 1-2 page loads
- **Automatic:** Update notification appears when new version is ready

### For Admins
- No more "hard refresh to see changes"
- Deployments take effect within minutes for all users
- Cache issues are eliminated

---

## Verification Commands

### Check if service worker is running:
```javascript
navigator.serviceWorker.controller
```

### Check cache contents:
```javascript
caches.keys().then(console.log)
```

### Check cache size:
```javascript
let totalSize = 0;
caches.keys().then(async (keys) => {
  for (const key of keys) {
    const cache = await caches.open(key);
    const requests = await cache.keys();
    for (const req of requests) {
      const resp = await cache.match(req);
      const blob = await resp.blob();
      totalSize += blob.size;
    }
  }
  console.log('Total cache:', (totalSize / 1024 / 1024).toFixed(2), 'MB');
});
```

### Force update check:
```javascript
navigator.serviceWorker.ready.then(reg => reg.update())
```

---

## Rollback Plan

If issues occur, you can disable the service worker:

1. **Option A: Unregister via code**
   ```javascript
   // Add to index.html temporarily
   navigator.serviceWorker.getRegistrations().then(registrations => {
     registrations.forEach(reg => reg.unregister())
   })
   ```

2. **Option B: Disable in serviceWorkerRegistration.ts**
   ```typescript
   // Change register() to unregister()
   serviceWorkerRegistration.unregister();
   ```

---

## Monitoring

### Expected Behavior
- Users should see updates within 2-3 page loads after deployment
- Update notification should appear automatically
- No need for hard refresh

### If Issues Persist
1. Check browser console for service worker errors
2. Verify service worker is registered: `navigator.serviceWorker.controller`
3. Check network tab: ensure `service-worker.js` is fetched (not 304 cached)
4. Clear service worker: See rollback plan above

---

## Technical Details

### Cache Headers (Backend)
Already correctly configured in `backend/src/server.ts`:

```javascript
// HTML files
if (filePath.endsWith('.html')) {
  res.setHeader('Cache-Control', 'no-cache');
}
// CSS/JS/images
else if (filePath.match(/\.(css|js|jpg|jpeg|png|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
}
```

### Service Worker Strategies
- **HTML:** No cache (always fresh)
- **JS/CSS:** Stale-While-Revalidate (fast + fresh)
- **Images/Fonts:** Cache First (rarely change)
- **API calls:** Network First or Stale-While-Revalidate

---

## Success Criteria

✅ Normal refresh shows latest code  
✅ Admin button always visible after login  
✅ Update notification appears after deployment  
✅ No hard refresh needed  
✅ Fast page loads (caching still works)  
✅ Automatic cache cleanup  

---

## Support

If you encounter any issues:
1. Check browser console for errors
2. Use verification commands above
3. Try the rollback plan if needed
4. Contact the development team with console logs

**Last Updated:** January 6, 2026  
**Version:** 2.0.0

