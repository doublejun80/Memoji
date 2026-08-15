import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppProviders } from './app/AppProviders';
import './tailwind.css';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <AppProviders>
      <App />
    </AppProviders>
  </ErrorBoundary>
);
