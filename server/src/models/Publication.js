import mongoose from 'mongoose';
export const Publication = mongoose.model('Publication', new mongoose.Schema({
  videoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Video' },
  channelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel' },
  status: { type: String, enum: ['queued', 'uploading', 'processing', 'succeeded', 'failed'], default: 'queued' },
  youtubeVideoId: String, error: { code: String, message: String },
}, { timestamps: true }));
