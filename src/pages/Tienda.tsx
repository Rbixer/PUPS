import { useState } from 'react'
import { Field } from '../components/ui'
import { money, newId, parseAmount } from '../format'
import { shrinkImage } from '../image'
import { SHOP_CATEGORY_NAMES, shelfOf } from '../shop'
import { useStore } from '../store'
import type { CatalogItem, ShopCategoryName } from '../types'

const EMPTY: CatalogItem = {
  id: '',
  name: '',
  detail: '',
  category: 'Accesorios',
  price: 0,
  unit: 'pieza',
  stock: 0,
  image: '',
  active: true,
}

type Amounts = { price: string; stock: string; cost: string; minStock: string }

const amountsOf = (item: CatalogItem): Amounts => ({
  price: item.id ? String(item.price) : '',
  stock: item.id ? String(item.stock) : '',
  cost: item.cost === undefined ? '' : String(item.cost),
  minStock: item.minStock === undefined ? '' : String(item.minStock),
})

export function Tienda() {
  const { state, saveProduct, allows } = useStore()
  const products = shelfOf(state.products).filter((item) => item.kind !== 'insumo')
  const [form, setForm] = useState<CatalogItem>(EMPTY)
  const [amounts, setAmounts] = useState<Amounts>(() => amountsOf(EMPTY))
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const editing = products.some((item) => item.id === form.id)
  const canCost = allows('compras')

  function edit(item: CatalogItem) {
    setForm(item)
    setAmounts(amountsOf(item))
    setError('')
    setNotice('')
  }

  function reset() {
    setForm(EMPTY)
    setAmounts(amountsOf(EMPTY))
  }

  return (
    <section className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">Ventas y caja</p>
          <h1>Tienda</h1>
          <p className="lede">Productos de la portada. El precio, la foto y la existencia se guardan aquí.</p>
        </div>
      </header>
      <div className="cash-desk">
        <form
          className="panel form-grid"
          onSubmit={(event) => {
            event.preventDefault()
            const price = parseAmount(amounts.price)
            const stock = parseAmount(amounts.stock)
            const cost = amounts.cost.trim() ? parseAmount(amounts.cost) : undefined
            const minStock = amounts.minStock.trim() ? parseAmount(amounts.minStock) : undefined
            if (!Number.isFinite(price) || price <= 0) {
              setError('Escribe un precio mayor a cero.')
              setNotice('')
              return
            }
            if (!editing && (!Number.isInteger(stock) || stock < 0)) {
              setError('La existencia inicial debe ser un número entero, cero o más.')
              setNotice('')
              return
            }
            if ((cost !== undefined && (!Number.isFinite(cost) || cost < 0)) || (minStock !== undefined && (!Number.isFinite(minStock) || minStock < 0))) {
              setError('El costo y la existencia mínima deben ser números válidos.')
              setNotice('')
              return
            }
            const saved = saveProduct({ ...form, id: form.id || newId(), price, stock: editing ? form.stock : stock, cost, minStock })
            if (saved) {
              setError(saved)
              setNotice('')
              return
            }
            setError('')
            setNotice(editing ? 'Producto actualizado.' : 'Producto agregado a la tienda.')
            reset()
          }}
        >
          <h2>{editing ? 'Editar producto' : 'Nuevo producto'}</h2>
          <Field label="Nombre">
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          </Field>
          <Field label="Categoría">
            <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as ShopCategoryName })}>
              {SHOP_CATEGORY_NAMES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
          <Field label="Detalle">
            <input value={form.detail} onChange={(event) => setForm({ ...form, detail: event.target.value })} />
          </Field>
          <Field label="Unidad">
            <input value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} placeholder="pieza, 250 ml…" />
          </Field>
          <Field label="Precio (Q)">
            <input
              className="num"
              inputMode="decimal"
              value={amounts.price}
              onChange={(event) => setAmounts({ ...amounts, price: event.target.value })}
              required
            />
          </Field>
          {editing ? (
            <Field label="Existencia">
              <input className="num" value={`${form.stock} ${form.unit}`} readOnly aria-describedby="stock-hint" />
            </Field>
          ) : (
            <Field label="Existencia inicial">
              <input className="num" inputMode="numeric" value={amounts.stock} onChange={(event) => setAmounts({ ...amounts, stock: event.target.value })} placeholder="0" />
            </Field>
          )}
          {canCost || !editing ? (
            <Field label="Costo unitario (Q)">
              <input
                className="num"
                inputMode="decimal"
                value={amounts.cost}
                onChange={(event) => setAmounts({ ...amounts, cost: event.target.value })}
                placeholder="Para calcular utilidad"
              />
            </Field>
          ) : null}
          <Field label="Existencia mínima">
            <input
              className="num"
              inputMode="numeric"
              value={amounts.minStock}
              onChange={(event) => setAmounts({ ...amounts, minStock: event.target.value })}
              placeholder="Aviso para reponer"
            />
          </Field>
          {editing ? (
            <p className="hint" id="stock-hint">
              La existencia cambia con ventas, compras y ajustes de Inventario, así el kárdex cuadra.
            </p>
          ) : null}
          <Field label="Foto">
            <input
              type="file"
              accept="image/*"
              onChange={async (event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (!file) return
                try {
                  const image = await shrinkImage(file)
                  setForm((current) => ({ ...current, image }))
                } catch {
                  setError('No se pudo leer esa foto. Prueba con otra en formato JPG o PNG.')
                }
              }}
            />
          </Field>
          {form.image ? <img className="shelf-preview" src={form.image} alt="" /> : null}
          <label className="check-line">
            <input type="checkbox" checked={form.active !== false} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
            Visible en la portada
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          {notice ? <p className="banner">{notice}</p> : null}
          <div className="overlay-actions">
            {editing ? (
              <button type="button" className="btn btn-ghost" onClick={reset}>
                Cancelar
              </button>
            ) : null}
            <button type="submit" className="btn btn-primary">
              {editing ? 'Guardar cambios' : 'Agregar producto'}
            </button>
          </div>
        </form>
        <div className="ledger">
          <header className="module-bar">
            <h2>En catálogo</h2>
            <span>{products.length}</span>
          </header>
          <div className="records">
            {products.map((item) => (
              <article key={item.id} className="record shelf">
                <img src={item.image || '/shop/shampoo-suave.jpg'} alt="" />
                <div>
                  <strong>{item.name}</strong>
                  <span>
                    {item.category} · {money(item.price)} · {item.stock} {item.unit}
                    {item.active === false ? ' · oculto' : ''}
                  </span>
                </div>
                <div className="shelf-actions">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => edit(item)}>
                    Editar
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      const saved = saveProduct({ ...item, active: item.active === false })
                      setError(saved ?? '')
                      setNotice(saved ? '' : item.active === false ? `${item.name} vuelve a la portada.` : `${item.name} quedó oculto.`)
                    }}
                  >
                    {item.active === false ? 'Mostrar' : 'Ocultar'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
