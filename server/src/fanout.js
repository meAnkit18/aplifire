import { Readable } from 'node:stream';
import { Publication } from './models/Publication.js';
import { Video } from './models/Video.js';
import { Channel } from './models/Channel.js';
import { authedYoutube } from './youtube.js';
import { getRefreshToken } from './routes/channels.js';
export const nextStatus = (s) => s === 'uploading' ? 'processing' : 'succeeded';
export async function publishOne(pubId) {
  const pub = await Publication.findById(pubId);
  if (!pub) throw new Error('publication not found');
  const video = await Video.findById(pub.videoId);
  const channel = await Channel.findById(pub.channelId);
  try {
    pub.status = 'uploading'; await pub.save();
    const yt = authedYoutube(getRefreshToken(channel));
    const resp = await fetch(video.cloudinaryUrl);
    if (!resp.ok) throw new Error(`cloudinary fetch ${resp.status}`);
    const buf = Buffer.from(await resp.arrayBuffer());
    const { data } = await yt.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: { title: video.metadata?.title || 'Untitled', description: video.metadata?.description || '', tags: video.metadata?.tags || [], categoryId: '22' },
        status: { privacyStatus: video.metadata?.privacy || 'private' },
      },
      media: { mimeType: 'video/*', body: Readable.from(buf) },
    });
    pub.status = 'processing'; pub.youtubeVideoId = data.id; await pub.save();
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 10000));
      const { data: v } = await yt.videos.list({ id: [data.id], part: ['status'] });
      if (v.items?.[0]?.status?.uploadStatus === 'processed') break;
    }
    pub.status = 'succeeded'; await pub.save();
  } catch (e) {
    pub.status = 'failed'; pub.error = { code: e.code || 'UNKNOWN', message: String(e.message || e).slice(0, 500) }; await pub.save();
    if (String(e.message).includes('invalid_grant')) await Channel.findByIdAndUpdate(channel.id, { status: 'needsReconnect' });
  }
}
export function fanout(publicationIds) { publicationIds.forEach((id) => publishOne(id)); }
