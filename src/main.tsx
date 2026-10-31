import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './ui/styles.css';

// Links from before real page addresses used hash routes (/#/learn/pot-odds): move them to the path.
if (location.hash.startsWith('#/')) history.replaceState(null, '', location.hash.slice(1));

// The build fills #root with the page's HTML for search engines and link previews; React replaces it.
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
