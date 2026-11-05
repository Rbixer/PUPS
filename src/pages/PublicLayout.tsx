import { Suspense, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Brand } from '../components/ui'
import { mapUrl, safeLink, whatsappUrl } from '../format'
import { useStore } from '../store'
import { usePanelTheme } from '../theme'

const CHAT = "Hola PUP'S, quiero información."

function businessData(address: string, whatsapp: string) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'PetStore',
    name: "PUP'S Pet Shop y Grooming",
    description: 'Grooming, veterinaria y pet shop en Guatemala.',
    url: window.location.origin,
    image: `${window.location.origin}/og.jpg`,
    priceRange: 'Q',
    address: { '@type': 'PostalAddress', streetAddress: address, addressCountry: 'GT' },
    ...(whatsapp ? { telephone: whatsapp } : {}),
  }
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

const LINKS = [
  { to: '/', label: 'Inicio' },
  { to: '/#tienda', label: 'Tienda' },
  { to: '/servicios', label: 'Servicios' },
  { to: '/reservar', label: 'Reservar' },
  { to: '/contacto', label: 'Contacto' },
]

export function NoEncontrada() {
  return (
    <section className="section page not-found">
      <p className="eyebrow">Error 404</p>
      <h1>No encontramos esta página.</h1>
      <p className="lede">Puede que el enlace esté incompleto o que la página ya no exista.</p>
      <div className="not-found-actions">
        <Link to="/" className="btn btn-primary">
          Ir al inicio
        </Link>
        <Link to="/reservar" className="btn btn-ghost">
          Reservar una cita
        </Link>
      </div>
    </section>
  )
}

export function PublicLayout() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const { state } = useStore()
  usePanelTheme(false)

  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!location.hash) {
      window.scrollTo({ top: 0, behavior: 'instant' })
      return
    }
    const id = decodeURIComponent(location.hash.slice(1))
    const frame = window.requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    return () => window.cancelAnimationFrame(frame)
  }, [location.pathname, location.hash, location.key])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    const titles: Record<string, string> = {
      '/': "PUP'S · Pet Shop y Grooming",
      '/servicios': "Servicios · PUP'S",
      '/reservar': "Reservar · PUP'S",
      '/contacto': "Contacto · PUP'S",
    }
    document.title = titles[location.pathname] ?? "Página no encontrada · PUP'S"
  }, [location.pathname])

  const place = state.settings.address.trim()
  const hours = state.settings.hours.trim() || 'Horario por confirmar'
  const address = place || 'Guatemala'
  const whatsapp = state.settings.whatsapp.trim()
  const promo = (state.settings.promoText ?? '').trim()
  const promoLink = safeLink(state.settings.promoLink)

  return (
    <div className="site">
      {promo ? (
        <p className="promo-bar">
          <span>{promo}</span>
          {promoLink.startsWith('/') ? (
            <Link to={promoLink}>Ver más</Link>
          ) : promoLink ? (
            <a href={promoLink} target="_blank" rel="noopener noreferrer">
              Ver más
            </a>
          ) : null}
        </p>
      ) : null}
      <header className={open ? 'nav open' : 'nav'}>
        <NavLink to="/" className="brand-link" aria-label="PUP'S inicio">
          <Brand />
        </NavLink>
        <button
          type="button"
          className="nav-toggle"
          aria-expanded={open}
          aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
          onClick={() => setOpen((value) => !value)}
        >
          <span />
          <span />
        </button>
        <nav className="nav-links" aria-label="Secciones">
          {LINKS.map((link) => {
            const shop = location.pathname === '/' && location.hash === '#tienda'
            const current = link.to === '/#tienda' ? shop : link.to === '/' ? location.pathname === '/' && !shop : location.pathname === link.to
            return (
              <Link key={link.to} to={link.to} className={current ? 'active' : undefined} aria-current={current ? 'page' : undefined}>
                {link.label}
              </Link>
            )
          })}
        </nav>
        <div className="nav-cta">
          <NavLink to="/reservar" className="btn btn-primary btn-sm">
            Reservar
          </NavLink>
        </div>
      </header>
      {open ? <button type="button" className="scrim" aria-label="Cerrar menú" onClick={() => setOpen(false)} /> : null}
      <main>
        <Suspense
          fallback={
            <div className="route-loading" aria-busy="true" aria-label="Cargando">
              <span />
              <span />
              <span />
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>
      <footer className="footer">
        <div className="footer-grid">
          <div>
            <Brand />
            <p>Veterinaria, grooming y pet shop.</p>
          </div>
          <div>
            <p className="eyebrow">Visítanos</p>
            <p>{address}</p>
            <p>{hours}</p>
            {place ? (
              <a href={mapUrl(place)} target="_blank" rel="noopener noreferrer">
                Ver en el mapa
              </a>
            ) : null}
          </div>
          <div>
            <p className="eyebrow">Contacto</p>
            {whatsapp ? (
              <a className="num" href={whatsappUrl(whatsapp, CHAT)} target="_blank" rel="noopener noreferrer">
                WhatsApp {whatsapp}
              </a>
            ) : (
              <p>Escríbenos desde el formulario.</p>
            )}
            <p>
              <NavLink to="/contacto">Ir a contacto</NavLink>
            </p>
          </div>
        </div>
        <p className="footer-staff">
          <NavLink to="/login">Acceso del personal</NavLink>
        </p>
      </footer>
      {whatsapp ? (
        <a className="wa-float" href={whatsappUrl(whatsapp, CHAT)} target="_blank" rel="noopener noreferrer" aria-label="Escríbenos por WhatsApp">
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.8-1.2.2-.6.2-1.1.1-1.2l-.4-.3Z"
            />
          </svg>
        </a>
      ) : null}
      {place ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: businessData(place, whatsapp) }} /> : null}
    </div>
  )
}
