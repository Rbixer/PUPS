import { useMemo, useRef, useState } from 'react'
import { METHODS as PAY_METHODS } from '../catalog'
import { amountOf, Dialog, Field, Flash, InvoiceChoice, Metrics, Tabs, Tag } from '../components/ui'
import { count, isoDate, longDate, money, monthTitle, shiftMonth } from '../format'
import { round2 } from '../ops'
import { SHOP_CATEGORY_NAMES, shelfOf } from '../shop'
import { useStore } from '../store'
import type { Sale } from '../types'

type CartLine = { key: string; productId?: string; name: string; qty: number; price: number; max?: number }


export function Ventas() {
  const { state } = useStore()
  const [tab, setTab] = useState<'pos' | 'historial' | 'pedidos'>('pos')
  const pending = state.movements.filter((item) => item.type === 'ingreso' && item.method === 'Pedido')
  return (
    <section className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">Ventas y caja</p>
          <h1>Punto de venta</h1>
          <p className="lede">Cobra productos y servicios en mostrador. Cada venta baja la existencia y entra a caja con su documento.</p>
        </div>
      </header>
      <Tabs
        label="Secciones de ventas"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'pos', label: 'Nueva venta' },
          { id: 'historial', label: 'Historial' },
          { id: 'pedidos', label: 'Pedidos por cobrar', count: pending.length },
        ]}
      />
      {tab === 'pos' ? <Register /> : tab === 'historial' ? <History /> : <Pending />}
    </section>
  )
}

function Register() {
  const { state, recordSale } = useStore()
  const products = shelfOf(state.products).filter((item) => item.kind !== 'insumo')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>('Todo')
  const [cart, setCart] = useState<CartLine[]>([])
  const [client, setClient] = useState({ name: '', phone: '' })
  const [service, setService] = useState({ name: '', price: '' })
  const [discount, setDiscount] = useState('')
  const [method, setMethod] = useState<string>('Efectivo')
  const [invoiced, setInvoiced] = useState(false)
  const [received, setReceived] = useState('')
  const [error, setError] = useState('')
  const [ticket, setTicket] = useState<Sale | null>(null)
  const cartRef = useRef<HTMLElement>(null)
  const needle = query.trim().toLowerCase()
  const visible = products.filter(
    (item) => (category === 'Todo' || item.category === category) && (!needle || `${item.name} ${item.detail} ${item.sku ?? ''}`.toLowerCase().includes(needle)),
  )
  const subtotal = round2(cart.reduce((sum, line) => sum + line.qty * line.price, 0))
  const off = Math.max(0, amountOf(discount) || 0)
  const total = round2(Math.max(0, subtotal - off))
  const change = method === 'Efectivo' && received ? round2((amountOf(received) || 0) - total) : null

  function add(productId: string) {
    const item = products.find((product) => product.id === productId)
    if (!item) return
    setError('')
    setCart((current) => {
      const found = current.find((line) => line.productId === productId)
      if (found) {
        if (found.qty >= item.stock) return current
        return current.map((line) => (line.productId === productId ? { ...line, qty: line.qty + 1 } : line))
      }
      return [...current, { key: productId, productId, name: item.name, qty: 1, price: item.price, max: item.stock }]
    })
  }

  function step(key: string, delta: number) {
    setCart((current) =>
      current
        .map((line) => (line.key === key ? { ...line, qty: Math.min(line.max ?? 999, line.qty + delta) } : line))
        .filter((line) => line.qty > 0),
    )
  }

  function addService() {
    const price = amountOf(service.price)
    if (!service.name.trim() || !Number.isFinite(price) || price <= 0) {
      setError('El servicio necesita nombre y precio.')
      return
    }
    setError('')
    setCart((current) => [...current, { key: `svc-${Date.now()}`, name: service.name.trim(), qty: 1, price }])
    setService({ name: '', price: '' })
  }

  function charge() {
    if (method === 'Efectivo' && received.trim()) {
      const paid = amountOf(received)
      if (!Number.isFinite(paid) || paid < total) {
        setError(`El efectivo recibido no cubre el total de ${money(total)}.`)
        return
      }
    }
    const result = recordSale({
      clientName: client.name,
      phone: client.phone,
      lines: cart.map((line) => ({ productId: line.productId, name: line.name, qty: line.qty, price: line.price })),
      discount: off,
      method,
      invoiced,
    })
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError('')
    setTicket(result.value)
    setCart([])
    setClient({ name: '', phone: '' })
    setDiscount('')
    setReceived('')
  }

  return (
    <div className="pos">
      <div className="ledger">
        <div className="pos-tools">
          <input type="search" placeholder="Buscar producto o código" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Buscar producto" />
          <div className="tabs" role="tablist" aria-label="Categorías">
            {['Todo', ...SHOP_CATEGORY_NAMES.filter((name) => name !== 'Insumos')].map((name) => (
              <button key={name} type="button" role="tab" aria-selected={category === name} onClick={() => setCategory(name)}>
                {name}
              </button>
            ))}
          </div>
        </div>
        {visible.length === 0 ? <p className="empty" style={{ margin: 14 }}>Sin productos con ese filtro.</p> : null}
        <div className="pos-grid">
          {visible.map((item) => {
            const inCart = cart.find((line) => line.productId === item.id)?.qty ?? 0
            return (
              <button key={item.id} type="button" className="pos-item" disabled={item.stock - inCart <= 0} onClick={() => add(item.id)}>
                {item.image ? (
                  <img src={item.image} alt="" loading="lazy" />
                ) : (
                  <span className="pos-thumb" aria-hidden="true">
                    {item.name.charAt(0)}
                  </span>
                )}
                <strong>{item.name}</strong>
                <span>
                  <b>{money(item.price)}</b>
                  {item.stock - inCart <= 0 ? 'Agotado' : `${item.stock - inCart} disp.`}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <aside ref={cartRef} className="ledger cart-panel" aria-label="Venta en curso">
        <header className="module-bar">
          <h2>Venta en curso</h2>
          <span>{count(cart.length, 'línea', 'líneas')}</span>
        </header>
        {cart.length === 0 ? (
          <p className="cart-empty">Toca un producto para agregarlo, o suma un servicio abajo.</p>
        ) : (
          <ul className="cart-lines">
            {cart.map((line) => (
              <li key={line.key}>
                <div>
                  <strong>{line.name}</strong>
                  <small>
                    {line.productId ? money(line.price) : `${money(line.price)} · servicio`}
                  </small>
                </div>
                <div className="stepper">
                  <button type="button" aria-label={`Quitar uno de ${line.name}`} onClick={() => step(line.key, -1)}>
                    −
                  </button>
                  <span className="num">{line.qty}</span>
                  <button type="button" aria-label={`Agregar uno de ${line.name}`} onClick={() => step(line.key, 1)}>
                    +
                  </button>
                </div>
                <b className="num">{money(line.qty * line.price)}</b>
              </li>
            ))}
          </ul>
        )}
        <div className="cart-sum">
          <div className="biz-row">
            <Field label="Servicio o cargo">
              <input value={service.name} onChange={(event) => setService({ ...service, name: event.target.value })} placeholder="Ej. corte de uñas" />
            </Field>
            <Field label="Precio">
              <input className="num" inputMode="decimal" value={service.price} onChange={(event) => setService({ ...service, price: event.target.value })} style={{ width: 90 }} />
            </Field>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addService}>
              Sumar
            </button>
          </div>
          <div className="form-pair">
            <Field label="Cliente (opcional)">
              <input value={client.name} onChange={(event) => setClient({ ...client, name: event.target.value })} />
            </Field>
            <Field label="Teléfono">
              <input inputMode="tel" value={client.phone} onChange={(event) => setClient({ ...client, phone: event.target.value })} />
            </Field>
            <Field label="Descuento (Q)">
              <input className="num" inputMode="decimal" value={discount} onChange={(event) => setDiscount(event.target.value)} />
            </Field>
            <Field label="Método de pago">
              <select value={method} onChange={(event) => setMethod(event.target.value)}>
                {PAY_METHODS.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Field>
            {method === 'Efectivo' ? (
              <Field label="Recibido">
                <input className="num" inputMode="decimal" value={received} onChange={(event) => setReceived(event.target.value)} />
              </Field>
            ) : null}
            <InvoiceChoice value={invoiced} onChange={setInvoiced} />
          </div>
          <dl>
            <div>
              <dt>Subtotal</dt>
              <dd>{money(subtotal)}</dd>
            </div>
            {off > 0 ? (
              <div>
                <dt>Descuento</dt>
                <dd>− {money(off)}</dd>
              </div>
            ) : null}
            <div className="grand">
              <dt>Total</dt>
              <dd>{money(total)}</dd>
            </div>
            {change !== null ? (
              <div>
                <dt>Vuelto</dt>
                <dd className={change < 0 ? 'hot-text' : 'ok-text'}>{change < 0 ? `Faltan ${money(-change)}` : money(change)}</dd>
              </div>
            ) : null}
          </dl>
          <Flash error={error} />
          <button type="button" className="btn btn-primary" disabled={cart.length === 0} onClick={charge}>
            Cobrar {money(total)}
          </button>
        </div>
      </aside>

      {cart.length > 0 ? (
        <button type="button" className="cart-jump" onClick={() => cartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
          <span>Ver venta · {count(cart.reduce((sum, line) => sum + line.qty, 0), 'artículo', 'artículos')}</span>
          <b>{money(total)}</b>
        </button>
      ) : null}

      {ticket ? <Ticket sale={ticket} onClose={() => setTicket(null)} /> : null}
    </div>
  )
}

function Ticket({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const subtotal = sale.lines.reduce((sum, line) => sum + line.qty * line.price, 0)
  function print() {
    document.body.classList.add('ticket-print')
    const finish = () => {
      document.body.classList.remove('ticket-print')
      window.removeEventListener('afterprint', finish)
    }
    window.addEventListener('afterprint', finish)
    window.print()
  }
  return (
    <Dialog labelledBy="ticket-title" onClose={onClose}>
      <div className="overlay-card">
        <article className="ticket">
          <header>
            <img src="/logo.png" alt="" />
            <strong id="ticket-title">PUP'S · Pet Shop y Grooming</strong>
            <p>
              {sale.number} · {sale.document}
            </p>
            <p>
              {longDate(sale.date)} · {new Date(sale.at).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' })}
            </p>
            {sale.clientName ? <p>Cliente: {sale.clientName}</p> : null}
          </header>
          <table>
            <tbody>
              {sale.lines.map((line, index) => (
                <tr key={index}>
                  <td>
                    {line.qty} × {line.name}
                  </td>
                  <td>{money(line.qty * line.price)}</td>
                </tr>
              ))}
              {sale.discount ? (
                <tr>
                  <td>Subtotal</td>
                  <td>{money(subtotal)}</td>
                </tr>
              ) : null}
              {sale.discount ? (
                <tr>
                  <td>Descuento</td>
                  <td>− {money(sale.discount)}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <div className="ticket-total">
            <span>Total</span>
            <span>{money(sale.total)}</span>
          </div>
          <p>Pagado con {sale.method.toLowerCase()}. Gracias por tu compra.</p>
        </article>
        <div className="overlay-actions no-print">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Nueva venta
          </button>
          <button type="button" className="btn btn-primary" onClick={print}>
            Imprimir recibo
          </button>
        </div>
      </div>
    </Dialog>
  )
}

function History() {
  const { state, voidSale } = useStore()
  const [cursor, setCursor] = useState(() => isoDate().slice(0, 7))
  const [voiding, setVoiding] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const sales = (state.sales ?? []).filter((item) => item.date.startsWith(cursor))
  const live = sales.filter((item) => item.status !== 'anulada')
  const total = round2(live.reduce((sum, item) => sum + item.total, 0))
  const counter = round2(live.filter((item) => item.channel === 'mostrador').reduce((sum, item) => sum + item.total, 0))
  const online = round2(live.filter((item) => item.channel === 'tienda').reduce((sum, item) => sum + item.total, 0))
  const services = round2(
    state.movements.filter((item) => item.type === 'ingreso' && item.folio && item.date.startsWith(cursor)).reduce((sum, item) => sum + item.amount, 0),
  )
  const top = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; amount: number }>()
    for (const sale of live) {
      for (const line of sale.lines) {
        if (!line.productId) continue
        const row = map.get(line.productId) ?? { name: line.name, qty: 0, amount: 0 }
        row.qty += line.qty
        row.amount += line.qty * line.price
        map.set(line.productId, row)
      }
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount).slice(0, 6)
  }, [live])
  const peak = Math.max(...top.map((item) => item.amount), 1)

  return (
    <div className="biz-stack">
      <div className="month-switch">
        <button type="button" className="cal-arrow" aria-label="Mes anterior" onClick={() => setCursor((value) => shiftMonth(`${value}-01`, -1).slice(0, 7))}>
          ‹
        </button>
        <strong>{monthTitle(`${cursor}-01`)}</strong>
        <button
          type="button"
          className="cal-arrow"
          aria-label="Mes siguiente"
          disabled={cursor >= isoDate().slice(0, 7)}
          onClick={() => setCursor((value) => shiftMonth(`${value}-01`, 1).slice(0, 7))}
        >
          ›
        </button>
      </div>
      <Metrics
        items={[
          { label: 'Ventas de productos', value: money(total), detail: count(live.length, 'venta', 'ventas'), tone: 'ok' },
          { label: 'Mostrador', value: money(counter) },
          { label: 'Tienda en línea', value: money(online) },
          { label: 'Servicios de citas', value: money(services), detail: 'Cobros al completar citas' },
        ]}
      />
      <div className="biz-split wide-left">
        <div className="ledger">
          <header className="module-bar">
            <h2>Ventas del mes</h2>
            <span>{sales.length}</span>
          </header>
          <Flash error={error} notice={notice} />
          {sales.length === 0 ? (
            <p className="empty" style={{ margin: 14 }}>Este mes todavía no tiene ventas.</p>
          ) : (
            <div className="table-wrap">
              <table className="biz-table">
                <thead>
                  <tr>
                    <th>Venta</th>
                    <th>Cliente</th>
                    <th>Canal</th>
                    <th className="num">Total</th>
                    <th>Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {sales.map((sale) => (
                    <tr key={sale.id}>
                      <td>
                        <strong>{sale.number}</strong>
                        <small>
                          {longDate(sale.date)} · {sale.document}
                        </small>
                      </td>
                      <td>
                        {sale.clientName || 'Mostrador'}
                        <small>{sale.lines.map((line) => `${line.qty}× ${line.name}`).join(', ')}</small>
                      </td>
                      <td>{sale.channel === 'tienda' ? 'Tienda en línea' : 'Mostrador'}</td>
                      <td className="num">{money(sale.total)}</td>
                      <td>
                        {sale.status === 'pagada' ? <Tag tone="ok">{sale.method}</Tag> : sale.status === 'por cobrar' ? <Tag tone="warn">Por cobrar</Tag> : <Tag tone="mute">Anulada</Tag>}
                      </td>
                      <td>
                        {sale.status !== 'anulada' ? (
                          voiding === sale.id ? (
                            <div className="row-actions">
                              <input style={{ textAlign: 'left', minWidth: 140 }} placeholder="Motivo" value={reason} onChange={(event) => setReason(event.target.value)} aria-label="Motivo de anulación" />
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                onClick={() => {
                                  const result = voidSale(sale.id, reason)
                                  if (!result.ok) {
                                    setError(result.error)
                                    setNotice('')
                                    return
                                  }
                                  setError('')
                                  setNotice(`${sale.number} anulada. La existencia volvió al inventario.`)
                                  setVoiding(null)
                                  setReason('')
                                }}
                              >
                                Confirmar
                              </button>
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setVoiding(null)}>
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <div className="row-actions">
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setVoiding(sale.id)}>
                                Anular
                              </button>
                            </div>
                          )
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <article className="panel">
          <h2>Productos más vendidos</h2>
          {top.length === 0 ? (
            <p className="empty">Sin ventas de productos este mes.</p>
          ) : (
            <div className="meter">
              {top.map((row) => (
                <div key={row.name} className="meter-row">
                  <div>
                    <strong>{row.name}</strong>
                    <div className="meter-track" aria-hidden="true">
                      <div className="meter-fill" style={{ width: `${Math.max(4, (row.amount / peak) * 100)}%` }} />
                    </div>
                  </div>
                  <b className="num">
                    {row.qty} · {money(row.amount)}
                  </b>
                </div>
              ))}
            </div>
          )}
        </article>
      </div>
    </div>
  )
}

function Pending() {
  const { state, settleOrder, voidSale } = useStore()
  const orders = state.movements.filter((item) => item.type === 'ingreso' && item.method === 'Pedido')
  const [methods, setMethods] = useState<Record<string, string>>({})
  const [invoices, setInvoices] = useState<Record<string, boolean>>({})
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const total = round2(orders.reduce((sum, item) => sum + item.amount, 0))
  return (
    <div className="ledger">
      <header className="module-bar">
        <h2>Pedidos de la tienda en línea por cobrar</h2>
        <span>{money(total)}</span>
      </header>
      <p className="section-note">
        La existencia ya está apartada. Al entregar, elige cómo pagó el cliente y el cobro pasa a la caja de hoy. Si el cliente no llega, cancela el pedido y la existencia vuelve al
        inventario.
      </p>
      <Flash error={error} notice={notice} />
      {orders.length === 0 ? (
        <p className="empty" style={{ margin: 14 }}>No hay pedidos pendientes de cobro.</p>
      ) : (
        <div className="table-wrap">
          <table className="biz-table">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Detalle</th>
                <th className="num">Monto</th>
                <th>Cobrar con</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const lines = order.notes.split('\n').filter((line) => line.startsWith('·'))
                const phone = order.notes.split('\n').find((line) => line.startsWith('+')) ?? ''
                const method = methods[order.id] ?? 'Efectivo'
                return (
                  <tr key={order.id}>
                    <td>
                      <strong>{order.concept.replace(/^Tienda · /, '')}</strong>
                      <small>
                        {order.document} · {longDate(order.date)} {phone ? `· ${phone}` : ''}
                      </small>
                    </td>
                    <td>
                      <small>{lines.join(' ')}</small>
                    </td>
                    <td className="num">{money(order.amount)}</td>
                    <td>
                      <select value={method} onChange={(event) => setMethods({ ...methods, [order.id]: event.target.value })} aria-label="Método de cobro">
                        {PAY_METHODS.map((item) => (
                          <option key={item}>{item}</option>
                        ))}
                      </select>
                      <label className="check-line">
                        <input
                          type="checkbox"
                          checked={invoices[order.id] ?? false}
                          onChange={(event) => setInvoices({ ...invoices, [order.id]: event.target.checked })}
                        />
                        Con factura
                      </label>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => {
                            const result = settleOrder(order.id, method, invoices[order.id] ?? false)
                            if (!result.ok) {
                              setError(result.error)
                              setNotice('')
                              return
                            }
                            setError('')
                            setNotice(`${order.document} cobrado con ${method.toLowerCase()}.`)
                          }}
                        >
                          Marcar cobrado
                        </button>
                        {order.saleId && cancelling !== order.id ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => {
                              setCancelling(order.id)
                              setReason('')
                            }}
                          >
                            Cancelar pedido
                          </button>
                        ) : null}
                      </div>
                      {order.saleId && cancelling === order.id ? (
                        <div className="row-actions">
                          <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Motivo" aria-label={`Motivo para cancelar ${order.document}`} autoFocus />
                          <button
                            type="button"
                            className="btn btn-amber btn-sm"
                            onClick={() => {
                              const result = voidSale(order.saleId ?? '', reason)
                              if (!result.ok) {
                                setError(result.error)
                                setNotice('')
                                return
                              }
                              setCancelling(null)
                              setError('')
                              setNotice(`${order.document} cancelado. La existencia volvió al inventario.`)
                            }}
                          >
                            Confirmar
                          </button>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCancelling(null)}>
                            Volver
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
