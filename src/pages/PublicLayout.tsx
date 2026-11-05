import { Suspense, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Brand } from '../components/ui'
import { useStore } from '../store'
import { usePanelTheme } from '../theme'

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

  const hours = state.settings.hours.trim() || 'Horario por confirmar'
  const address = state.settings.address.trim() || 'Guatemala'
  const whatsapp = state.settings.whatsapp.trim()

  return (
    <div className="site">
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
          <NavLink to="/login" className="btn btn-ghost btn-sm">
            Panel
          </NavLink>
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
          </div>
          <div>
            <p className="eyebrow">Contacto</p>
            {whatsapp ? <p className="num">{whatsapp}</p> : <p>Escríbenos desde el formulario.</p>}
            <NavLink to="/contacto">Ir a contacto</NavLink>
          </div>
        </div>
      </footer>
    </div>
  )
}
