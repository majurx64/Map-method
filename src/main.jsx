import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { rememberCollaborativeInvite } from './lib/collaboration'

// Keep the invitation before the authentication callback cleans up the URL.
rememberCollaborativeInvite()

// Keep an explicit direct visit on this origin through navigation and auth callbacks.
const assetOriginVisit = window.location.hostname === 'map-method-chi.vercel.app'
let directCheck = new URLSearchParams(window.location.search).get('mm_direct') === '1'
if (assetOriginVisit) {
  try {
    if (directCheck) window.sessionStorage.setItem('mm-direct-origin', '1')
    else directCheck = window.sessionStorage.getItem('mm-direct-origin') === '1'
  } catch { /* A denied storage permission must not prevent startup. */ }
}
const updateUrl = new URL(window.location.href)
if (updateUrl.searchParams.has('site-update')) {
  updateUrl.searchParams.delete('site-update')
  window.history.replaceState(window.history.state, '', updateUrl.href)
}

if (assetOriginVisit && !directCheck) {
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
      .register(`/sw.js?version=${__MM_SITE_VERSION__}`, { updateViaCache: 'none' })
      .then((registration) => {
        const update = () => { if (!document.hidden) void registration.update().catch(() => null) }
        update()
        window.addEventListener('focus', update)
        window.addEventListener('online', update)
      })
      .catch(() => null)
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
