import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/cinzel';
import '@fontsource-variable/manrope';
import '@fontsource-variable/jetbrains-mono';
import './styles/index.css';

function Placeholder() {
  return <main className="atmosphere grid min-h-full place-items-center font-display text-3xl">Ascend</main>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Placeholder />
  </StrictMode>,
);
