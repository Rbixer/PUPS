import { useState } from 'react'
import { METHODS } from '../catalog'
import { amountOf, Field, Flash, Metrics, Tabs, Tag } from '../components/ui'
import { addDays, count, isoDate, longDate, money } from '../format'
import { payableBalance, round2 } from '../ops'
import { shelfOf } from '../shop'
import { useStore } from '../store'
import type { Supplier } from '../types'

const PAY_METHODS = METHODS.filter((item) => item !== 'Pedido')

type Draft = { free: boolean; productId: string; description: string; qty: string; cost: string }

const blankLine = (): Draft => ({ free: false, productId: '', description: '', qty: '1', cost: '' })
const blankSupplier = (): Supplier => ({ id: '', name: '', nit: '', phone: '', email: '', contact: '', notes: '' })

export function Compras() {
  const { state } = useStore()
  const [tab, setTab] = useState<'nueva' | 'historial' | 'proveedores'>(() => ((state.suppliers ?? []).length ? 'nueva' : 'proveedores'))
  const month = isoDate().slice(0, 7)
  const purchases = state.purchases ?? []
  const thisMonth = purchases.filter((item) => item.date.startsWith(month))
  const credit = (state.payables ?? []).filter((item) => item.purchaseId).reduce((sum, item) => sum + payableBalance(item), 0)
  return (
    <section className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">Compras y gastos</p>
          <h1>Compras</h1>
          <p className="lede">Registra lo que entra de cada proveedor. La existencia sube y el costo se promedia; al crédito queda en facturas por pagar.</p>
        </div>
      </header>
      <Metrics
        items={[
          { label: 'Compras del mes', value: money(round2(thisMonth.reduce((sum, item) => sum + item.total, 0))), detail: count(thisMonth.length, 'documento', 'documentos') },
          { label: 'Al crédito pendiente', value: money(round2(credit)), tone: credit > 0 ? 'hot' : undefined },
          { label: 'Proveedores', value: (state.suppliers ?? []).length },
          { label: 'Compras registradas', value: purchases.length },
        ]}
      />
      <Tabs
        label="Secciones de compras"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'nueva', label: 'Nueva compra' },
          { id: 'historial', label: 'Historial' },
          { id: 'proveedores', label: 'Proveedores', count: (state.suppliers ?? []).length },
        ]}
      />
      {tab === 'nueva' ? <NewPurchase onNeedSupplier={() => setTab('proveedores')} /> : tab === 'historial' ? <History /> : <Suppliers />}
    </section>
  )
}

function NewPurchase({ onNeedSupplier }: { onNeedSupplier: () => void }) {
  const { state, recordPurchase } = useStore()
  const suppliers = state.suppliers ?? []
  const products = shelfOf(state.products)
  const [form, setForm] = useState({
    date: isoDate(),
    supplierId: suppliers[0]?.id ?? '',
    invoice: '',
    withTax: true,
    terms: 'contado' as 'contado' | 'credito',
    method: 'Efectivo',
    dueDate: addDays(isoDate(), 30),
    notes: '',
  })
  const [lines, setLines] = useState<Draft[]>([blankLine()])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const total = round2(lines.reduce((sum, line) => sum + (amountOf(line.qty) || 0) * (amountOf(line.cost) || 0), 0))

  if (suppliers.length === 0) {
    return (
      <div className="empty">
        Primero registra un proveedor.{' '}
        <button type="button" className="text-btn" onClick={onNeedSupplier}>
          Agregar proveedor
        </button>
      </div>
    )
  }

  function setLine(index: number, patch: Partial<Draft>) {
    setLines((current) => current.map((line, at) => (at === index ? { ...line, ...patch } : line)))
  }

  return (
    <form
      className="ledger biz-form"
      onSubmit={(event) => {
        event.preventDefault()
        const result = recordPurchase({
          date: form.date,
          supplierId: form.supplierId,
          invoice: form.invoice,
          withTax: form.withTax,
          terms: form.terms,
          method: form.method,
          dueDate: form.dueDate,
          notes: form.notes,
          lines: lines.filter((line) => line.productId || line.description.trim() || line.cost.trim()).map((line) => ({
            productId: line.free ? undefined : line.productId || undefined,
            description: line.productId ? products.find((item) => item.id === line.productId)?.name ?? '' : line.description,
            qty: amountOf(line.qty) || 0,
            cost: amountOf(line.cost),
          })),
        })
        if (!result.ok) {
          setError(result.error)
          setNotice('')
          return
        }
        setError('')
        setNotice(
          result.value.terms === 'contado'
            ? `${result.value.number} registrada. Egreso ${result.value.document} por ${money(result.value.total)}.`
            : `${result.value.number} registrada al crédito. Vence el ${longDate(result.value.dueDate ?? '')}.`,
        )
        setLines([blankLine()])
        setForm({ ...form, invoice: '', notes: '' })
      }}
    >
      <h2>Datos del documento</h2>
      <div className="form-trio">
        <Field label="Proveedor">
          <select value={form.supplierId} onChange={(event) => setForm({ ...form, supplierId: event.target.value })}>
            {suppliers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fecha">
          <input type="date" value={form.date} max={isoDate()} onChange={(event) => setForm({ ...form, date: event.target.value })} required />
        </Field>
        <Field label="No. de factura">
          <input value={form.invoice} onChange={(event) => setForm({ ...form, invoice: event.target.value })} placeholder="Serie y número" />
        </Field>
        <Field label="Condición">
          <select value={form.terms} onChange={(event) => setForm({ ...form, terms: event.target.value as 'contado' | 'credito' })}>
            <option value="contado">Contado</option>
            <option value="credito">Crédito</option>
          </select>
        </Field>
        {form.terms === 'contado' ? (
          <Field label="Pagado con">
            <select value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value })}>
              {PAY_METHODS.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Vence">
            <input type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} />
          </Field>
        )}
        <label className="check-line" style={{ alignSelf: 'end', paddingBottom: 10 }}>
          <input type="checkbox" checked={form.withTax} onChange={(event) => setForm({ ...form, withTax: event.target.checked })} />
          Factura con IVA
        </label>
      </div>

      <h2>Detalle</h2>
      <div className="line-editor">
        {lines.map((line, index) => (
          <div key={index} className="line">
            <Field label={index === 0 ? 'Producto o descripción' : ' '}>
              <select
                value={line.free ? '__libre' : line.productId}
                onChange={(event) => {
                  const value = event.target.value
                  if (value === '__libre') setLine(index, { free: true, productId: '' })
                  else {
                    const item = products.find((product) => product.id === value)
                    setLine(index, { free: false, productId: value, description: '', cost: line.cost || (item?.cost ? String(item.cost) : '') })
                  }
                }}
              >
                <option value="">Elige un producto…</option>
                {products.map((item) => (
                  <option key={item.id} value={item.id}>
                    {`${item.name}${item.kind === 'insumo' ? ' (insumo)' : ''} · hay ${item.stock}`}
                  </option>
                ))}
                <option value="__libre">Otro gasto de compra (sin inventario)</option>
              </select>
              {line.free ? (
                <input
                  style={{ marginTop: 6 }}
                  value={line.description}
                  onChange={(event) => setLine(index, { description: event.target.value })}
                  placeholder="Descripción"
                  aria-label="Descripción"
                />
              ) : null}
            </Field>
            <Field label={index === 0 ? 'Cant.' : ' '}>
              <input className="num" inputMode="numeric" value={line.qty} onChange={(event) => setLine(index, { qty: event.target.value })} />
            </Field>
            <Field label={index === 0 ? 'Costo unit. (Q)' : ' '}>
              <input className="num" inputMode="decimal" value={line.cost} onChange={(event) => setLine(index, { cost: event.target.value })} />
            </Field>
            <button type="button" className="icon-btn" aria-label="Quitar línea" onClick={() => setLines((current) => (current.length > 1 ? current.filter((_, at) => at !== index) : [blankLine()]))}>
              ×
            </button>
          </div>
        ))}
        <button type="button" className="btn btn-ghost btn-sm" style={{ justifySelf: 'start' }} onClick={() => setLines((current) => [...current, blankLine()])}>
          + Agregar línea
        </button>
      </div>
      <Field label="Notas">
        <input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
      </Field>
      <div className="biz-row" style={{ justifyContent: 'space-between' }}>
        <strong className="num" style={{ fontSize: '1.3rem' }}>
          Total {money(total)}
        </strong>
        <button type="submit" className="btn btn-primary">
          Registrar compra
        </button>
      </div>
      <Flash error={error} notice={notice} />
    </form>
  )
}

function History() {
  const { state } = useStore()
  const purchases = state.purchases ?? []
  const payables = new Map((state.payables ?? []).map((item) => [item.id, item]))
  if (purchases.length === 0) return <p className="empty">Todavía no hay compras registradas.</p>
  return (
    <div className="ledger">
      <div className="table-wrap">
        <table className="biz-table">
          <thead>
            <tr>
              <th>Compra</th>
              <th>Proveedor</th>
              <th>Detalle</th>
              <th className="num">Total</th>
              <th>Pago</th>
            </tr>
          </thead>
          <tbody>
            {purchases.map((item) => {
              const payable = item.payableId ? payables.get(item.payableId) : undefined
              const balance = payable ? payableBalance(payable) : 0
              return (
                <tr key={item.id}>
                  <td>
                    <strong>{item.number}</strong>
                    <small>
                      {longDate(item.date)}
                      {item.invoice ? ` · Fact. ${item.invoice}` : ''}
                    </small>
                  </td>
                  <td>{item.supplierName}</td>
                  <td>
                    <small>{item.lines.map((line) => `${line.qty}× ${line.description} (${money(line.cost)})`).join(', ')}</small>
                  </td>
                  <td className="num">{money(item.total)}</td>
                  <td>
                    {item.terms === 'contado' ? (
                      <Tag tone="ok">
                        {item.method} · {item.document}
                      </Tag>
                    ) : balance > 0 ? (
                      <Tag tone="warn">Debe {money(balance)}</Tag>
                    ) : (
                      <Tag tone="ok">Crédito pagado</Tag>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Suppliers() {
  const { state, saveSupplier } = useStore()
  const suppliers = state.suppliers ?? []
  const [form, setForm] = useState<Supplier>(blankSupplier)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const editing = suppliers.some((item) => item.id === form.id)
  const owed = (id: string) => (state.payables ?? []).filter((item) => item.supplierId === id).reduce((sum, item) => sum + payableBalance(item), 0)
  const bought = (id: string) => (state.purchases ?? []).filter((item) => item.supplierId === id).reduce((sum, item) => sum + item.total, 0)

  return (
    <div className="biz-split">
      <form
        className="ledger biz-form"
        onSubmit={(event) => {
          event.preventDefault()
          const result = saveSupplier(form)
          if (!result.ok) {
            setError(result.error)
            setNotice('')
            return
          }
          setError('')
          setNotice(editing ? 'Proveedor actualizado.' : `${result.value.name} agregado.`)
          setForm(blankSupplier())
        }}
      >
        <h2>{editing ? 'Editar proveedor' : 'Nuevo proveedor'}</h2>
        <Field label="Nombre o razón social">
          <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
        </Field>
        <div className="form-pair">
          <Field label="NIT">
            <input value={form.nit} onChange={(event) => setForm({ ...form, nit: event.target.value })} />
          </Field>
          <Field label="Teléfono">
            <input inputMode="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
          </Field>
          <Field label="Contacto">
            <input value={form.contact} onChange={(event) => setForm({ ...form, contact: event.target.value })} />
          </Field>
          <Field label="Correo">
            <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          </Field>
        </div>
        <Field label="Notas">
          <input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Días de entrega, condiciones…" />
        </Field>
        <Flash error={error} notice={notice} />
        <div className="overlay-actions">
          {editing ? (
            <button type="button" className="btn btn-ghost" onClick={() => setForm(blankSupplier())}>
              Cancelar
            </button>
          ) : null}
          <button type="submit" className="btn btn-primary">
            {editing ? 'Guardar cambios' : 'Agregar proveedor'}
          </button>
        </div>
      </form>
      <div className="ledger">
        <header className="module-bar">
          <h2>Proveedores</h2>
          <span>{suppliers.length}</span>
        </header>
        {suppliers.length === 0 ? (
          <p className="empty" style={{ margin: 14 }}>Todavía no hay proveedores.</p>
        ) : (
          <div className="table-wrap">
            <table className="biz-table">
              <thead>
                <tr>
                  <th>Proveedor</th>
                  <th className="num">Comprado</th>
                  <th className="num">Saldo</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {suppliers.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.name}</strong>
                      <small>{[item.nit && `NIT ${item.nit}`, item.phone, item.contact].filter(Boolean).join(' · ') || 'Sin datos de contacto'}</small>
                    </td>
                    <td className="num">{money(bought(item.id))}</td>
                    <td className={`num ${owed(item.id) > 0 ? 'hot-text' : ''}`}>{money(owed(item.id))}</td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm(item)}>
                          Editar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
