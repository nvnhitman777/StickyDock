import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '@/app/App'
import './styles.css'

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; message: string }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message }
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full items-center justify-center p-8 text-[var(--sd-text)]">
          <div className="max-w-lg rounded-[28px] bg-[rgba(13,17,24,0.92)] p-8 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
            <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--sd-muted)]">
              StickyDock failed to render
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[var(--sd-text)]">
              A renderer error occurred.
            </h1>
            <p className="mt-3 text-sm leading-6 text-[var(--sd-muted)]">{this.state.message}</p>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

const container: HTMLElement | null = document.getElementById('app')

if (!container) {
  throw new Error('App container was not found.')
}

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
)
