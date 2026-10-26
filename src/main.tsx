import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './ErrorBoundary'
import './index.css'

// Older versions cached Firestore and Firebase API responses in the service
// worker; those caches could hold signed-in data after sign-out. Remove them.
if ('caches' in window) {
  for (const name of ['firestore-cache', 'firebase-cache']) {
    void caches.delete(name);
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)

