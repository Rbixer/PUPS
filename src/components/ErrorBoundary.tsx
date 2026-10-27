import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { failed: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('PUP\u2019S:', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="fallback" role="alert">
        <img src="/logo.png" alt="" />
        <h1>Algo no salió bien</h1>
        <p>Tus datos siguen guardados en este dispositivo. Recarga el panel para continuar.</p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          Recargar panel
        </button>
      </main>
    )
  }
}
