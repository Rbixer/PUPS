import { useState } from 'react'
import { amountOf, Field, Flash, Metrics, Tabs, Tag } from '../components/ui'
import { count, longDate, money, newId } from '../format'
import { round2 } from '../ops'
import { shelfOf } from '../shop'
import { useStore } from '../store'
import type { CatalogItem, StockKind } from '../types'

const KIND_LABEL: Record<StockKind, string> = {
  inicial: 'Existencia inicial',
  compra: 'Compra',
  venta: 'Venta',
  pedido: 'Pedido en línea',
  ajuste: 'Ajuste',
  consumo: 'Consumo',
  anulación: 'Anulación',
}

type Filter = 'todo' | 'bajo' | 'venta' | 'insumo'

function low(item: CatalogItem) {
  return item.stock <= (item.minStock ?? 0)
}

export function Inventario() {
  const { state, allows } = useStore()
  const products = shelfOf(state.products)
  const [filter, setFilter] = useState<Filter>('todo')
  const [picked, setPicked] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const visible = products.filter((item) => {
    if (filter === 'bajo' && !low(item)) return false
    if (filter === 'venta' && item.kind === 'insumo') return false
    if (filter === 'insumo' && item.kind !== 'insumo') return false
    return !needle || `${item.name} ${item.sku ?? ''} ${item.category}`.toLowerCase().includes(needle)
  })
  const current = products.find((item) => item.id === picked) ?? null
  const valueOf = (items: CatalogItem[]) => round2(items.reduce((sum, item) => sum + Math.max(0, item.stock) * (item.cost ?? 0), 0))
  const value = valueOf(products)
  const supplies = valueOf(products.filter((item) => item.kind === 'insumo'))
  const retail = round2(products.filter((item) => item.kind !== 'insumo').reduce((sum, item) => sum + Math.max(0, item.stock) * item.price, 0))
  const lows = products.filter(low)
  const noCost = products.filter((item) => item.cost === undefined).length

  return (
    <section className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">Compras y gastos</p>
          <h1>Inventario</h1>
          <p className="lede">Existencias de la tienda y de los insumos de grooming. Cada entrada y salida queda en el kárdex del producto.</p>
        </div>
      </header>
      <Metrics
        items={[
          {
            label: 'Valor al costo',
            value: money(value),
            detail: `Venta ${money(round2(value - supplies))} · servicio ${money(supplies)}${noCost ? ` · ${noCost} sin costo` : ''}`,
          },
          { label: 'Valor a precio de venta', value: money(retail), tone: 'ok' },
          { label: 'Bajo mínimo', value: lows.length, tone: lows.length ? 'bad' : undefined, detail: lows.slice(0, 3).map((item) => item.name).join(', ') || 'Todo en orden' },
          { label: 'Productos', value: products.length, detail: count(products.filter((item) => item.kind === 'insumo').length, 'insumo', 'insumos') },
        ]}
      />
      <div className="biz-row" style={{ justifyContent: 'space-between' }}>
        <Tabs
          label="Filtro de inventario"
          value={filter}
          onChange={setFilter}
          tabs={[
            { id: 'todo', label: 'Todo' },
            { id: 'bajo', label: 'Bajo mínimo', count: lows.length },
            { id: 'venta', label: 'Para venta' },
            { id: 'insumo', label: 'Uso en servicio' },
          ]}
        />
        <input type="search" className="filters-search-input" placeholder="Buscar" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Buscar en inventario" style={{ padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--surface)', minWidth: 200 }} />
      </div>

      <div className="biz-split wide-left">
        <div className="ledger">
          <div className="table-wrap">
            <table className="biz-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="num">Existencia</th>
                  <th className="num">Mínimo</th>
                  <th className="num">Costo</th>
                  <th className="num">Valor</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={item.id} className={current?.id === item.id ? 'is-picked' : ''}>
                    <td>
                      <button type="button" className="linkish" onClick={() => setPicked(item.id)}>
                        {item.name}
                      </button>
                      <small>
                        {item.kind === 'insumo' ? 'Uso en servicio' : `Para venta · ${item.category}`} · {item.unit}
                        {item.sku ? ` · ${item.sku}` : ''}
                        {item.kind !== 'insumo' && item.active === false ? ' · no sale en la tienda en línea' : ''}
                      </small>
                    </td>
                    <td className="num">{item.stock}</td>
                    <td className="num">{item.minStock ?? '—'}</td>
                    <td className="num">{item.cost !== undefined ? money(item.cost) : '—'}</td>
                    <td className="num">{item.cost !== undefined ? money(Math.max(0, item.stock) * item.cost) : '—'}</td>
                    <td>{item.stock <= 0 ? <Tag tone="bad">Agotado</Tag> : low(item) ? <Tag tone="warn">Reponer</Tag> : <Tag tone="ok">Bien</Tag>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {visible.length === 0 ? <p className="empty" style={{ margin: 14 }}>Sin productos con ese filtro.</p> : null}
        </div>
        <div className="biz-stack">
          {current ? <Kardex key={current.id} item={current} canAdjust={allows('compras')} /> : <p className="empty">Elige un producto para ver su kárdex y ajustar existencia.</p>}
          {allows('compras') ? <NewSupply /> : null}
        </div>
      </div>
    </section>
  )
}

function Kardex({ item, canAdjust }: { item: CatalogItem; canAdjust: boolean }) {
  const { state, adjustStock, saveProduct } = useStore()
  const moves = (state.stockMoves ?? []).filter((move) => move.productId === item.id)
  const [form, setForm] = useState({ kind: 'consumo' as 'consumo' | 'sube' | 'baja', qty: '', note: '' })
  const [limits, setLimits] = useState({ minStock: String(item.minStock ?? ''), cost: item.cost !== undefined ? String(item.cost) : '' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  return (
    <div className="ledger">
      <header className="module-bar">
        <h2>{item.name}</h2>
        <span>Hay {item.stock}</span>
      </header>
      {canAdjust ? (
        <>
          <form
            className="biz-form"
            onSubmit={(event) => {
              event.preventDefault()
              const qty = amountOf(form.qty)
              if (!Number.isInteger(qty) || qty <= 0) {
                setError('Escribe una cantidad entera mayor a cero.')
                setNotice('')
                return
              }
              const result = adjustStock({ productId: item.id, qty: form.kind === 'baja' ? -qty : qty, kind: form.kind === 'consumo' ? 'consumo' : 'ajuste', note: form.note })
              if (!result.ok) {
                setError(result.error)
                setNotice('')
                return
              }
              setError('')
              setNotice(`Movimiento registrado. Quedan ${result.value.balance}.`)
              setForm({ ...form, qty: '', note: '' })
            }}
          >
            <div className="form-trio">
              <Field label="Movimiento">
                <select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as 'consumo' | 'sube' | 'baja' })}>
                  <option value="consumo">Consumo de grooming</option>
                  <option value="sube">Ajuste por conteo · sobran</option>
                  <option value="baja">Ajuste por conteo · faltan</option>
                </select>
              </Field>
              <Field label={form.kind === 'consumo' ? 'Cantidad usada' : form.kind === 'sube' ? 'Cuántas sobran' : 'Cuántas faltan'}>
                <input className="num" inputMode="numeric" value={form.qty} onChange={(event) => setForm({ ...form, qty: event.target.value })} required />
              </Field>
              <Field label="Motivo">
                <input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} required />
              </Field>
            </div>
            <button type="submit" className="btn btn-ghost btn-sm" style={{ justifySelf: 'start' }}>
              Registrar movimiento
            </button>
          </form>
          <form
            className="biz-form"
            style={{ borderTop: '1px solid var(--line)' }}
            onSubmit={(event) => {
              event.preventDefault()
              const result = saveProduct({
                ...item,
                minStock: limits.minStock.trim() ? amountOf(limits.minStock) : undefined,
                cost: limits.cost.trim() ? amountOf(limits.cost) : undefined,
              })
              setError(result ?? '')
              setNotice(result ? '' : 'Mínimo y costo guardados.')
            }}
          >
            <div className="biz-row">
              <Field label="Existencia mínima">
                <input className="num" inputMode="numeric" value={limits.minStock} onChange={(event) => setLimits({ ...limits, minStock: event.target.value })} />
              </Field>
              <Field label="Costo unitario (Q)">
                <input className="num" inputMode="decimal" value={limits.cost} onChange={(event) => setLimits({ ...limits, cost: event.target.value })} />
              </Field>
              <button type="submit" className="btn btn-ghost btn-sm">
                Guardar
              </button>
            </div>
          </form>
          <div style={{ padding: '0 18px' }}>
            <Flash error={error} notice={notice} />
          </div>
        </>
      ) : null}
      <header className="module-bar">
        <h2>Kárdex</h2>
        <span>{moves.length} movimientos</span>
      </header>
      {moves.length === 0 ? (
        <p className="empty" style={{ margin: 14 }}>Sin movimientos registrados desde que se activó el inventario.</p>
      ) : (
        <div className="table-wrap">
          <table className="biz-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Movimiento</th>
                <th className="num">Cant.</th>
                <th className="num">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {moves.slice(0, 40).map((move) => (
                <tr key={move.id}>
                  <td>{longDate(move.date)}</td>
                  <td>
                    {KIND_LABEL[move.kind]}
                    <small>
                      {move.reference} · {move.note}
                    </small>
                  </td>
                  <td className={`num ${move.qty > 0 ? 'ok-text' : 'hot-text'}`}>{move.qty > 0 ? `+${move.qty}` : move.qty}</td>
                  <td className="num">{move.balance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function NewSupply() {
  const { saveProduct } = useStore()
  const [form, setForm] = useState({ name: '', unit: '', stock: '', minStock: '', cost: '' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  return (
    <form
      className="ledger biz-form"
      onSubmit={(event) => {
        event.preventDefault()
        const result = saveProduct({
          id: newId(),
          name: form.name,
          detail: '',
          category: 'Insumos',
          price: 0,
          unit: form.unit,
          stock: amountOf(form.stock) || 0,
          image: '',
          kind: 'insumo',
          active: false,
          minStock: form.minStock.trim() ? amountOf(form.minStock) : undefined,
          cost: form.cost.trim() ? amountOf(form.cost) : undefined,
        })
        if (result) {
          setError(result)
          setNotice('')
          return
        }
        setError('')
        setNotice(`${form.name.trim()} agregado a insumos.`)
        setForm({ name: '', unit: '', stock: '', minStock: '', cost: '' })
      }}
    >
      <h2>Nuevo insumo de grooming</h2>
      <p className="hint" style={{ margin: 0 }}>Shampoo de galón, toallas, cuchillas… Se controla aquí y no sale en la tienda.</p>
      <div className="form-pair">
        <Field label="Nombre">
          <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
        </Field>
        <Field label="Unidad">
          <input value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} placeholder="galón, pieza…" />
        </Field>
      </div>
      <div className="form-trio">
        <Field label="Existencia">
          <input className="num" inputMode="numeric" value={form.stock} onChange={(event) => setForm({ ...form, stock: event.target.value })} />
        </Field>
        <Field label="Mínimo">
          <input className="num" inputMode="numeric" value={form.minStock} onChange={(event) => setForm({ ...form, minStock: event.target.value })} />
        </Field>
        <Field label="Costo (Q)">
          <input className="num" inputMode="decimal" value={form.cost} onChange={(event) => setForm({ ...form, cost: event.target.value })} />
        </Field>
      </div>
      <Flash error={error} notice={notice} />
      <button type="submit" className="btn btn-primary">
        Agregar insumo
      </button>
    </form>
  )
}
