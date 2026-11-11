import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { initTheme } from './lib/theme'
import './themes.css'
import './styles.css'

// Áp theme trước khi vẽ lần đầu (cửa sổ chỉ hiện khi ready-to-show)
initTheme()

// macOS: cửa sổ dùng vibrancy, sidebar trong mờ
if (window.nibmark?.platform === 'darwin') document.documentElement.classList.add('vibrant')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
