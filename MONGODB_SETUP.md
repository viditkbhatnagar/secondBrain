# 🍃 MongoDB Atlas Setup Guide (Free Tier)

## Step 1: Create MongoDB Atlas Account

1. **Go to MongoDB Atlas**: https://www.mongodb.com/atlas
2. **Sign up** for a free account
3. **Verify your email**

## Step 2: Create a Free Cluster

1. **Choose "Build a Database"**
2. **Select "M0 FREE"** cluster (512MB storage, perfect for testing)
3. **Choose a cloud provider** (AWS/Google/Azure - doesn't matter for free tier)
4. **Select a region** closest to you
5. **Name your cluster** (default "Cluster0" is fine)
6. **Click "Create Cluster"** (takes 3-5 minutes)

## Step 3: Setup Database Access

1. **Go to "Database Access"** in left sidebar
2. **Click "Add New Database User"**
3. **Choose "Password" authentication**
4. **Create username/password** (save these!)
5. **Set user privileges** to "Read and write to any database"
6. **Click "Add User"**

## Step 4: Setup Network Access

1. **Go to "Network Access"** in left sidebar
2. **Click "Add IP Address"**
3. **Click "Allow Access from Anywhere"** (for development)
   - Or add your specific IP for better security
4. **Click "Confirm"**

## Step 5: Get Connection String

1. **Go to "Database"** in left sidebar
2. **Click "Connect"** on your cluster
3. **Choose "Connect your application"**
4. **Select "Node.js"** and version **"4.1 or later"**
5. **Copy the connection string** - it looks like:
   ```
   mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

## Step 6: Configure Your App

1. **Update your `.env` file**:
   ```env
   MONGODB_URI=mongodb+srv://your-username:your-password@cluster0.xxxxx.mongodb.net/knowledge-base?retryWrites=true&w=majority
   ```

2. **Replace placeholders**:
   - `your-username` → your database username
   - `your-password` → your database password
   - `cluster0.xxxxx` → your actual cluster URL
   - `knowledge-base` → your database name

## Step 7: Install Dependencies

```bash
cd backend
npm install mongoose
```

## Step 8: Test Connection

**Start your server**:
```bash
npm run dev
```

**Look for this log message**:
```
✅ MongoDB connected successfully
```

## 🎯 What You Get with Free Tier

- **Storage**: 512 MB (thousands of documents)
- **Connections**: 500 concurrent connections
- **Transfer**: No data transfer limits
- **Regions**: All major cloud regions
- **Duration**: Forever free!

## 📊 Storage Estimates

| Document Type | Size | Quantity (512MB) |
|---------------|------|------------------|
| 10-page PDF | ~50KB | ~10,000 documents |
| Resume | ~20KB | ~25,000 documents |
| Research Paper | ~200KB | ~2,500 documents |
| Text Document | ~10KB | ~50,000 documents |

## 🔧 Optional: Create Database Indexes

**In MongoDB Compass or Atlas UI**, run these commands to optimize performance:

```javascript
// Create text search index
db.documents.createIndex({
  "originalName": "text",
  "summary": "text", 
  "topics": "text",
  "content": "text"
}, {
  weights: {
    originalName: 10,
    summary: 5,
    topics: 3,
    content: 1
  }
})

// Create upload date index
db.documents.createIndex({ "uploadedAt": -1 })

// Create document ID index
db.documents.createIndex({ "id": 1 }, { unique: true })

// Create chunk indexes
db.documentchunks.createIndex({ "documentId": 1 })
db.documentchunks.createIndex({ "documentName": 1 })
```

## 🚀 Benefits of MongoDB Integration

### **Persistent Storage**
- Documents survive server restarts
- No data loss during development

### **Shared Knowledge Base**
- All users contribute to the same database
- Better search results with more documents

### **Scalability** 
- Easy to upgrade to paid tiers later
- Built-in horizontal scaling

### **Advanced Features**
- Full-text search capabilities
- Aggregation pipelines for analytics
- Geospatial queries (if needed)

### **Analytics & Insights**
- Track popular search queries
- Monitor user behavior
- Analyze document usage patterns

## 🛡️ Security Best Practices

**For Production:**

1. **IP Whitelist**: Only allow specific IPs
2. **User Roles**: Create read-only users for analytics
3. **SSL**: Always use SSL connections (default in Atlas)
4. **Environment Variables**: Never commit credentials to git
5. **Monitoring**: Enable MongoDB Atlas monitoring

## 🔍 Monitoring Your Database

**MongoDB Atlas Dashboard shows:**
- Real-time performance metrics
- Storage usage
- Connection statistics
- Query performance
- Slow query analysis

## 📈 When to Upgrade

**Consider upgrading when you hit:**
- 400MB+ storage used (80% of free tier)
- Need more than 500 concurrent connections
- Want advanced security features
- Need more performance (dedicated clusters)

The M10 paid tier ($9/month) gives you:
- 10GB storage
- Dedicated cluster
- Advanced security
- Point-in-time recovery

## 🆘 Troubleshooting

**Common Issues:**

1. **Connection Timeout**:
   - Check IP whitelist
   - Verify connection string

2. **Authentication Failed**:
   - Check username/password
   - Ensure user has correct permissions

3. **Network Access Denied**:
   - Add your IP to Network Access
   - Or use "Allow from Anywhere" for testing

4. **Database Not Found**:
   - MongoDB creates databases automatically
   - Just make sure the name in connection string is correct

Your MongoDB Atlas setup is now complete! 🎉