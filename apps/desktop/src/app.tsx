import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

type Thread = { id: string; name: string; active: boolean; saved_at: string; checkpoint?: { text: string } | null };
type Status = { capture_state: string; active_thread: Thread | null; persistence_state: string; thread_count: number };

export function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setStatus(await invoke<Status>('get_status'));
      setThreads(await invoke<Thread[]>('list_threads'));
      setError(null);
    } catch (reason) { setError(String(reason)); }
  }

  useEffect(() => { void refresh(); }, []);

  async function startThread() {
    const trimmed = name.trim();
    if (!trimmed) return;
    try { await invoke('start_thread', { name: trimmed }); setName(''); await refresh(); }
    catch (reason) { setError(String(reason)); }
  }

  async function stopThread() {
    try { await invoke('stop_thread'); await refresh(); }
    catch (reason) { setError(String(reason)); }
  }

  async function pause() {
    try { await invoke('set_capture_paused', { paused: status?.capture_state !== 'paused' }); await refresh(); }
    catch (reason) { setError(String(reason)); }
  }

  return <main className="shell">
    <header><div><p className="eyebrow">LOCAL-FIRST CONTEXT CONTINUITY</p><h1>Ariadne</h1><p className="subtitle">The thread needed to find the way back.</p></div><button className="quiet" onClick={pause}>{status?.capture_state === 'paused' ? 'Resume capture' : 'Pause capture'}</button></header>
    {error && <div className="error">{error}</div>}
    <section className="hero"><div><span className="status-dot" /> {status?.capture_state ?? 'loading'} · {status?.persistence_state ?? 'checking storage'}</div><div className="active">{status?.active_thread ? `Active: ${status.active_thread.name}` : 'No active Thread'}</div></section>
    <section className="card"><h2>Start a Thread</h2><div className="row"><input value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void startThread(); }} placeholder="What are you working on?" maxLength={120} /><button onClick={startThread}>Start</button>{status?.active_thread && <button className="danger" onClick={stopThread}>Stop</button>}</div><p className="hint">Ariadne records bounded facts, not everything that happened.</p></section>
    <section><div className="section-title"><h2>Recent Threads</h2><span>{threads.length}</span></div>{threads.length === 0 ? <div className="empty">Your saved Threads will appear here.</div> : <div className="threads">{threads.map((thread) => <article className="thread" key={thread.id}><div><h3>{thread.name}</h3><p>{thread.active ? 'Active now' : `Saved ${new Date(thread.saved_at).toLocaleString()}`}</p>{thread.checkpoint && <blockquote>{thread.checkpoint.text}</blockquote>}</div><button className="quiet" onClick={() => void invoke('resume_thread', { id: thread.id }).then(refresh).catch(setError)}>Resume</button></article>)}</div>}</section>
    <footer><span>Local data only</span><span>No accounts · No AI · No telemetry</span></footer>
  </main>;
}
