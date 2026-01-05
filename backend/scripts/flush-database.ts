#!/usr/bin/env ts-node

import mongoose from 'mongoose';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Safely flush all collections in the knowledge-base database
 * ⚠️  WARNING: This will permanently delete ALL data!
 */
async function flushDatabase() {
  try {
    console.log('🔥 Starting Database Flush Operation...');
    console.log('⚠️  WARNING: This will permanently delete ALL data!');
    
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI not found in environment variables');
    }

    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Get all collection names
    const db = mongoose.connection.db;
    const collections = await db?.listCollections().toArray();
    
    if (!collections || collections.length === 0) {
      console.log('💭 Database is already empty - nothing to flush');
      return;
    }

    console.log(`📋 Found ${collections.length} collections:`);
    collections.forEach((collection, index) => {
      console.log(`   ${index + 1}. ${collection.name}`);
    });

    console.log('\n🗑️  Dropping all collections...');

    // Drop each collection
    const dropPromises = collections.map(async (collection) => {
      const collectionName = collection.name;
      try {
        await db?.collection(collectionName).drop();
        console.log(`   ✅ Dropped: ${collectionName}`);
      } catch (error: any) {
        // If collection doesn't exist, that's fine
        if (error.code === 26) {
          console.log(`   ⚠️  Collection ${collectionName} doesn't exist (already empty)`);
        } else {
          console.error(`   ❌ Error dropping ${collectionName}:`, error.message);
        }
      }
    });

    await Promise.all(dropPromises);

    // Verify database is empty
    const remainingCollections = await db?.listCollections().toArray();
    const remainingCount = remainingCollections?.length || 0;

    console.log('\n📊 Flush Summary:');
    console.log(`   Collections dropped: ${collections.length}`);
    console.log(`   Remaining collections: ${remainingCount}`);

    if (remainingCount === 0) {
      console.log('🎉 Database successfully flushed! All data has been removed.');
    } else {
      console.log('⚠️  Some collections may still remain:');
      remainingCollections?.forEach(col => console.log(`     - ${col.name}`));
    }

  } catch (error) {
    console.error('💥 Error during database flush:', error);
    process.exit(1);
  } finally {
    console.log('🔌 Closing database connection...');
    await mongoose.disconnect();
    console.log('✅ Database connection closed');
    process.exit(0);
  }
}

// Run the flush operation
console.log('🚨 DATABASE FLUSH OPERATION 🚨');
console.log('This script will permanently delete ALL data in your database.');
console.log('Make sure you have backups if you need to recover any data.');
console.log('\nStarting in 3 seconds...');

setTimeout(() => {
  flushDatabase().catch(console.error);
}, 3000);
