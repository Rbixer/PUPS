import { useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Field } from './ui'
import { money } from '../format'
import { SHOP_CATEGORIES, shelfOf, visibleCatalog, type ShopCategory, type ShopProduct } from '../shop'
import { useStore } from '../store'

export function Market({ featured }: { featured?: number }) {
  const { state, placeShopOrder } = useStore()
  const [category, setCategory] = useState<ShopCategory>('Todo')
  const [expanded, setExpanded] = useState(false)
  const { hash } = useLocation()
  const [cart, setCart] = useState<Record<string, number>>({})
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState('')
  const [sending, setSending] = useState(false)

  const catalog = shelfOf(state.products)
  const matching = visibleCatalog(state.products)
    .filter((item) => category === 'Todo' || item.category === category)
    .sort((a, b) => Number(b.stock > 0) - Number(a.stock > 0))
  const trimmed = featured !== undefined && category === 'Todo' && !expanded && hash !== '#tienda' && matching.length > featured
  const visible = trimmed ? matching.slice(0, featured) : matching
  const lines = useMemo(
    () =>
      catalog.flatMap((item) => {
        const qty = cart[item.id] ?? 0
        return qty > 0 ? [{ item, qty }] : []
      }),
    [catalog, cart],
  )
  const total = lines.reduce((sum, line) => sum + line.item.price * line.qty, 0)

  function setQty(product: ShopProduct, next: number) {
    setSent('')
    setCart((current) => {
      const qty = Math.max(0, Math.min(product.stock, next))
      const copy = { ...current }
      if (qty === 0) delete copy[product.id]
      else copy[product.id] = qty
      return copy
    })
  }

  return (
    <section className="section market-wrap" id="tienda">
      <div className="section-head">
        <p className="eyebrow">Tienda</p>
        <h2>Shampoo, accesorios y cuidado para llevar.</h2>
        <p className="lede">
          Precios en quetzales. Al enviar el pedido te apartamos los productos y pagas al recogerlos o al recibirlos.
        </p>
      </div>

      <div className="market-filters" role="group" aria-label="Categorías">
        {SHOP_CATEGORIES.map((item) => (
          <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)}>
            {item}
          </button>
        ))}
      </div>

      <div className="market">
        <div className="market-grid">
          {visible.map((product) => {
            const qty = cart[product.id] ?? 0
            return (
              <article key={product.id} className="product">
                <img className="product-photo" src={product.image} alt={product.name} loading="lazy" decoding="async" />
                <div className="product-body">
                  <p className="product-cat">{product.category}</p>
                  <h3>{product.name}</h3>
                  <p>{product.detail}</p>
                  <p className="product-meta">
                    <span className="num">{money(product.price)}</span>
                    <span>
                      {product.unit} · {product.stock} en existencia
                    </span>
                  </p>
                {product.stock <= 0 ? (
                  <button type="button" className="btn btn-ghost btn-sm" disabled>
                    Agotado
                  </button>
                ) : qty === 0 ? (
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => setQty(product, 1)}>
                    Agregar
                  </button>
                ) : (
                    <div className="qty">
                      <button type="button" aria-label={`Quitar uno de ${product.name}`} onClick={() => setQty(product, qty - 1)}>
                        −
                      </button>
                      <span className="num">{qty}</span>
                      <button type="button" aria-label={`Sumar uno de ${product.name}`} onClick={() => setQty(product, qty + 1)} disabled={qty >= product.stock}>
                        +
                      </button>
                    </div>
                  )}
                </div>
              </article>
            )
          })}
          {trimmed ? (
            <button type="button" className="btn btn-ghost market-more" onClick={() => setExpanded(true)}>
              Ver los {matching.length} productos
            </button>
          ) : null}
        </div>

        {lines.length > 0 ? (
          <div className="cart-bar" role="status">
            <span>
              {lines.reduce((sum, line) => sum + line.qty, 0)} en el pedido · <strong className="num">{money(total)}</strong>
            </span>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => document.getElementById('pedido')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
              Ver pedido
            </button>
          </div>
        ) : null}

        <aside className="cart" id="pedido">
          <h3>Pedido</h3>
          {lines.length === 0 ? <p className="hint">Todavía no hay productos.</p> : null}
          <ul>
            {lines.map(({ item, qty }) => (
              <li key={item.id}>
                <img src={item.image} alt="" width={40} height={40} />
                <span>
                  {item.name}
                  <small className="num">
                    {' '}
                    × {qty}
                  </small>
                </span>
                <b className="num">{money(item.price * qty)}</b>
              </li>
            ))}
          </ul>
          <p className="cart-total">
            <span>Total</span>
            <strong className="num">{money(total)}</strong>
          </p>
          <form
            className="cart-form"
            onSubmit={async (event) => {
              event.preventDefault()
              if (sending) return
              if (lines.length === 0) {
                setError('Agrega al menos un producto.')
                return
              }
              if (!name.trim() || !phone.trim()) {
                setError('Nombre y teléfono son obligatorios.')
                return
              }
              setSending(true)
              const result = await placeShopOrder({
                name,
                phone,
                lines: lines.map((line) => ({ id: line.item.id, qty: line.qty })),
              })
              setSending(false)
              if (!result.ok) {
                setError(result.error)
                setSent('')
                return
              }
              setCart({})
              setName('')
              setPhone('')
              setError('')
              setSent(`Pedido recibido con el número ${result.document}. Te escribimos para coordinar la entrega.`)
            }}
          >
            <Field label="Nombre">
              <input value={name} autoComplete="name" onChange={(event) => setName(event.target.value)} required />
            </Field>
            <Field label="Teléfono">
              <input value={phone} autoComplete="tel" inputMode="tel" placeholder="+502" onChange={(event) => setPhone(event.target.value)} required />
            </Field>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            {sent ? <p className="banner" role="status">{sent}</p> : null}
            <button type="submit" className="btn btn-primary" disabled={lines.length === 0 || sending}>
              {sending ? 'Enviando…' : 'Enviar pedido'}
            </button>
          </form>
        </aside>
      </div>
    </section>
  )
}
