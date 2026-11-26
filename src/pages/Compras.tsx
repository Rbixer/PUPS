import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EXPENSE_METHODS as PAY_METHODS } from '../catalog'
import { amountOf, Field, Flash, Metrics, Tabs, Tag } from '../components/ui'
import { saveConstanciaPdf, supplierOrderPdf } from '../constanciaPdf'
import { addDays, count, isoDate, longDate, money } from '../format'
import { payableBalance, purchaseSplit, round2 } from '../ops'
import { BASE_CATEGORY_NAMES, categoryNames, shelfOf } from '../shop'
import { useStore } from '../store'
import type { AppState, ProductUse, Purchase, ShopCategoryName, Supplier } from '../types'


type Draft = {
  free: boolean
  /** Producto que todavía no existe: se crea al registrar la compra. */
  fresh: boolean
  productId: string
  description: string
  qty: string
  cost: string
  use: ProductUse
  unit: string
  price: string
  category: ShopCategoryName
}

const blankLine = (): Draft => ({
  free: false,
  fresh: false,
  productId: '',
  description: '',
  qty: '1',
  cost: '',
  use: 'venta',
  unit: 'pieza',
  price: '',
  category: BASE_CATEGORY_NAMES[0],
})

const USE_LABEL: Record<ProductUse, string> = { venta: 'Para venta', insumo: 'Uso en servicio' }
const blankSupplier = (): Supplier => ({ id: '', name: '', nit: '', phone: '', email: '', contact: '', notes: '' })

type PurchaseTab = 'pedido' | 'llegada' | 'nueva' | 'historial' | 'proveedores'

export function Compras() {
  const { state } = useStore()
  const [tab, setTab] = useState<PurchaseTab>(() => ((state.suppliers ?? []).length ? 'pedido' : 'proveedores'))
  const [banner, setBanner] = useState('')
  const month = isoDate().slice(0, 7)
  const purchases = state.purchases ?? []
  const invoices = purchases.filter((item) => !item.stage)
  const thisMonth = invoices.filter((item) => item.date.startsWith(month))
  const pending = purchases.filter((item) => item.stage === 'pedida')
  const credit = (state.payables ?? []).filter((item) => item.purchaseId).reduce((sum, item) => sum + payableBalance(item), 0)
  const split = purchaseSplit(thisMonth, state.products)
  return (
    <section className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow"><Link className="accounting-back" to="/admin/contabilidad">Contabilidad</Link></p>
          <h1>Compras</h1>
          <p className="lede">
            El pedido se descarga en PDF sin precios para dárselo al proveedor. Cuando la mercadería llega, eliges si cada producto es consumible o de la tienda en línea y entra al inventario y al kárdex.
          </p>
        </div>
      </header>
      <Metrics
        items={[
          { label: 'Compras del mes', value: money(round2(thisMonth.reduce((sum, item) => sum + item.total, 0))), detail: count(thisMonth.length, 'documento', 'documentos') },
          { label: 'Para venta', value: money(split.venta), tone: 'ok', detail: 'Producto de la tienda' },
          { label: 'Uso en servicio', value: money(split.insumo), detail: split.gasto ? `${money(split.gasto)} sin inventario` : 'Insumos de grooming' },
          { label: 'Por llegar', value: count(pending.length, 'pedido', 'pedidos'), tone: pending.length ? 'hot' : undefined, detail: count((state.suppliers ?? []).length, 'proveedor', 'proveedores') },
          { label: 'Al crédito pendiente', value: money(round2(credit)), tone: credit > 0 ? 'hot' : undefined },
        ]}
      />
      <Tabs
        label="Secciones de compras"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'pedido', label: 'Pedido' },
          { id: 'llegada', label: 'Por llegar', count: pending.length },
          { id: 'nueva', label: 'Nueva compra' },
          { id: 'historial', label: 'Historial' },
          { id: 'proveedores', label: 'Proveedores', count: (state.suppliers ?? []).length },
        ]}
      />
      <Flash notice={banner} />
      {tab === 'pedido' ? (
        <SupplierOrder
          onNeedSupplier={() => setTab('proveedores')}
          onPlaced={(message) => {
            setBanner(message)
            setTab('llegada')
          }}
        />
      ) : tab === 'llegada' ? (
        <Arrivals onReceived={setBanner} />
      ) : tab === 'nueva' ? (
        <NewPurchase onNeedSupplier={() => setTab('proveedores')} />
      ) : tab === 'historial' ? (
        <History />
      ) : (
        <Suppliers />
      )}
    </section>
  )
}

async function downloadSupplierPdf(state: AppState, purchase: Purchase) {
  const supplier = (state.suppliers ?? []).find((item) => item.id === purchase.supplierId)
  const bytes = supplierOrderPdf({
    number: purchase.number,
    when: longDate(purchase.date),
    supplier: purchase.supplierName,
    contact: [supplier?.contact, supplier?.phone].filter(Boolean).join(' · '),
    lines: purchase.lines.map((line) => ({ name: line.description, qty: line.qty })),
  })
  return saveConstanciaPdf(bytes, `Pedido-${purchase.number}.pdf`)
}

type OrderLine = { fresh: boolean; productId: string; description: string; qty: string }

const blankOrder = (): OrderLine => ({ fresh: false, productId: '', description: '', qty: '1' })

function SupplierOrder({ onNeedSupplier, onPlaced }: { onNeedSupplier: () => void; onPlaced: (message: string) => void }) {
  const { state, placeSupplierOrder } = useStore()
  const suppliers = state.suppliers ?? []
  const products = shelfOf(state.products)
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? '')
  const [date, setDate] = useState(isoDate())
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<OrderLine[]>([blankOrder()])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

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

  function setLine(index: number, patch: Partial<OrderLine>) {
    setLines((current) => current.map((line, at) => (at === index ? { ...line, ...patch } : line)))
  }

  async function submit() {
    setBusy(true)
    setError('')
    const result = placeSupplierOrder({
      date,
      supplierId,
      notes,
      lines: lines
        .filter((line) => line.productId || line.description.trim())
        .map((line) => ({
          productId: line.fresh ? undefined : line.productId || undefined,
          description: line.fresh || !line.productId ? line.description : (products.find((item) => item.id === line.productId)?.name ?? line.description),
          qty: amountOf(line.qty) || 0,
        })),
    })
    if (!result.ok) {
      setError(result.error)
      setBusy(false)
      return
    }
    setLines([blankOrder()])
    setNotes('')
    let message = `${result.value.number} quedó registrado. No se pudo armar el PDF; puedes bajarlo en Por llegar.`
    try {
      const saved = await downloadSupplierPdf(state, result.value)
      message = saved === 'cancel'
        ? `${result.value.number} quedó registrado. El PDF no se guardó; puedes bajarlo en Por llegar.`
        : `${result.value.number} quedó registrado. Se descargó el pedido sin precios para el proveedor.`
    } catch {
      message = `${result.value.number} quedó registrado. No se pudo armar el PDF; puedes bajarlo en Por llegar.`
    }
    setBusy(false)
    onPlaced(message)
  }

  return (
    <form
      className="ledger biz-form"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <h2>Pedido al proveedor</h2>
      <p className="hint">La lista no lleva precios. La existencia no cambia hasta que la mercadería llega a la tienda.</p>
      <div className="form-pair">
        <Field label="Proveedor">
          <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
            {suppliers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fecha">
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
        </Field>
      </div>
      <div className="line-editor order-lines">
        {lines.map((line, index) => (
          <div key={index} className="line">
            <Field label={index === 0 ? 'Producto' : ' '}>
              <select
                value={line.fresh ? '__nuevo' : line.productId}
                onChange={(event) => {
                  const value = event.target.value
                  if (value === '__nuevo') setLine(index, { fresh: true, productId: '', description: '' })
                  else setLine(index, { fresh: false, productId: value, description: '' })
                }}
              >
                <option value="">Elige un producto…</option>
                {(['venta', 'insumo'] as const).map((use) => (
                  <optgroup key={use} label={USE_LABEL[use]}>
                    {products
                      .filter((item) => (item.kind ?? 'venta') === use)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
                <option value="__nuevo">+ Producto que todavía no está…</option>
              </select>
              {line.fresh ? (
                <input
                  style={{ marginTop: 6 }}
                  value={line.description}
                  onChange={(event) => setLine(index, { description: event.target.value })}
                  placeholder="Nombre para el proveedor"
                  aria-label="Nombre del producto"
                />
              ) : null}
            </Field>
            <Field label={index === 0 ? 'Cant.' : ' '}>
              <input className="num" inputMode="numeric" value={line.qty} onChange={(event) => setLine(index, { qty: event.target.value })} />
            </Field>
            <button type="button" className="icon-btn" aria-label="Quitar línea" onClick={() => setLines((current) => (current.length > 1 ? current.filter((_, at) => at !== index) : [blankOrder()]))}>
              ×
            </button>
          </div>
        ))}
        <button type="button" className="btn btn-ghost btn-sm" style={{ justifySelf: 'start' }} onClick={() => setLines((current) => [...current, blankOrder()])}>
          + Agregar producto
        </button>
      </div>
      <Field label="Nota">
        <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Opcional. No sale en el PDF." />
      </Field>
      <div className="biz-row" style={{ justifyContent: 'flex-end' }}>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Generando PDF…' : 'Registrar pedido'}
        </button>
      </div>
      <Flash error={error} />
    </form>
  )
}

function Arrivals({ onReceived }: { onReceived: (message: string) => void }) {
  const { state } = useStore()
  const pending = (state.purchases ?? []).filter((item) => item.stage === 'pedida')
  if (pending.length === 0) return <p className="empty">No hay pedidos esperando mercadería.</p>
  return (
    <div className="biz-stack">
      {pending.map((item) => (
        <ArrivalCard key={item.id} purchase={item} onReceived={onReceived} />
      ))}
    </div>
  )
}

function ArrivalCard({ purchase, onReceived }: { purchase: Purchase; onReceived: (message: string) => void }) {
  const { state, receiveSupplierOrder } = useStore()
  const products = shelfOf(state.products)
  const categories = categoryNames(state.settings)
  const [uses, setUses] = useState<ProductUse[]>(() => purchase.lines.map((line) => line.use ?? 'venta'))
  const [category, setCategory] = useState<string[]>(() => purchase.lines.map(() => categories[0] ?? 'Accesorios'))
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <article className="ledger order-receive">
      <header className="module-bar">
        <div>
          <h2>
            {purchase.number} · {purchase.supplierName}
          </h2>
          <p className="hint">{longDate(purchase.date)}</p>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            void downloadSupplierPdf(state, purchase)
              .then((saved) => setNotice(saved === 'cancel' ? '' : `Se descargó Pedido-${purchase.number}.pdf sin precios.`))
              .catch(() => setError('No se pudo armar el PDF.'))
          }}
        >
          PDF sin precios
        </button>
      </header>
      <div className="table-wrap">
        <table className="biz-table">
          <thead>
            <tr>
              <th>Producto</th>
              <th className="num">Cant.</th>
              <th>Al llegar</th>
            </tr>
          </thead>
          <tbody>
            {purchase.lines.map((line, index) => {
              const current = line.productId ? products.find((item) => item.id === line.productId) : undefined
              const use = uses[index] ?? 'venta'
              return (
                <tr key={`${purchase.id}-${index}`}>
                  <td>
                    <strong>{line.description}</strong>
                    <small>{current ? (current.kind === 'insumo' ? 'Hoy es consumible' : 'Hoy está en la tienda') : 'Producto nuevo'}</small>
                  </td>
                  <td className="num">{line.qty}</td>
                  <td>
                    <div className="choice-row" role="group" aria-label={`Destino de ${line.description}`}>
                      <button
                        type="button"
                        aria-pressed={use === 'insumo'}
                        onClick={() => setUses((list) => list.map((item, at) => (at === index ? 'insumo' : item)))}
                      >
                        Consumible
                      </button>
                      <button
                        type="button"
                        aria-pressed={use === 'venta'}
                        onClick={() => setUses((list) => list.map((item, at) => (at === index ? 'venta' : item)))}
                      >
                        Tienda en línea
                      </button>
                    </div>
                    {!current && use === 'venta' ? (
                      <Field label="Categoría">
                        <select value={category[index]} onChange={(event) => setCategory((list) => list.map((item, at) => (at === index ? event.target.value : item)))}>
                          {categories.map((item) => (
                            <option key={item}>{item}</option>
                          ))}
                        </select>
                      </Field>
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="hint">Consumible entra al inventario de servicio y no sale en la tienda. Tienda en línea entra como producto de venta; si es nuevo, se publica cuando tenga foto. No lo registres otra vez en Nueva compra: la existencia se sumaría de nuevo.</p>
      <div className="biz-row" style={{ justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => {
            setBusy(true)
            const result = receiveSupplierOrder(
              purchase.id,
              purchase.lines.map((_, index) => ({
                index,
                use: uses[index] ?? 'venta',
                category: category[index],
              })),
            )
            setBusy(false)
            if (!result.ok) {
              setError(result.error)
              setNotice('')
              return
            }
            setError('')
            onReceived(`${purchase.number} entró al inventario y al kárdex.`)
          }}
        >
          Ingresar al inventario
        </button>
      </div>
      <Flash error={error} notice={notice} />
    </article>
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
          lines: lines
            .filter((line) => line.productId || line.description.trim() || line.cost.trim())
            .map((line) => ({
              productId: line.free || line.fresh ? undefined : line.productId || undefined,
              description: line.productId && !line.free && !line.fresh ? (products.find((item) => item.id === line.productId)?.name ?? '') : line.description,
              qty: amountOf(line.qty) || 0,
              cost: amountOf(line.cost),
              ...(line.fresh ? { create: { kind: line.use, unit: line.unit, price: line.use === 'venta' ? amountOf(line.price) : 0, category: line.category } } : {}),
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
                value={line.free ? '__libre' : line.fresh ? '__nuevo' : line.productId}
                onChange={(event) => {
                  const value = event.target.value
                  if (value === '__libre') setLine(index, { free: true, fresh: false, productId: '' })
                  else if (value === '__nuevo') setLine(index, { free: false, fresh: true, productId: '' })
                  else {
                    const item = products.find((product) => product.id === value)
                    setLine(index, { free: false, fresh: false, productId: value, description: '', cost: line.cost || (item?.cost ? String(item.cost) : '') })
                  }
                }}
              >
                <option value="">Elige un producto…</option>
                {(['venta', 'insumo'] as const).map((use) => (
                  <optgroup key={use} label={USE_LABEL[use]}>
                    {products
                      .filter((item) => (item.kind ?? 'venta') === use)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {`${item.name} · hay ${item.stock}`}
                        </option>
                      ))}
                  </optgroup>
                ))}
                <option value="__nuevo">+ Producto nuevo…</option>
                <option value="__libre">Otro gasto de compra (sin inventario)</option>
              </select>
              {line.free || line.fresh ? (
                <input
                  style={{ marginTop: 6 }}
                  value={line.description}
                  onChange={(event) => setLine(index, { description: event.target.value })}
                  placeholder={line.fresh ? 'Nombre del producto' : 'Descripción'}
                  aria-label={line.fresh ? 'Nombre del producto' : 'Descripción'}
                />
              ) : null}
              {line.productId && !line.free && !line.fresh ? (
                <small className="line-use">{USE_LABEL[products.find((item) => item.id === line.productId)?.kind ?? 'venta']}</small>
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
            {line.fresh ? (
              <div className="line-new">
                <div className="choice-row" role="group" aria-label="Uso del producto">
                  {(['venta', 'insumo'] as const).map((use) => (
                    <button key={use} type="button" aria-pressed={line.use === use} onClick={() => setLine(index, { use })}>
                      {USE_LABEL[use]}
                    </button>
                  ))}
                </div>
                <Field label="Unidad">
                  <input value={line.unit} onChange={(event) => setLine(index, { unit: event.target.value })} placeholder="pieza, galón, 500 ml…" />
                </Field>
                {line.use === 'venta' ? (
                  <>
                    <Field label="Categoría">
                      <select value={line.category} onChange={(event) => setLine(index, { category: event.target.value as ShopCategoryName })}>
                        {categoryNames(state.settings).map((item) => (
                          <option key={item}>{item}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Precio de venta (Q)">
                      <input className="num" inputMode="decimal" value={line.price} onChange={(event) => setLine(index, { price: event.target.value })} />
                    </Field>
                  </>
                ) : null}
                <p className="hint">
                  {line.use === 'venta'
                    ? 'Se agrega al inventario de la tienda. Sale en la página en línea cuando le pongas foto en Tienda.'
                    : 'Se agrega a los insumos de grooming. No sale en la tienda.'}
                </p>
              </div>
            ) : null}
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

function PurchaseUse({ purchase }: { purchase: Purchase }) {
  const { state } = useStore()
  const split = purchaseSplit([purchase], state.products)
  return (
    <span className="tag-row">
      {split.venta ? <Tag tone="ok">Venta {money(split.venta)}</Tag> : null}
      {split.insumo ? <Tag tone="info">Servicio {money(split.insumo)}</Tag> : null}
      {split.gasto ? <Tag tone="mute">Sin inventario {money(split.gasto)}</Tag> : null}
    </span>
  )
}

function History() {
  const { state } = useStore()
  const [pdfError, setPdfError] = useState('')
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
                    <small>
                      {item.lines
                        .map((line) => (item.stage ? `${line.qty}× ${line.description}` : `${line.qty}× ${line.description} (${money(line.cost)})`))
                        .join(', ')}
                    </small>
                    <PurchaseUse purchase={item} />
                  </td>
                  <td className="num">{item.stage ? 'Sin precios' : money(item.total)}</td>
                  <td>
                    {item.stage === 'pedida' ? (
                      <Tag tone="warn">Por llegar</Tag>
                    ) : item.stage === 'recibida' ? (
                      <Tag tone="ok">En inventario{item.receivedOn ? ` · ${longDate(item.receivedOn)}` : ''}</Tag>
                    ) : item.terms === 'contado' ? (
                      <Tag tone="ok">
                        {item.method} · {item.document}
                      </Tag>
                    ) : balance > 0 ? (
                      <Tag tone="warn">Debe {money(balance)}</Tag>
                    ) : (
                      <Tag tone="ok">Crédito pagado</Tag>
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        void downloadSupplierPdf(state, item)
                          .then(() => setPdfError(''))
                          .catch(() => setPdfError('No se pudo armar el PDF.'))
                      }}
                    >
                      PDF sin precios
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Flash error={pdfError} />
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
          <p className="empty empty-inset">Todavía no hay proveedores.</p>
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
