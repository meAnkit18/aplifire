import { Publication } from './models/Publication.js';
import { Channel } from './models/Channel.js';
import { syncPublication } from './analytics.js';
export async function runAnalyticsSync(deps = {}) {
  const findSucceeded = deps.findSucceeded || (() => Publication.find({ status: 'succeeded' }).select('_id'));
  const pubs = await findSucceeded();
  let synced = 0, skipped = 0;
  for (const p of pubs) {
    try { await (deps.syncOne || syncPublication)(p._id || p.id); synced++; }
    catch { skipped++; }
  }
  try {
    const ids = [...new Set(pubs.map((p) => String(p.channelId || '')))].filter(Boolean);
    if (ids.length && !deps.findSucceeded) await Channel.updateMany({ _id: { $in: ids } }, { lastSyncAt: new Date() });
  } catch { /* non-fatal */ }
  return { synced, skipped };
}
