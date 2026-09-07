import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { CircaApp } from './CircaApp';
import './styles.css';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <CircaApp />
  </StrictMode>,
);
