import { memo } from 'react';
import { Handle, Position } from 'reactflow';
const dot = { queued: '#9aa3b5', uploading: '#f5b544', processing: '#f5b544', succeeded: '#3ddc84', failed: '#ff6b6b' };
function ChannelNode({ data }) {
  const c = dot[data.status] || '#9aa3b5';
  return (
    <div style={{ ...s.card, borderColor: c }}>
      <Handle type="target" position={Position.Left} />
      {data.thumbnail && <img src={data.thumbnail} alt="" style={s.img} />}
      <div style={s.title}>{data.label}</div>
      <div style={{ ...s.badge, background: c }}>{data.selected ? `${data.status} • selected` : data.status}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
const s = {
  card: { width: 190, padding: 12, borderRadius: 12, background: '#141821', border: '2px solid #333', color: '#fff', textAlign: 'center' },
  img: { width: 44, height: 44, borderRadius: '50%' },
  title: { fontWeight: 700, fontSize: 14, margin: '6px 0' },
  badge: { display: 'inline-block', fontSize: 11, padding: '2px 8px', borderRadius: 20, color: '#0b0d12', fontWeight: 700 },
};
export default memo(ChannelNode);
