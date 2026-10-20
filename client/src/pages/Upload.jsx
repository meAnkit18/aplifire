import { useEffect, useState } from 'react';
import { api } from '../api.js';
export default function Upload({ selected, presetChannels }) {
  const [file, setFile] = useState(null);
  const [video, setVideo] = useState(null);
  const [meta, setMeta] = useState({ title: '', description: '', tags: '', privacy: 'private' });
  const [channels, setChannels] = useState(presetChannels || []);
  const [ids, setIds] = useState(selected);
  const [pubs, setPubs] = useState([]);
  const [busy, setBusy] = useState('');
  const [link, setLink] = useState('');
  useEffect(() => { if (!presetChannels) api.channels().then((l) => Array.isArray(l) && setChannels(l)); }, [presetChannels]);
  useEffect(() => { setIds(selected); }, [selected]);
  async function doUpload() {
    if (!file) return;
    setBusy('Uploading to Cloudinary…');
    const fd = new FormData();
    fd.append('file', file);
    const r = await api.upload(fd);
    setBusy('');
    if (r.videoId) setVideo(r);
    else alert(r.error || 'upload failed');
  }
  async function doPublish() {
    setBusy('Publishing…');
    const r = await api.publish({ videoId: video.videoId, channelIds: ids, metadata: { ...meta, tags: meta.tags.split(',').map((t) => t.trim()).filter(Boolean) } });
    setBusy('');
    if (r.ids) {
      const tick = async () => setPubs(await api.pubs(video.videoId));
      await tick();
      const iv = setInterval(async () => {
        const list = await api.pubs(video.videoId);
        setPubs(list);
        if (list.length && list.every((p) => ['succeeded', 'failed'].includes(p.status))) clearInterval(iv);
      }, 5000);
    } else alert(r.error || 'publish failed');
  }
  return (
    <div style={s.wrap}>
      <h2 style={{ margin: '4px 0 12px' }}>Upload once → publish to selected channel(s)</h2>
      <div style={s.card}>
        <input style={s.input} placeholder="Paste Instagram reel link…" value={link} onChange={(e) => setLink(e.target.value)} />
        <button style={s.btn} onClick={async () => {
          if (!link) return;
          setBusy('Fetching reel…');
          try {
            const r = await api.importReel(link);
            if (!r.videoId) { alert(r.error || 'import failed'); return; }
            setVideo({ videoId: r.videoId, url: r.url });
            setLink('');
            if (r.metadata) setMeta({ title: r.metadata.title || '', description: r.metadata.description || '', tags: (r.metadata.tags || []).join(', '), privacy: r.metadata.privacy || 'public' });
            else setMeta((m) => ({ ...m, privacy: 'public' }));
            const list = await api.channels();
            if (Array.isArray(list)) {
              setChannels(list);
              // Keep only channels the user explicitly selected; never auto-target every channel.
              setIds((prev) => prev.filter((id) => list.some((c) => c._id === id)));
            }
          } catch (e) { alert(`import failed: ${e.message}`); } finally { setBusy(''); }
        }} disabled={busy}>{busy || 'Import reel'}</button>
      </div>
      {!video ? (
        <div style={s.card}>
          <input type="file" accept="video/*" onChange={(e) => setFile(e.target.files[0])} />
          <button style={s.btn} onClick={doUpload} disabled={!file || busy}>{busy || 'Upload'}</button>
        </div>
      ) : (
        <div style={s.card}>
          <video src={video.url} controls style={{ width: '100%', borderRadius: 8 }} />
          <input style={s.input} placeholder="Title" value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} />
          <textarea style={s.input} rows={3} placeholder="Description" value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} />
          <input style={s.input} placeholder="Tags (comma separated)" value={meta.tags} onChange={(e) => setMeta({ ...meta, tags: e.target.value })} />
          <select style={s.input} value={meta.privacy} onChange={(e) => setMeta({ ...meta, privacy: e.target.value })}>
            <option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option>
          </select>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {channels.map((c) => (
              <label key={c._id} style={s.check}><input type="checkbox" checked={ids.includes(c._id)} onChange={() => setIds((p) => p.includes(c._id) ? p.filter((x) => x !== c._id) : [...p, c._id])} /> {c.title}</label>
            ))}
          </div>
          <button style={s.btn} onClick={doPublish} disabled={!ids.length || busy}>{busy || `Publish to ${ids.length} channel(s)`}</button>
        </div>
      )}
      {pubs.length > 0 && (
        <div style={s.card}>
          <h3 style={{ margin: '0 0 8px' }}>Status</h3>
          {pubs.map((p) => (
            <div key={p._id} style={s.row}>
              <span>{p.channelId?.title || p.channelId}</span>
              <b style={{ color: p.status === 'succeeded' ? '#3ddc84' : p.status === 'failed' ? '#ff6b6b' : '#f5b544' }}>{p.status}</b>
              {p.youtubeVideoId && <a style={{ color: '#5b6cff' }} href={`https://youtu.be/${p.youtubeVideoId}`} target="_blank" rel="noreferrer">watch</a>}
              {p.error?.message && <span style={{ color: '#ff8a8a', fontSize: 12 }}>{p.error.message}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
const s = {
  wrap: { maxWidth: 640, margin: '0 auto', padding: 20, color: '#fff' },
  card: { background: '#141821', border: '1px solid #262d3d', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 },
  input: { padding: '10px 12px', borderRadius: 8, border: '1px solid #2c3446', background: '#0f131b', color: '#fff' },
  btn: { padding: 11, borderRadius: 8, border: 0, background: '#5b6cff', color: '#fff', fontWeight: 700, cursor: 'pointer' },
  check: { fontSize: 14, display: 'flex', gap: 8, alignItems: 'center' },
  row: { display: 'flex', gap: 10, alignItems: 'center', fontSize: 14, padding: '6px 0', borderTop: '1px solid #222' },
};
