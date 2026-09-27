import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './app/global.css';

// No StrictMode: the studio owns one WebGL context and camera stream, and the
// dev-only double mount would tear them down and recreate them.
createRoot(document.getElementById('root')!).render(<App />);
