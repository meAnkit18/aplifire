import { useEffect, useState } from 'react';
import { api } from '../api.js';
export default function Analytics() {
  const [range, setRange] = useState('28d');
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const [detail, setDetail] = useState({});
  const [busy, setBusy] = useState('');
  async function load(r = range) {
    setBusy('Loading…');
    try { setData(await api.overview(r)); } catch (e) { alert(e.message); }
    setBusy('');
  }
  useEffect(() => { load(); }, []);
  async function expand(videoId) {
    setOpen(open === videoId ? null : videoId);
    if (!detail[videoId]) {
      const d = await api.videoAnalytics(videoId, range);
      setDetail((prev) => ({ ...prev, [videoId]: d }));
    }
  }
  async function refresh(videoId) {
    setBusy('Refreshing…');
    const r = await api.refreshAnalytics(videoId ? { videoId } : {});
    setBusy('');
    if (r.retryAfterSec) { alert(`Throttled — retry in ${r.retryAfterSec}s`); return; }
    await load();
  }
  const t = data?.totals || {};
  return (
    <div style={s.wrap}>
      <div style={s.bar}>
        <h2 style={{ margin: 0 }}>Analytics</h2>
        <select style={s.input} value={range} onChange={(e) => { setRange(e.target.value); load(e.target.value); }}>
          <option value="7d">Last 7 days</option><option value="28d">Last 28 days</option><option value="90d">Last 90 days</option>
        </select>
        <button style={s.btn} onClick={() => refresh()} disabled={!!busy}>{busy || 'Refresh all'}</button>
      </div>
      <div style={s.cards}>
        {[['Views', t.views], ['Watch hrs', ((t.watchMinutes || 0) / 60).toFixed(1)], ['Likes', t.likes], ['Comments', t.comments], ['Subs gained', t.subsGained]].map(([k, v]) => (
          <div key={k} style={s.card}><div style={s.k}>{k}</div><div style={s.v}>{v ?? 0}</div></div>
        ))}
      </div>
      {(data?.perVideo || []).map((v) => (
        <div key={v.videoId} style={s.row}>
          <button style={s.title} onClick={() => expand(v.videoId)}>{v.title} — {v.totals.views} views · {v.channels} channels</button>
          <button style={s.mini} onClick={() => refresh(v.videoId)}>Refresh</button>
          {open === v.videoId && detail[v.videoId] && (
            <div style={s.sub}>
              {detail[v.videoId].channels.map((c) => (
                <div key={c.publicationId} style={s.subRow}>
                  <span>{c.channelTitle}</span>
                  <span>{c.stats.views} views · {c.stats.likes} likes · {c.stats.comments} comments</span>
                  {c.youtubeVideoId && <a style={{ color: '#5b6cff' }} href={`https://youtu.be/${c.youtubeVideoId}`} target="_blank" rel="noreferrer">watch</a>}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
const s = {
  wrap: { maxWidth: 760, margin: '0 auto', padding: 20, color: '#fff' },
  bar: { display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 },
  input: { padding: '8px 10px', borderRadius: 8, border: '1px solid #2c3446', background: '#0f131b', color: '#fff' },
  btn: { padding: '8px 14px', borderRadius: 8, border: 0, background: '#5b6cff', color: '#fff', fontWeight: 700, cursor: 'pointer' },
  cards: { display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: 14 },
  card: { background: '#141821', border: '1px solid #262d3d', borderRadius: 12, padding: 12 },
  k: { fontSize: 12, color: '#9aa3b5' }, v: { fontSize: 20, fontWeight: 800 },
  row: { background: '#141821', border: '1px solid #262d3d', borderRadius: 12, padding: 12, marginBottom: 10 },
  title: { background: 'transparent', border: 0, color: '#fff', fontWeight: 700, cursor: 'pointer', textAlign: 'left' },
  mini: { background: 'transparent', border: '1px solid #5b6cff', color: '#fff', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', marginLeft: 8 },
  sub: { marginTop: 10, borderTop: '1px solid #222', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 },
  subRow: { display: 'flex', gap: 10, fontSize: 13, color: '#c6cddb', alignItems: 'center' },
};
