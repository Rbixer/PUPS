import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Brand } from '../components/ui'
import { useStore } from '../store'

const LINKS = [
  { to: '/', label: 'Inicio' },
  { to: '/servicios', label: 'Servicios' },
  { to: '/reservar', label: 'Reservar' },
  { to: '/contacto', label: 'Contacto' },
]

const TICKER = ['Grooming', 'Veterinaria', 'Pet shop', 'Ficha de la mascota', 'Constancia', 'Caja del día', 'WhatsApp']

export function PublicLayout() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const { state } = useStore()

  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  useEffect(() => {
    const titles: Record<string, string> = {
      '/': "PUP'S · Pet Shop y Grooming",
      '/servicios': "Servicios · PUP'S",
      '/reservar': "Reservar · PUP'S",
      '/contacto': "Contacto · PUP'S",
    }
    document.title = titles[location.pathname] ?? "PUP'S"
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
          {LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.to === '/'}>
              {link.label}
            </NavLink>
          ))}
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
      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          {[...TICKER, ...TICKER].map((item, index) => (
            <span key={`${item}-${index}`}>{item}</span>
          ))}
        </div>
      </div>
      <main>
        <Outlet />
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
