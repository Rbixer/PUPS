import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { clientProfiles } from '../clients'
import { Metrics, StatusPill, Tag } from '../components/ui'
import { formatName, longDate, money, show, whatsappUrl } from '../format'
import { useStore } from '../store'

function initials(name: string) {
  const parts = formatName(name).split(' ').filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'C'
}

export function Clientes() {
  const { state, allows } = useStore()
  const profiles = useMemo(() => clientProfiles(state), [state])
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const needle = query.trim().toLowerCase()
  const visible = profiles.filter((item) => !needle || [item.name, item.phone, ...item.pets.map((pet) => pet.name)].join(' ').toLowerCase().includes(needle))
  const current = profiles.find((item) => item.key === picked) ?? visible[0] ?? null
  const recurring = profiles.filter((item) => item.completed >= 2).length
  const owed = profiles.reduce((sum, item) => sum + item.pending, 0)
  const lifetime = profiles.reduce((sum, item) => sum + item.total, 0)

  return (
    <section className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">Operación</p>
          <h1>Clientes</h1>
          <p className="lede">Un perfil por tutor: sus mascotas, visitas, compras y lo que tiene pendiente. Se arma solo con las citas y las ventas.</p>
        </div>
      </header>

      <Metrics
        items={[
          { label: 'Clientes', value: profiles.length, detail: `${recurring} con dos visitas o más` },
          { label: 'Mascotas', value: profiles.reduce((sum, item) => sum + item.pets.length, 0) },
          { label: 'Consumo histórico', value: money(lifetime), tone: 'ok' },
          { label: 'Por cobrar', value: money(owed), tone: owed > 0 ? 'hot' : undefined, detail: 'Pedidos de la tienda en línea' },
        ]}
      />

      <div className="biz-split">
        <div className="ledger">
          <div className="pos-tools">
            <input type="search" placeholder="Buscar por nombre, teléfono o mascota" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Buscar cliente" />
          </div>
          {visible.length === 0 ? (
            <p className="empty" style={{ margin: 14 }}>Sin clientes con esa búsqueda.</p>
          ) : (
            <div className="table-wrap">
              <table className="biz-table">
                <tbody>
                  {visible.map((item) => (
                    <tr key={item.key} className={current?.key === item.key ? 'is-picked' : ''}>
                      <td>
                        <button type="button" className="linkish" onClick={() => setPicked(item.key)}>
                          {formatName(item.name) || 'Sin nombre'}
                        </button>
                        <small>
                          {item.phone || 'Sin teléfono'} · {item.pets.map((pet) => formatName(pet.name)).join(', ') || 'Sin mascota'}
                        </small>
                      </td>
                      <td className="num">
                        {money(item.total)}
                        <small>{item.lastVisit ? longDate(item.lastVisit) : ''}</small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {current ? (
          <div className="biz-stack">
            <div className="ledger">
              <div className="client-head">
                <span className="client-mark">{initials(current.name)}</span>
                <div>
                  <h2>{formatName(current.name) || 'Sin nombre'}</h2>
                  <p>
                    {current.phone || 'Sin teléfono'}
                    {current.firstVisit ? ` · cliente desde ${longDate(current.firstVisit)}` : ''}
                  </p>
                </div>
                {current.phone && allows('whatsapp') ? (
                  <a className="btn btn-ghost btn-sm" href={whatsappUrl(current.phone, `Hola ${formatName(current.name)}, te escribimos de PUP'S.`)} target="_blank" rel="noreferrer">
                    WhatsApp
                  </a>
                ) : null}
              </div>
              <div className="pet-chips">
                {current.pets.map((pet) =>
                  allows('fichas') ? (
                    <Link key={pet.key} to={`/admin/fichas/${encodeURIComponent(pet.key)}`}>
                      {formatName(pet.name)} · {show(pet.breed)}
                    </Link>
                  ) : (
                    <span key={pet.key} className="tag tag-mute">
                      {formatName(pet.name)}
                    </span>
                  ),
                )}
              </div>
              <div className="statement">
                <div>
                  <span>Servicios ({current.completed} completados)</span>
                  <span>{money(current.services)}</span>
                </div>
                <div>
                  <span>Compras de productos ({current.sales.filter((item) => item.status === 'pagada').length})</span>
                  <span>{money(current.products)}</span>
                </div>
                <div className="total">
                  <span>Total consumido</span>
                  <span>{money(current.total)}</span>
                </div>
                {current.pending > 0 ? (
                  <div>
                    <span className="hot-text">Saldo por cobrar</span>
                    <span className="hot-text">{money(current.pending)}</span>
                  </div>
                ) : null}
                <div>
                  <span>Próxima cita</span>
                  <span>{current.next ? `${longDate(current.next.date)} · ${current.next.time}` : '—'}</span>
                </div>
                <div>
                  <span>Cancelaciones</span>
                  <span>{current.cancelled}</span>
                </div>
              </div>
            </div>

            <div className="ledger">
              <header className="module-bar">
                <h2>Visitas</h2>
                <span>{current.visits.length}</span>
              </header>
              {current.visits.length === 0 ? (
                <p className="empty" style={{ margin: 14 }}>Sin visitas.</p>
              ) : (
                <div className="table-wrap">
                  <table className="biz-table">
                    <tbody>
                      {current.visits.slice(0, 12).map((visit) => (
                        <tr key={visit.id}>
                          <td>
                            <strong>{formatName(visit.petName)}</strong>
                            <small>
                              #{visit.folio} · {longDate(visit.date)} · {show(visit.service)}
                            </small>
                          </td>
                          <td>
                            <StatusPill status={visit.status} />
                          </td>
                          <td className="num">{money(visit.cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="ledger">
              <header className="module-bar">
                <h2>Compras</h2>
                <span>{current.sales.length}</span>
              </header>
              {current.sales.length === 0 ? (
                <p className="empty" style={{ margin: 14 }}>Sin compras registradas con su nombre o teléfono.</p>
              ) : (
                <div className="table-wrap">
                  <table className="biz-table">
                    <tbody>
                      {current.sales.map((sale) => (
                        <tr key={sale.id}>
                          <td>
                            <strong>{sale.number}</strong>
                            <small>
                              {longDate(sale.date)} · {sale.lines.map((line) => `${line.qty}× ${line.name}`).join(', ')}
                            </small>
                          </td>
                          <td>{sale.status === 'pagada' ? <Tag tone="ok">Pagada</Tag> : <Tag tone="warn">Por cobrar</Tag>}</td>
                          <td className="num">{money(sale.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="empty">Todavía no hay clientes. Aparecen al registrar citas o ventas con nombre.</p>
        )}
      </div>
    </section>
  )
}
