import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { initTheme } from './lib/theme'
import { useEditorPrefs } from './lib/editorPrefs'
import './themes.css'
import './styles.css'

// Áp theme trước khi vẽ lần đầu (cửa sổ chỉ hiện khi ready-to-show)
initTheme()

// macOS: cửa sổ dùng vibrancy, sidebar trong mờ
if (window.nibmark?.platform === 'darwin') document.documentElement.classList.add('vibrant')

// Gạch ngang task đã xong trong preview theo tùy chọn editor
const syncStrike = (on: boolean): void => void document.documentElement.classList.toggle('strike-done', on)
syncStrike(useEditorPrefs.getState().strikeDone)
const syncCodeLn = (on: boolean): void => void document.documentElement.classList.toggle('no-code-ln', !on)
syncCodeLn(useEditorPrefs.getState().codeLineNumbers)
useEditorPrefs.subscribe((s) => {
  syncStrike(s.strikeDone)
  syncCodeLn(s.codeLineNumbers)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
