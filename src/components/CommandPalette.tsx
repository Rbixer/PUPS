import { useEffect, useMemo, useRef, useState } from 'react'

export type Command = { id: string; label: string; group: string; keywords?: string; run: () => void }

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es')
}

export function CommandPalette({ commands, open, onClose }: { commands: Command[]; open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const opener = useRef<HTMLElement | null>(null)

  const results = useMemo(() => {
    const needle = normalize(query.trim())
    if (!needle) return commands
    return commands.filter((command) => normalize(`${command.label} ${command.group} ${command.keywords ?? ''}`).includes(needle))
  }, [commands, query])

  useEffect(() => {
    if (!open) return
    opener.current = document.activeElement as HTMLElement | null
    input.current?.focus()
    return () => {
      setQuery('')
      setIndex(0)
      opener.current?.focus()
    }
  }, [open])

  useEffect(() => {
    setIndex(0)
  }, [query])

  if (!open) return null

  const choose = (command?: Command) => {
    if (!command) return
    onClose()
    command.run()
  }

  return (
    <div className="palette-scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Ir a o hacer algo"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onClose()
          } else if (event.key === 'ArrowDown') {
            event.preventDefault()
            setIndex((value) => Math.min(value + 1, results.length - 1))
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setIndex((value) => Math.max(value - 1, 0))
          } else if (event.key === 'Enter') {
            event.preventDefault()
            choose(results[index])
          } else if (event.key === 'Tab') {
            event.preventDefault()
          }
        }}
      >
        <input
          ref={input}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Ir a… o escribir una acción"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={results[index] ? `palette-${results[index].id}` : undefined}
          aria-label="Buscar módulo o acción"
          autoComplete="off"
          spellCheck={false}
        />
        <ul id="palette-list" role="listbox" aria-label="Resultados">
          {results.map((command, position) => (
            <li
              key={command.id}
              id={`palette-${command.id}`}
              role="option"
              aria-selected={position === index}
              className={position === index ? 'is-active' : undefined}
              onMouseEnter={() => setIndex(position)}
              onMouseDown={(event) => {
                event.preventDefault()
                choose(command)
              }}
            >
              <span>{command.label}</span>
              <small>{command.group}</small>
            </li>
          ))}
          {results.length === 0 ? <li className="palette-empty">Nada coincide con “{query}”.</li> : null}
        </ul>
        <footer>
          <span>↑↓ moverse</span>
          <span>Enter abrir</span>
          <span>Esc cerrar</span>
        </footer>
      </div>
    </div>
  )
}
