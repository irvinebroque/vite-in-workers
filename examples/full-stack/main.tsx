import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import clsx from 'clsx';
import { title } from './title';
import './style.css';

function App() {
  const [task, setTask] = useState<{ done: boolean; label: string; message: string; runtime: string }>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function loadTask(done?: boolean) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('./api/task', {
        method: done === undefined ? 'GET' : 'POST',
        credentials: 'omit',
        headers: done === undefined ? undefined : { 'content-type': 'application/json' },
        body: done === undefined ? undefined : JSON.stringify({ done })
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error ?? 'Server request failed');
      setTask(result);
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => { void loadTask(); }, []);
  return (
    <main>
      <p className="eyebrow">Client and server, built in Workers</p>
      <h1>{title}</h1>
      <button disabled={busy || !task} className={clsx('task', { done: task?.done })} onClick={() => loadTask(!task?.done)}>
        {task?.label ?? 'Loading from server…'}
      </button>
      <p data-testid="server-message">{task?.message}</p>
      <p data-testid="server-runtime">{task && `Server runtime: ${task.runtime}`}</p>
      {error && <p role="alert">{error}</p>}
      <p>Edit server.ts, then build again to change the server response.</p>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
