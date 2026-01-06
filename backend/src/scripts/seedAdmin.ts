import mongoose from 'mongoose';
import Admin from '../models/Admin';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load .env from backend directory
const envPath = path.join(__dirname, '..', '..', '.env');
console.log('📂 Looking for .env at:', envPath);
console.log('📂 File exists:', fs.existsSync(envPath));

const result = dotenv.config({ path: envPath });
if (result.error) {
  console.error('❌ Error loading .env:', result.error);
}

const MONGODB_URI = process.env.MONGODB_URI;
console.log('📝 MONGODB_URI from env:', MONGODB_URI ? MONGODB_URI.substring(0, 40) + '...' : 'NOT SET');

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in .env file');
  process.exit(1);
}

console.log('📝 Using MongoDB URI:', MONGODB_URI.replace(/:([^:@]{1,}@)/, ':***@'));

async function seedAdmin() {
  try {
    await mongoose.connect(MONGODB_URI as string);
    console.log('Connected to MongoDB');

    const existing = await Admin.findOne({ email: 'admin@secondbrain.com' });
    
    if (!existing) {
      await Admin.create({
        email: 'admin@secondbrain.com',
        password: 'admin123', // Change in production!
        name: 'Admin',
        role: 'superadmin'
      });
      console.log('✅ Default admin created: admin@secondbrain.com / admin123');
    } else {
      console.log('ℹ️ Admin already exists');
    }

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Error seeding admin:', error);
    process.exit(1);
  }
}

seedAdmin();
