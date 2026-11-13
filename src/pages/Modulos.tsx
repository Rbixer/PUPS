import { useEffect, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { allows } from '../access'
import { alertBadges } from '../alerts'
import { DEMO_MODE } from '../env'
import { formatName, todayLabel } from '../format'
import { MODULE_GROUPS, ModuleIcon } from '../modules'
import { useStore } from '../store'

const plain = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

export function Modulos() {
  const { state, currentUser, isAdmin, resetDemo } = useStore()
  const [category, setCategory] = useState('todos')
  const [query, setQuery] = useState('')
  const [armReset, setArmReset] = useState(false)
  const badges = alertBadges(state, currentUser)

  useEffect(() => {
    document.title = "Módulos · PUP'S"
  }, [])

  const groups = MODULE_GROUPS.map((group) => ({
    ...group,
    links: group.links.filter((link) => !link.permission || (currentUser ? allows(currentUser, link.permission) : false)),
  })).filter((group) => group.links.length > 0)
  const total = groups.reduce((sum, group) => sum + group.links.length, 0)
  const words = plain(query.trim())
  const cards = groups
    .filter((group) => category === 'todos' || group.id === category)
    .flatMap((group) => group.links.map((link) => ({ ...link, group })))
    .filter((card) => !words || plain(`${card.label} ${card.detail} ${card.group.label}`).includes(words))

  return (
    <section className="stack modules-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">{todayLabel()}</p>
          <h1>Hola{currentUser?.name ? `, ${formatName(currentUser.name)}` : ''}</h1>
          <p className="lede">Elige el módulo al que quieres entrar.</p>
        </div>
        <input
          className="modules-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar módulo…"
          aria-label="Buscar módulo"
        />
      </header>

      <div className="modules">
        <nav className="modules-cats" aria-label="Categorías">
          <p>Categorías</p>
          <button type="button" aria-pressed={category === 'todos'} onClick={() => setCategory('todos')}>
            <span>Todos</span>
            <small>{total}</small>
          </button>
          {groups.map((group) => (
            <button
              key={group.id}
              type="button"
              aria-pressed={category === group.id}
              onClick={() => setCategory(group.id)}
              style={{ '--tone': group.tone } as CSSProperties}
            >
              <i aria-hidden />
              <span>{group.label}</span>
              <small>{group.links.length}</small>
            </button>
          ))}
        </nav>

        {cards.length === 0 ? (
          <p className="empty">Ningún módulo coincide con “{query.trim()}”.</p>
        ) : (
          <ul className="modules-grid">
            {cards.map((card) => (
              <li key={card.to}>
                <Link className="module-card" to={card.to} style={{ '--tone': card.group.tone } as CSSProperties}>
                  <span className="module-icon">
                    <ModuleIcon to={card.to} size={26} />
                  </span>
                  <span className="module-text">
                    <strong>{card.label}</strong>
                    <small>{card.detail}</small>
                  </span>
                  {badges[card.to] ? (
                    <b className="module-badge" aria-label={`${badges[card.to]} pendientes`}>
                      {badges[card.to]}
                    </b>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {isAdmin && DEMO_MODE ? (
        <button
          type="button"
          className={`modules-reset ${armReset ? 'armed' : ''}`}
          onClick={() => {
            if (!armReset) {
              setArmReset(true)
              return
            }
            resetDemo()
            setArmReset(false)
          }}
        >
          {armReset ? 'Confirmar: restaurar los datos de demostración' : 'Restaurar demostración'}
        </button>
      ) : null}
    </section>
  )
}
