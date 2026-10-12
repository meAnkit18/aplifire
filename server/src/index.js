import 'dotenv/config';
import mongoose from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';
import cron from 'node-cron';
import { createApp } from './app.js';
import { runCleanup } from './cleanup.js';
import { runAnalyticsSync } from './syncAnalytics.js';
import { config } from './config.js';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const app = createApp();
if (config.mongoUri) await mongoose.connect(config.mongoUri);
cron.schedule('*/10 * * * *', () => runCleanup().catch((e) => console.error('cleanup cron', e.message)));
cron.schedule('17 3 * * *', () => runAnalyticsSync().catch((e) => console.error('analytics cron', e.message)));

app.listen(config.port, () => console.log(`api:${config.port}`));
