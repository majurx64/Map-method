import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Allow a direct diagnostic visit without changing the normal canonical URL.
const directCheck = new URLSearchParams(window.location.search).get('mm_direct') === '1'

if (window.location.hostname === 'map-method-chi.vercel.app' && !directCheck) {
  window.location.replace(
    `https://www.mapmethod.ru${window.location.pathname}${window.location.search}${window.location.hash}`,
  )
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  let refreshingForUpdate = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshingForUpdate) return
    refreshingForUpdate = true
    window.location.reload()
  })
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((registration) => registration.update())
      .catch(() => null)
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
