import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/cinzel';
import '@fontsource-variable/manrope';
import '@fontsource-variable/jetbrains-mono';
import './styles/index.css';
import { handleOAuthCallback } from './cloud/callback';

// The OAuth callback decides which account database opens, so it must finish before the app
// (and the module-level Dexie instance) is imported. Without ?auth=callback this resolves at once.
async function boot() {
  await handleOAuthCallback();
  const { default: App } = await import('./app/App');
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
