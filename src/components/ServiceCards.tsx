import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { SERVICES } from '../catalog'

const ICONS: Record<string, ReactNode> = {
  'Baño y secado': (
    <>
      <path d="m4 4 2.5 2.5" />
      <path d="M13.5 6.5a4.95 4.95 0 0 0-7 7" />
      <path d="M15 5 5 15" />
      <path d="M14 17v.01M10 16v.01M13 13v.01M16 10v.01M11 20v.01M17 14v.01M20 11v.01" />
    </>
  ),
  'Corte de raza': (
    <>
      <circle cx="6" cy="6" r="3" />
      <path d="M8.12 8.12 12 12" />
      <path d="M20 4 8.12 15.88" />
      <circle cx="6" cy="18" r="3" />
      <path d="M14.8 14.8 20 20" />
    </>
  ),
  'Baño y corte': (
    <>
      <path d="M9.94 15.5a2 2 0 0 0-1.44-1.44l-6.13-1.58a.5.5 0 0 1 0-.96l6.13-1.58a2 2 0 0 0 1.44-1.44l1.58-6.13a.5.5 0 0 1 .96 0l1.58 6.13a2 2 0 0 0 1.44 1.44l6.13 1.58a.5.5 0 0 1 0 .96l-6.13 1.58a2 2 0 0 0-1.44 1.44l-1.58 6.13a.5.5 0 0 1-.96 0Z" />
      <path d="M20 3v4M22 5h-4" />
    </>
  ),
  'Corte higiénico': (
    <>
      <circle cx="11" cy="4" r="2" />
      <circle cx="18" cy="8" r="2" />
      <circle cx="20" cy="16" r="2" />
      <path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.05Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z" />
    </>
  ),
  'Grooming premium': (
    <>
      <path d="M11.56 3.27a.5.5 0 0 1 .88 0l2.95 5.6a1 1 0 0 0 1.52.3l4.27-3.67a.5.5 0 0 1 .8.52l-2.83 10.25a1 1 0 0 1-.96.73H5.81a1 1 0 0 1-.96-.73L2.02 6.02a.5.5 0 0 1 .8-.52l4.27 3.67a1 1 0 0 0 1.52-.3Z" />
      <path d="M5 21h14" />
    </>
  ),
  'Pet shop': (
    <>
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </>
  ),
}

const delay = (index: number) => ({ '--d': index % 3 }) as CSSProperties

/** Con `reveal`, cada tarjeta espera a que la página la marque al entrar en pantalla. */
export function ServiceCards({ reveal = false }: { reveal?: boolean }) {
  return (
    <div className="pillars service-cards">
      {SERVICES.map((service, index) => (
        <article key={service.name} className="pillar" data-reveal={reveal ? '' : undefined} style={reveal ? delay(index) : undefined}>
          <span className="pillar-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {ICONS[service.name]}
            </svg>
          </span>
          <h3>{service.name}</h3>
          <p>{service.detail}</p>
          <p className="pillar-foot">
            {service.name === 'Pet shop' ? (
              <Link to="/#tienda">Ver productos</Link>
            ) : (
              <Link to={`/reservar?servicio=${encodeURIComponent(service.name)}`}>Reservar {service.name.toLowerCase()}</Link>
            )}
          </p>
        </article>
      ))}
    </div>
  )
}
