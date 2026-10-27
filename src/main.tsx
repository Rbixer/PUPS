import '@fontsource-variable/plus-jakarta-sans/wght.css'
import '@fontsource-variable/fraunces/opsz.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './components/Toast'
import { PwaProvider } from './pwa'
import { StoreProvider } from './store'
import { ThemeProvider } from './theme'
import './styles/index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <PwaProvider>
            <StoreProvider>
              <BrowserRouter>
                <App />
              </BrowserRouter>
            </StoreProvider>
          </PwaProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
)
