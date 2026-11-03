import { useState } from 'react'
import { Field } from '../components/ui'
import { money, newId } from '../format'
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

export function Tienda() {
  const { state, saveProduct } = useStore()
  const products = shelfOf(state.products).filter((item) => item.kind !== 'insumo')
  const [form, setForm] = useState<CatalogItem>(EMPTY)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const editing = products.some((item) => item.id === form.id)

  function edit(item: CatalogItem) {
    setForm(item)
    setError('')
    setNotice('')
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
            const saved = saveProduct({ ...form, id: form.id || newId() })
            if (saved) {
              setError(saved)
              setNotice('')
              return
            }
            setError('')
            setNotice(editing ? 'Producto actualizado.' : 'Producto agregado a la tienda.')
            setForm(EMPTY)
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
              value={String(form.price)}
              onChange={(event) => setForm({ ...form, price: Number(event.target.value) })}
              required
            />
          </Field>
          <Field label="Existencia">
            <input
              className="num"
              inputMode="numeric"
              value={String(form.stock)}
              onChange={(event) => setForm({ ...form, stock: Number(event.target.value) })}
              required
            />
          </Field>
          <Field label="Costo unitario (Q)">
            <input
              className="num"
              inputMode="decimal"
              value={form.cost === undefined ? '' : String(form.cost)}
              onChange={(event) => setForm({ ...form, cost: event.target.value.trim() ? Number(event.target.value) : undefined })}
              placeholder="Para calcular utilidad"
            />
          </Field>
          <Field label="Existencia mínima">
            <input
              className="num"
              inputMode="numeric"
              value={form.minStock === undefined ? '' : String(form.minStock)}
              onChange={(event) => setForm({ ...form, minStock: event.target.value.trim() ? Number(event.target.value) : undefined })}
              placeholder="Aviso para reponer"
            />
          </Field>
          <Field label="Foto">
            <input
              type="file"
              accept="image/*"
              onChange={async (event) => {
                const file = event.target.files?.[0]
                if (!file) return
                const image = await shrinkImage(file)
                if (!image) {
                  setError('No se pudo leer la foto.')
                  return
                }
                setForm((current) => ({ ...current, image }))
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
              <button type="button" className="btn btn-ghost" onClick={() => setForm(EMPTY)}>
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
