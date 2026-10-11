import { useState } from 'react';
import { api } from '../api.js';
export default function Login({ onDone }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  async function submit(e) {
    e.preventDefault();
    setErr('');
    const r = await api.login(email, password);
    if (r.token) { localStorage.setItem('token', r.token); onDone(); }
    else setErr(r.error || 'login failed');
  }
  return (
    <div style={s.wrap}>
      <form onSubmit={submit} style={s.card}>
        <h1 style={s.title}>Amplifier</h1>
        <p style={s.sub}>Personal YouTube control center</p>
        <input style={s.input} placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input style={s.input} placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {err && <div style={s.err}>{err}</div>}
        <button style={s.btn} type="submit">Sign in</button>
      </form>
    </div>
  );
}
const s = {
  wrap: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0b0d12', color: '#e8eaf0' },
  card: { width: 340, padding: 28, borderRadius: 14, background: '#141821', border: '1px solid #262d3d', display: 'flex', flexDirection: 'column', gap: 12 },
  title: { margin: 0, fontSize: 28 },
  sub: { margin: '0 0 8px', color: '#9aa3b5', fontSize: 14 },
  input: { padding: '10px 12px', borderRadius: 8, border: '1px solid #2c3446', background: '#0f131b', color: '#fff' },
  err: { color: '#ff7a7a', fontSize: 13 },
  btn: { padding: 11, borderRadius: 8, border: 0, background: '#5b6cff', color: '#fff', fontWeight: 700, cursor: 'pointer' },
};
