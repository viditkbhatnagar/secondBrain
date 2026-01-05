# Manual Database Flush Options

## Option A: Using MongoDB Shell

```bash
# Connect to your MongoDB instance
mongosh "your-mongodb-connection-string"

# Switch to your database
use knowledge-base

# Drop all collections
db.documents.drop()
db.documentchunks.drop()
db.chatthreads.drop()
db.chatmessages.drop()
db.usersessions.drop()
db.searchqueries.drop()
db.graphnodes.drop()
db.graphedges.drop()
db.savedsearches.drop()
db.analyticevents.drop()
db.dailystats.drop()
db.feedbacks.drop()

# Or drop entire database
db.dropDatabase()
```

## Option B: Using MongoDB Compass
1. Open MongoDB Compass
2. Connect to your database
3. Navigate to your knowledge-base database
4. For each collection, click "..." → "Drop Collection"
5. Or drop the entire database

## Option C: Programmatic (one-liner)
```javascript
// In MongoDB shell
db.getCollectionNames().forEach(function(n) {
    if (n !== "system.indexes") {
        db.getCollection(n).drop();
    }
});
```
