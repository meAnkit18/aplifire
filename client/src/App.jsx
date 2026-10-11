import { useEffect, useState } from 'react';
import { routeFor } from './route.js';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Upload from './pages/Upload.jsx';
import Privacy from './pages/Privacy.jsx';
export default function App() {
  const [route, setRoute] = useState(routeFor(window.location.hash));
  const [authed, setAuthed] = useState(!!localStorage.getItem('token'));
  const [view, setView] = useState('dash');
  const [selected, setSelected] = useState([]);
  useEffect(() => {
    const onHash = () => setRoute(routeFor(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  if (route === 'privacy') {
    return (
      <div style={{ minHeight: '100vh', background: '#0b0d12' }}>
        <Privacy />
      </div>
    );
  }
  if (!authed) return <Login onDone={() => setAuthed(true)} />;
  return (
    <div style={{ minHeight: '100vh', background: '#0b0d12' }}>
      <header style={s.head}>
        <b>Amplifier</b>
        <button style={s.link} onClick={() => setView('dash')}>Dashboard</button>
        <button style={s.link} onClick={() => setView('upload')}>Upload</button>
        <button style={s.link} onClick={() => { localStorage.removeItem('token'); setAuthed(false); }}>Logout</button>
      </header>
      {view === 'dash'
        ? <Dashboard selected={selected} setSelected={setSelected} onUpload={() => setView('upload')} />
        : <Upload selected={selected} />}
    </div>
  );
}
const s = {
  head: { display: 'flex', gap: 14, alignItems: 'center', padding: '12px 16px', background: '#0b0d12', color: '#fff', borderBottom: '1px solid #1d2330' },
  link: { background: 'transparent', border: 0, color: '#9aa3b5', cursor: 'pointer', fontSize: 14 },
};
