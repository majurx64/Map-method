import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

if (window.location.hostname === 'map-method-chi.vercel.app') {
  window.location.replace(
    `https://www.mapmethod.ru${window.location.pathname}${window.location.search}${window.location.hash}`,
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
