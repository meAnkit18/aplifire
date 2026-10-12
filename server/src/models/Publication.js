import mongoose from 'mongoose';
const dimEntry = new mongoose.Schema({ label: String, value: Number }, { _id: false });
export const Publication = mongoose.model('Publication', new mongoose.Schema({
  videoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Video' },
  channelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel' },
  status: { type: String, enum: ['queued', 'uploading', 'processing', 'succeeded', 'failed'], default: 'queued' },
  youtubeVideoId: String, error: { code: String, message: String },
  stats: { views: { type: Number, default: 0 }, likes: { type: Number, default: 0 }, comments: { type: Number, default: 0 }, watchMinutes: { type: Number, default: 0 }, avgViewDurationSec: { type: Number, default: 0 }, subsGained: { type: Number, default: 0 } },
  dimensions: { traffic: [dimEntry], device: [dimEntry], geo: [dimEntry], ageGender: [dimEntry] },
  statsUpdatedAt: Date,
}, { timestamps: true }));
