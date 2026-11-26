import { useState } from 'react'

/** La clave temporal se muestra una sola vez, para dictarla o copiarla. */
export function IssuedKey({ username, password }: { username: string; password: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="banner" role="status">
      <p>
        Clave temporal de <strong>{username}</strong>: <b className="num">{password}</b>
      </p>
      <p>Dásela a esa persona. Al entrar, el panel le pide elegir su propia clave.</p>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copy()}>
        {copied ? 'Copiada' : 'Copiar clave'}
      </button>
    </div>
  )
}
