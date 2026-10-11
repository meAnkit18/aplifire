import { useCallback, useEffect, useState } from 'react';
import ReactFlow, { Background, Controls, MiniMap } from 'reactflow';
import 'reactflow/dist/style.css';
import { api } from '../api.js';
import ChannelNode from '../components/ChannelNode.jsx';
const nodeTypes = { channel: ChannelNode };
export default function Dashboard({ selected, setSelected, onUpload }) {
  const [channels, setChannels] = useState([]);
  const [detail, setDetail] = useState(null);
  const load = useCallback(async () => {
    const list = await api.channels();
    if (Array.isArray(list)) setChannels(list);
  }, []);
  useEffect(() => { load(); }, [load]);
  async function addChannel() {
    const { url } = await api.oauthUrl();
    if (url) window.location.href = url;
  }
  const nodes = [
    { id: 'main', position: { x: 60, y: 160 }, data: { label: 'Control Center' }, style: { width: 200, padding: 14, borderRadius: 14, background: '#5b6cff', color: '#fff', fontWeight: 800, textAlign: 'center' } },
    ...channels.map((c, i) => ({
      id: c._id, type: 'channel', position: { x: 420, y: 40 + i * 130 },
      data: { label: c.title, thumbnail: c.thumbnail, status: c.status === 'needsReconnect' ? 'failed' : 'queued', selected: selected.includes(c._id) },
    })),
  ];
  const edges = channels.map((c) => ({ id: `e-main-${c._id}`, source: 'main', target: c._id, animated: true, style: { stroke: selected.includes(c._id) ? '#3ddc84' : '#39415a', strokeWidth: 2 } }));
  return (
    <div style={{ height: 'calc(100vh - 56px)' }}>
      <div style={s.bar}>
        <button style={s.btn} onClick={addChannel}>+ Connect channel</button>
        <button style={s.btn2} onClick={onUpload}>Upload & Publish</button>
        <span style={s.count}>{channels.length} channels • {selected.length} selected</span>
      </div>
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodeClick={(_, n) => {
        if (n.id === 'main') return;
        const c = channels.find((x) => x._id === n.id);
        setDetail(c || null);
        setSelected((prev) => prev.includes(n.id) ? prev.filter((x) => x !== n.id) : [...prev, n.id]);
      }} fitView>
        <Background /><Controls /><MiniMap />
      </ReactFlow>
      {detail && (
        <div style={s.detail}>
          <b>{detail.title}</b>
          <div style={{ fontSize: 12, color: '#9aa3b5' }}>{detail.youtubeChannelId} • {detail.status}</div>
          <button style={s.danger} onClick={async () => { await api.removeChannel(detail._id); setDetail(null); setSelected((p) => p.filter((x) => x !== detail._id)); load(); }}>Disconnect</button>
          <button style={s.x} onClick={() => setDetail(null)}>Close</button>
        </div>
      )}
    </div>
  );
}
const s = {
  bar: { display: 'flex', gap: 10, alignItems: 'center', padding: '10px 14px', background: '#0b0d12', color: '#fff' },
  btn: { padding: '8px 14px', borderRadius: 8, border: 0, background: '#5b6cff', color: '#fff', fontWeight: 700, cursor: 'pointer' },
  btn2: { padding: '8px 14px', borderRadius: 8, border: '1px solid #5b6cff', background: 'transparent', color: '#fff', fontWeight: 700, cursor: 'pointer' },
  count: { marginLeft: 'auto', color: '#9aa3b5', fontSize: 13 },
  detail: { position: 'fixed', right: 16, bottom: 16, width: 260, background: '#141821', color: '#fff', border: '1px solid #2c3446', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 },
  danger: { background: '#3a1620', color: '#ff8a8a', border: '1px solid #6b2233', borderRadius: 8, padding: 8, cursor: 'pointer' },
  x: { background: 'transparent', color: '#9aa3b5', border: 0, cursor: 'pointer' },
};
