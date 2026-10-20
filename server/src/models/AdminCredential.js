import mongoose from 'mongoose';

export const AdminCredential = mongoose.model('AdminCredential', new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
}, { timestamps: true }));
