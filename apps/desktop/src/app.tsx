import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

type Checkpoint = { text: string; created_at: string };
type Thread = {
  id: string;
  name: string;
  active: boolean;
  saved_at: string;
  workspace?: string | null;
  repository?: string | null;
  checkpoint?: Checkpoint | null;
  artifacts?: Array<{ display_name: string; kind: string; visit_count: number; edit_count: number }>;
  timeline?: Array<{ timestamp: string; event_type: string; count: number }>;
  references?: Array<{ url: string; title?: string | null }>;
};
type Status = {
  capture_state: string;
  active_thread: Thread | null;
  persistence_state: string;
  sensor_state: string;
  thread_count: number;
};
type CapturePolicy = {
  excluded_applications: string[];
  excluded_browser_domains: string[];
  capture_private_browsing: boolean;
};

function readableState(value: string): string {
  return value.replaceAll('_', ' ');
}

export function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [name, setName] = useState('');
  const [checkpoint, setCheckpoint] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [policy, setPolicy] = useState<CapturePolicy | null>(null);
  const [excludedApplications, setExcludedApplications] = useState('');
  const [excludedDomains, setExcludedDomains] = useState('');
  const [dataLocation, setDataLocation] = useState('');

  async function refresh() {
    try {
      setStatus(await invoke<Status>('get_status'));
      setThreads(await invoke<Thread[]>('list_threads'));
      const nextPolicy = await invoke<CapturePolicy>('get_capture_policy');
      setPolicy(nextPolicy);
      setExcludedApplications(nextPolicy.excluded_applications.join('\n'));
      setExcludedDomains(nextPolicy.excluded_browser_domains.join('\n'));
      setDataLocation(await invoke<string>('get_data_location'));
      setError(null);
    } catch (reason) {
      setError(String(reason));
    }
  }

  useEffect(() => {
    void refresh();
    let unlisten: (() => void) | undefined;
    void listen('ariadne-state-changed', () => {
      void refresh();
    }).then((dispose) => {
      unlisten = dispose;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<string>('ariadne-tray-command', ({ payload }) => {
      const commands: Record<string, () => Promise<unknown>> = {
        start: () => invoke('start_thread', { name: 'Untitled Thread' }),
        recent: () => invoke('save_recent_context', { name: 'Recent context' }),
        stop: () => invoke('stop_thread'),
        pause: () => invoke('set_capture_paused', { paused: true }),
        resume: () => invoke('set_capture_paused', { paused: false }),
        settings: async () => {
          document.getElementById('privacy-settings')?.scrollIntoView({ behavior: 'smooth' });
        },
        checkpoint: async () => {
          document.getElementById('checkpoint-input')?.scrollIntoView({ behavior: 'smooth' });
          window.setTimeout(() => document.getElementById('checkpoint-input')?.focus(), 0);
        },
      };
      const command = commands[payload];
      if (command) void command().then(refresh).catch((reason) => setError(String(reason)));
    }).then((dispose) => {
      unlisten = dispose;
    });
    return () => unlisten?.();
  }, []);

  async function startThread() {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await invoke('start_thread', { name: trimmed });
      setName('');
      await refresh();
    } catch (reason) {
      setError(String(reason));
    }
  }

  async function saveRecentContext() {
    const trimmed = name.trim() || 'Recent context';
    try {
      await invoke('save_recent_context', { name: trimmed });
      setName('');
      await refresh();
    } catch (reason) {
      setError(String(reason));
    }
  }

  async function stopThread() {
    try {
      await invoke('stop_thread');
      await refresh();
    } catch (reason) {
      setError(String(reason));
    }
  }

  async function resumeAndOpen(id: string) {
    try {
      await invoke('resume_thread', { id });
      await invoke('execute_resume_actions', { id });
      await refresh();
    } catch (reason) {
      setError(String(reason));
    }
  }

  async function pauseManually() {
    try {
      await invoke('set_capture_paused', {
        paused: status?.capture_state !== 'paused',
      });
      await refresh();
    } catch (reason) {
      setError(String(reason));
    }
  }

  async function pauseFor(minutes: number) {
    try {
      await invoke('set_timed_pause', { minutes });
      await refresh();
    } catch (reason) {
      setError(String(reason));
    }
  }

  async function savePrivacySettings() {
    try {
      await invoke('set_capture_exclusions', {
        applications: excludedApplications.split(/[\n,]/),
        domains: excludedDomains.split(/[\n,]/),
      });
      await refresh();
    } catch (reason) {
      setError(String(reason));
    }
  }

  async function saveCheckpoint() {
    try {
      await invoke('set_checkpoint', { text: checkpoint.trim() || null });
      setCheckpoint('');
      await refresh();
    } catch (reason) {
      setError(String(reason));
    }
  }

  async function deleteThread(id: string) {
    if (!window.confirm('Delete this Thread permanently?')) return;
    try {
      await invoke('delete_thread', { id });
      await refresh();
    } catch (reason) {
      setError(String(reason));
    }
  }

  async function deleteAll() {
    if (!window.confirm('Delete all Ariadne data permanently?')) return;
    try {
      await invoke('delete_all_data');
      await refresh();
    } catch (reason) {
      setError(String(reason));
    }
  }

  const active = status?.active_thread;

  return (
    <main className="shell">
      <header>
        <div>
          <p className="eyebrow">LOCAL-FIRST CONTEXT CONTINUITY</p>
          <h1>Ariadne</h1>
          <p className="subtitle">The thread needed to find the way back.</p>
        </div>
        <div className="actions">
          <button className="quiet" onClick={() => void pauseFor(15)}>15 min</button>
          <button className="quiet" onClick={() => void pauseFor(60)}>1 hour</button>
          <button className="quiet" onClick={() => void pauseManually()}>
            {status?.capture_state === 'paused' ? 'Resume capture' : 'Pause capture'}
          </button>
        </div>
      </header>

      {error && <div className="error" role="alert">{error}</div>}

      <section className="hero">
        <div>
          <span className="status-dot" />
          {readableState(status?.capture_state ?? 'loading')}
          <span className="muted"> · sensor {readableState(status?.sensor_state ?? 'checking')}</span>
          <span className="muted"> · storage {readableState(status?.persistence_state ?? 'checking')}</span>
        </div>
        <div className="active">{active ? `Active: ${active.name}` : 'No active Thread'}</div>
      </section>

      <section className="card" id="privacy-settings">
        <h2>Start or save context</h2>
        <div className="row">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void startThread();
            }}
            placeholder="What are you working on?"
            maxLength={120}
          />
          <button onClick={() => void startThread()}>Start Thread</button>
          <button className="quiet" onClick={() => void saveRecentContext()}>Save Recent Context</button>
          {active && <button className="danger" onClick={() => void stopThread()}>Stop</button>}
        </div>
        <p className="hint">
          Start begins capture from now. Save Recent Context uses the bounded rolling buffer.
        </p>
      </section>

      {active && (
        <section className="card">
          <h2>Checkpoint</h2>
          <div className="row">
            <input
              id="checkpoint-input"
              value={checkpoint}
              onChange={(event) => setCheckpoint(event.target.value)}
              placeholder="What should you remember?"
              maxLength={2000}
            />
            <button onClick={() => void saveCheckpoint()}>Save checkpoint</button>
            <button className="quiet" onClick={() => void invoke('set_checkpoint', { text: null }).then(refresh).catch((reason) => setError(String(reason)))}>
              Clear
            </button>
          </div>
          <p className="hint">Checkpoint text is always written by you; Ariadne never invents it.</p>
        </section>
      )}

      <section className="card">
        <h2>Privacy and settings</h2>
        <p className="hint">Private browsing capture is {policy?.capture_private_browsing ? 'enabled' : 'off'} by default.</p>
        <div className="settings-grid">
          <label>
            Excluded applications
            <textarea value={excludedApplications} onChange={(event) => setExcludedApplications(event.target.value)} placeholder="One executable or identity per line" rows={3} />
          </label>
          <label>
            Excluded browser domains
            <textarea value={excludedDomains} onChange={(event) => setExcludedDomains(event.target.value)} placeholder="example.com" rows={3} />
          </label>
        </div>
        <div className="row">
          <button onClick={() => void savePrivacySettings()}>Save privacy settings</button>
          <button className="quiet" onClick={() => void invoke('set_start_at_login', { enabled: true }).catch((reason) => setError(String(reason)))}>Enable Start at Login</button>
          <button className="quiet" onClick={() => void invoke('set_start_at_login', { enabled: false }).catch((reason) => setError(String(reason)))}>Disable Start at Login</button>
          <button className="quiet" onClick={() => void invoke('open_logs').catch((reason) => setError(String(reason)))}>Open Logs</button>
        </div>
        <p className="hint">Data location: {dataLocation || 'loading'}</p>
      </section>

      <section>
        <div className="section-title"><h2>Recent Threads</h2><span>{threads.length}</span></div>
        {threads.length === 0 ? (
          <div className="empty">Your saved Threads will appear here.</div>
        ) : (
          <div className="threads">
            {threads.map((thread) => (
              <article className="thread" key={thread.id}>
                <div>
                  <h3>{thread.name}</h3>
                  <p>{thread.active ? 'Active now' : `Saved ${new Date(thread.saved_at).toLocaleString()}`}</p>
                  {thread.checkpoint && <blockquote>{thread.checkpoint.text}</blockquote>}
                  <p className="muted">
                    {thread.artifacts?.length ?? 0} artifacts · {thread.timeline?.length ?? 0} timeline entries
                  </p>
                </div>
                <div className="thread-actions">
                  {!thread.active && <button className="quiet" onClick={() => void resumeAndOpen(thread.id)}>Resume</button>}
                  <button className="danger" onClick={() => void deleteThread(thread.id)}>Delete</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <footer>
        <span>Local data only</span>
        <span>No accounts · No AI · No telemetry</span>
        <button className="danger" onClick={() => void deleteAll()}>Delete all data</button>
      </footer>
    </main>
  );
}
