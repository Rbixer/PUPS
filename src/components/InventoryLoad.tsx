import { useRef, useState } from 'react'
import { count, longDate } from '../format'
import {
  buildLoad,
  downloadInventoryTemplate,
  fold,
  readInventorySheet,
  type InventoryImportRow,
  type LoadRow,
  type ParsedRow,
  type SkippedRow,
} from '../inventoryImport'
import type { InventoryImportResult } from '../ops'
import { shelfOf } from '../shop'
import { useStore } from '../store'
import type { ProductUse, Purchase } from '../types'
import { Field, Flash, Tag } from './ui'

const USE_LABEL: Record<ProductUse, string> = { venta: 'Ventas', insumo: 'Servicio' }

function summary(result: InventoryImportResult) {
  const parts: string[] = []
  if (result.created) parts.push(count(result.created, 'producto nuevo', 'productos nuevos'))
  if (result.updated) parts.push(count(result.updated, 'producto actualizado', 'productos actualizados'))
  if (parts.length === 0) return 'El inventario ya estaba igual. No hubo cambios.'
  const same = result.unchanged ? ` ${count(result.unchanged, 'quedó igual', 'quedaron igual')}.` : ''
  return `Se subió el inventario: ${parts.join(' y ')}.${same}`
}

function difference(row: LoadRow) {
  if (row.orderQty === null) return '—'
  const value = row.qty - row.orderQty
  return value > 0 ? `+${value}` : String(value)
}

function toImport(row: LoadRow): InventoryImportRow {
  return {
    name: row.name,
    qty: row.qty,
    use: row.use,
    sku: row.sku,
    unit: row.unit,
    category: row.category,
    cost: row.cost,
    price: row.price,
    expiresOn: row.expiresOn,
    minStock: row.minStock,
    detail: row.detail,
    image: row.image,
  }
}

export function InventoryLoad() {
  const { state, allows, importInventory } = useStore()
  const products = shelfOf(state.products)
  const purchases = state.purchases ?? []
  const fileRef = useRef<HTMLInputElement>(null)
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null)
  const [skipped, setSkipped] = useState<SkippedRow[]>([])
  const [query, setQuery] = useState('')
  const [purchaseId, setPurchaseId] = useState('')
  const [validated, setValidated] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const canUpload = allows('inventario_crear') && allows('ajustar')
  const purchase = purchases.find((item) => item.id === purchaseId) ?? null
  const load = parsed ? buildLoad(products, parsed, purchase) : null
  const hasErrors = Boolean(load?.rows.some((row) => row.error))
  const firstError = load?.rows.find((row) => row.error)?.error ?? ''
  const needle = fold(query)
  const shown = load?.rows.filter((row) => !needle || fold(`${row.name} ${row.catalogName ?? ''} ${row.displayCategory} ${row.detail ?? ''} ${row.sku ?? ''}`).includes(needle)) ?? []
  const visible = shown.slice(0, 80)

  function pickPurchase(id: string) {
    setPurchaseId(id)
    setValidated(false)
  }

  function setUse(line: number, use: ProductUse) {
    setParsed((current) => current?.map((row) => (row.line === line ? { ...row, use } : row)) ?? current)
    setValidated(false)
  }

  function setListed(use: ProductUse) {
    const lines = new Set(shown.map((row) => row.line))
    setParsed((current) => current?.map((row) => (lines.has(row.line) ? { ...row, use } : row)) ?? current)
    setValidated(false)
  }

  async function onFile(file: File) {
    setBusy(true)
    setError('')
    setNotice('')
    setValidated(false)
    setQuery('')
    try {
      const result = await readInventorySheet(await file.arrayBuffer())
      if (result.error) {
        setError(result.error)
        setParsed(null)
        setSkipped(result.skipped)
        return
      }
      setSkipped(result.skipped)
      setParsed(result.rows)
    } catch {
      setError('No se pudo leer el Excel. Usa la plantilla .xlsx.')
      setParsed(null)
      setSkipped([])
    } finally {
      setBusy(false)
    }
  }

  function commit() {
    if (!load || hasErrors) return
    setError('')
    setNotice('')
    const result = importInventory(load.rows.map(toImport))
    if (!result.ok) {
      setError(result.error)
      return
    }
    setParsed(null)
    setSkipped([])
    setQuery('')
    setValidated(false)
    if (fileRef.current) fileRef.current.value = ''
    setNotice(summary(result.value))
  }

  return (
    <section className="ledger inventory-load">
      <header className="module-bar">
        <h2>Cargar desde Excel</h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void downloadInventoryTemplate().catch(() => setError('No se pudo armar la plantilla.'))}>
          Plantilla
        </button>
      </header>
      <div className="biz-form">
        <p className="hint" style={{ margin: 0 }}>
          Acepta la plantilla o el Excel de productos (Nombre, Cantidad a la mano, Precio de venta, Categoría del producto). La existencia del archivo es la que quedará. Compara con el pedido y marca en cada fila si entra a ventas o a servicio. Después de validar aparece Subir inventario.
        </p>
        <div className="form-pair">
          <Field label="Archivo .xlsx">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void onFile(file)
              }}
            />
          </Field>
          <Field label="Pedido al proveedor">
            <select value={purchaseId} onChange={(event) => pickPurchase(event.target.value)}>
              <option value="">Sin pedido para comparar</option>
              {purchases.map((item) => (
                <option key={item.id} value={item.id}>
                  {orderLabel(item)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {!canUpload ? <p className="hint">Para subir el inventario hace falta permiso de crear productos y de ajustar existencias.</p> : null}
        {purchases.length === 0 ? <p className="hint">Cuando registres una compra, el pedido aparece aquí para compararlo.</p> : null}

        {skipped.length > 0 ? (
          <p className="hint">
            Se omitieron {count(skipped.length, 'fila', 'filas')} que en el Excel son servicios, gastos o envíos: {skipped.map((item) => item.name).join(', ')}.
          </p>
        ) : null}
        {load ? (
          <>
            <div className="form-pair">
              <Field label={`Productos del archivo (${load.rows.length})`}>
                <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nombre, categoría o referencia" aria-label="Buscar en el archivo" />
              </Field>
              {query.trim() ? (
                <div className="choice-row" role="group" aria-label="Destino de la lista filtrada" style={{ alignSelf: 'end' }}>
                  <button type="button" onClick={() => setListed('venta')}>
                    Estos a ventas
                  </button>
                  <button type="button" onClick={() => setListed('insumo')}>
                    Estos a servicio
                  </button>
                </div>
              ) : null}
            </div>
            <div className="table-wrap">
              <table className="biz-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th className="num">Ahora</th>
                    <th className="num">Quedará</th>
                    <th className="num">Pedido</th>
                    <th className="num">Diferencia</th>
                    <th>Comparación</th>
                    <th>Destino</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr key={row.line}>
                      <td>
                        <strong>{row.catalogName ?? (row.name || `Fila ${row.line}`)}</strong>
                        <small>
                          {[row.displayCategory, row.displayUnit, row.detail].filter(Boolean).join(' · ')}
                          {row.sku ? ` · ${row.sku}` : ''}
                          {row.catalogName && fold(row.catalogName) !== fold(row.name) ? ` · en el archivo: ${row.name}` : ''}
                        </small>
                        {row.warning ? <small>{row.warning}</small> : null}
                        {row.error ? <small className="form-error">{row.error}</small> : null}
                      </td>
                      <td className="num">{row.currentStock ?? '—'}</td>
                      <td className="num">{row.qty}</td>
                      <td className="num">{row.orderQty ?? '—'}</td>
                      <td className="num">{difference(row)}</td>
                      <td>
                        <RowStatus row={row} />
                      </td>
                      <td>
                        <div className="choice-row" role="group" aria-label={`Destino de ${row.catalogName ?? row.name}`}>
                          {(['venta', 'insumo'] as const).map((use) => (
                            <button key={use} type="button" aria-pressed={row.use === use} onClick={() => setUse(row.line, use)}>
                              {USE_LABEL[use]}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {shown.length > visible.length ? (
              <p className="hint">
                Mostrando {visible.length} de {shown.length}. Busca para ver el resto. Validar y subir aplican el archivo completo.
              </p>
            ) : null}
            {query.trim() && shown.length === 0 ? <p className="empty empty-inset">Ningún producto coincide con la búsqueda.</p> : null}
            {load.missing.length > 0 ? (
              <div>
                <p className="hint" style={{ marginBottom: 6 }}>
                  En el pedido, pero no en el archivo
                </p>
                <ul className="hint" style={{ margin: 0, paddingLeft: 18 }}>
                  {load.missing.map((item, index) => (
                    <li key={`${item.description}-${index}`}>
                      {item.description} × {item.qty}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {hasErrors ? <p className="form-error">{firstError}</p> : null}
            {validated ? (
              <p className="banner" role="status">
                {purchase
                  ? 'Comparación revisada. Si las diferencias están bien, sube el inventario.'
                  : 'Archivo revisado, sin pedido para comparar. La existencia del archivo es la que quedará.'}
              </p>
            ) : null}
            <div className="biz-row" style={{ justifyContent: 'flex-end' }}>
              {validated ? (
                <button type="button" className="btn btn-primary" disabled={!canUpload || hasErrors || busy} onClick={commit}>
                  Subir inventario
                </button>
              ) : (
                <button type="button" className="btn btn-primary" disabled={!canUpload || hasErrors || busy || !load.rows.length} onClick={() => setValidated(true)}>
                  Validar comparación
                </button>
              )}
            </div>
          </>
        ) : null}
        <Flash error={error} notice={notice} />
      </div>
    </section>
  )
}

function orderLabel(item: Purchase) {
  return `${item.number} · ${item.supplierName} · ${longDate(item.date)}`
}

function RowStatus({ row }: { row: LoadRow }) {
  return (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
      {row.fresh ? <Tag tone="info">Nuevo</Tag> : null}
      {row.status === 'coincide' ? <Tag tone="ok">Coincide</Tag> : null}
      {row.status === 'sobra' ? <Tag tone="warn">De más</Tag> : null}
      {row.status === 'falta' ? <Tag tone="warn">De menos</Tag> : null}
      {row.status === 'ajeno' ? <Tag tone="info">Fuera del pedido</Tag> : null}
      {row.previousUse && row.previousUse !== row.use ? <Tag tone="mute">{row.use === 'insumo' ? 'Pasa a servicio' : 'Pasa a ventas'}</Tag> : null}
      {row.warning ? <Tag tone="warn">Aviso</Tag> : null}
      {row.error ? <Tag tone="bad">Revisar</Tag> : null}
    </span>
  )
}
