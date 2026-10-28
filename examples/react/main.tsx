import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import clsx from 'clsx';
import { title } from './title';
import './style.css';

function App() {
  const [done, setDone] = useState(false);
  return (
    <main>
      <p className="eyebrow">A tiny app, built in a Worker</p>
      <h1>{title}</h1>
      <button className={clsx('task', { done })} onClick={() => setDone(!done)}>
        {done ? '✓ Shipped my first app' : 'Ship my first app'}
      </button>
      <p>Edit the title or CSS, then build again.</p>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
