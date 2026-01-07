import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import CardTest from './pages/CardTest'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      {new URLSearchParams(window.location.search).get('test') === 'card' ? (
        <CardTest />
      ) : (
        <App />
      )}
    </BrowserRouter>
  </StrictMode>,
)
