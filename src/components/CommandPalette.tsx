import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { formatName } from '../format'
import { petFiles } from '../visit'
import { useStore } from '../store'
import { Icon, type IconName } from './Icon'

export type PaletteLink = { to: string; label: string; icon: IconName; group: string }

type Entry = { id: string; group: string; title: string; hint?: string; icon: IconName; run: () => void }

function fold(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

export function CommandPalette({
  links,
  extra,
  onClose,
}: {
  links: PaletteLink[]
  extra: { id: string; title: string; hint?: string; icon: IconName; run: () => void }[]
  onClose: () => void
}) {
  const navigate = useNavigate()
  const { state, allows } = useStore()
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const list = useRef<HTMLDivElement>(null)

  const entries = useMemo(() => {
    const go = (to: string) => () => navigate(to)
    const result: Entry[] = []
    if (allows('citas')) result.push({ id: 'new', group: 'Acciones', title: 'Nueva cita', hint: 'Agendar una visita', icon: 'calendarPlus', run: go('/admin?nueva=1') })
    for (const item of extra) result.push({ ...item, group: 'Acciones' })
    for (const link of links) result.push({ id: link.to, group: 'Ir a', title: link.label, hint: link.group, icon: link.icon, run: go(link.to) })
    if (allows('fichas')) {
      for (const pet of petFiles(state.appointments)) {
        result.push({
          id: `pet-${pet.key}`,
          group: 'Mascotas',
          title: formatName(pet.petName),
          hint: [pet.breed, formatName(pet.clientName), pet.phone].filter(Boolean).join(' · '),
          icon: 'paw',
          run: go(`/admin/fichas/${encodeURIComponent(pet.key)}`),
        })
      }
    }
    return result
  }, [links, extra, state.appointments, allows, navigate])

  const needle = fold(query.trim())
  const shown = useMemo(() => {
    const base = needle ? entries.filter((entry) => fold(`${entry.title} ${entry.hint ?? ''}`).includes(needle)) : entries.filter((entry) => entry.group !== 'Mascotas')
    return base.slice(0, 40)
  }, [entries, needle])

  useEffect(() => setIndex(0), [needle])

  useEffect(() => {
    list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [index])

  useEffect(() => {
    document.body.classList.add('scroll-lock')
    return () => document.body.classList.remove('scroll-lock')
  }, [])

  function choose(entry: Entry | undefined) {
    if (!entry) return
    onClose()
    entry.run()
  }

  let lastGroup = ''
  return createPortal(
    <div
      className="cmdk-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="cmdk"
        role="dialog"
        aria-modal="true"
        aria-label="Buscador rápido"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onClose()
          } else if (event.key === 'ArrowDown') {
            event.preventDefault()
            setIndex((current) => Math.min(shown.length - 1, current + 1))
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setIndex((current) => Math.max(0, current - 1))
          } else if (event.key === 'Enter') {
            event.preventDefault()
            choose(shown[index])
          }
        }}
      >
        <div className="cmdk-input">
          <Icon name="search" size={20} />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar módulo, mascota o acción…"
            aria-label="Buscar"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="cmdk-list" ref={list} role="listbox">
          {shown.length === 0 ? <p className="cmdk-empty">Nada coincide con “{query}”.</p> : null}
          {shown.map((entry, position) => {
            const header = entry.group !== lastGroup
            lastGroup = entry.group
            return (
              <div key={entry.id} style={{ display: 'contents' }}>
                {header ? <p className="cmdk-group">{entry.group}</p> : null}
                <button
                  type="button"
                  role="option"
                  aria-selected={position === index}
                  className="cmdk-item"
                  onMouseMove={() => setIndex(position)}
                  onClick={() => choose(entry)}
                >
                  <Icon name={entry.icon} size={18} />
                  <span>
                    <strong>{entry.title}</strong>
                    {entry.hint ? <small>{entry.hint}</small> : null}
                  </span>
                </button>
              </div>
            )
          })}
        </div>
        <div className="cmdk-foot">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> moverse
          </span>
          <span>
            <kbd>↵</kbd> abrir
          </span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
