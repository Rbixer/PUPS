import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { failed: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('PUP\'S: una pantalla falló', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="fault" role="alert">
        <h1>Algo no salió bien</h1>
        <p>No se perdió nada de lo que ya estaba guardado. Recarga la página para continuar.</p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          Recargar
        </button>
      </main>
    )
  }
}
