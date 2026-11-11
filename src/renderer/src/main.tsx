import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { initTheme } from './lib/theme'
import './themes.css'
import './styles.css'

// Áp theme trước khi vẽ lần đầu (cửa sổ chỉ hiện khi ready-to-show)
initTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
