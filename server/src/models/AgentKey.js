import mongoose from 'mongoose';

export const AgentKey = mongoose.model('AgentKey', new mongoose.Schema({
  keyHash: { type: String, required: true, unique: true },
  prefix: String,
  label: { type: String, default: 'agent' },
  lastUsedAt: Date,
}, { timestamps: true }));
