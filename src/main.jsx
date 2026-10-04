import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { rememberCollaborativeInvite } from './lib/collaboration'

// Keep the invitation before the authentication callback cleans up the URL.
rememberCollaborativeInvite()

// Allow a direct diagnostic visit without changing the normal canonical URL.
const directCheck = new URLSearchParams(window.location.search).get('mm_direct') === '1'
const updateUrl = new URL(window.location.href)
if (updateUrl.searchParams.has('site-update')) {
  updateUrl.searchParams.delete('site-update')
  window.history.replaceState(window.history.state, '', updateUrl.href)
}

if (window.location.hostname === 'map-method-chi.vercel.app' && !directCheck) {
  window.location.replace(
    `https://www.mapmethod.ru${window.location.pathname}${window.location.search}${window.location.hash}`,
  )
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  let refreshingForUpdate = false
  let hadController = Boolean(navigator.serviceWorker.controller)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // First installation only adds offline support; it must not reload the page again.
    if (!hadController) { hadController = true; return }
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
