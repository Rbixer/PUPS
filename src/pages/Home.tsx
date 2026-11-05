import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Market } from '../components/Market'
import { mapUrl, money, publicSiteContent, whatsappUrl } from '../format'
import { useStore } from '../store'
import { PLAN_MINUTES, TARIFF } from '../visit'

const from = (plan: keyof typeof TARIFF) => Math.min(...Object.values(TARIFF[plan]))

const TICKER = ['Baño', 'Cepillado', 'Uñas', 'Oídos', 'Deslanado', 'Consulta', 'Vacunas', 'Desparasitación', 'Pet shop']

const delay = (index: number) => ({ '--d': index }) as CSSProperties

function Icon({ children }: { children: ReactNode }) {
  return (
    <span className="pillar-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </span>
  )
}

/** Marca cada [data-reveal] cuando entra en pantalla; sin IntersectionObserver se muestran de una vez. */
function useReveal(contentKey: string) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const items = [...(root.current?.querySelectorAll<HTMLElement>('[data-reveal]:not(.is-in)') ?? [])]
    if (!('IntersectionObserver' in window)) {
      items.forEach((item) => item.classList.add('is-in'))
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.classList.add('is-in')
          observer.unobserve(entry.target)
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    )
    items.forEach((item) => observer.observe(item))
    return () => observer.disconnect()
  }, [contentKey])
  return root
}

const sizes = (plan: keyof typeof TARIFF) =>
  Object.entries(TARIFF[plan])
    .map(([size, price]) => `${size.toLowerCase()} ${money(price)}`)
    .join(', ')

const FAQ: { q: string; a: string; link?: { to: string; label: string } }[] = [
  {
    q: '¿Cuánto tiempo toma el grooming?',
    a: `Apartamos ${PLAN_MINUTES.grooming} minutos para el grooming y ${PLAN_MINUTES.premium} minutos para el premium. Al reservar eliges la hora de entrada.`,
  },
  {
    q: '¿Qué incluye cada paquete?',
    a: 'El grooming incluye baño, cepillado, corte de uñas y limpieza de oídos. El premium suma deslanado, cepillado de dientes y extracción de glándulas.',
  },
  {
    q: '¿Cuánto cuesta?',
    a: `Depende del tamaño y del pelaje. Grooming: ${sizes('grooming')}. Premium: ${sizes('premium')}. Son precios de referencia.`,
    link: { to: '/servicios', label: 'Ver todos los servicios' },
  },
  {
    q: '¿Cómo reservo una cita?',
    a: 'En línea: eliges el servicio, el día y la hora, y nos cuentas el nombre, la raza y el tamaño de tu mascota. Al enviar te damos un número de folio.',
    link: { to: '/reservar', label: 'Reservar ahora' },
  },
  {
    q: 'Mi mascota tiene alergias, ¿cómo lo saben?',
    a: 'Nos lo cuentas al reservar y queda anotado en su ficha, así no hay que repetirlo en cada visita.',
  },
  {
    q: '¿Qué me entregan al terminar?',
    a: 'Una constancia de la visita con fecha, hora, costo, fotos y recomendaciones para casa.',
  },
  {
    q: '¿Cómo funciona la tienda en línea?',
    a: 'Agregas los productos, envías el pedido con tu nombre y teléfono, y te los apartamos. Te escribimos para coordinar la entrega y pagas al recogerlos o al recibirlos.',
    link: { to: '/#tienda', label: 'Ver productos' },
  },
]

const faqData = () =>
  JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map((item) => ({ '@type': 'Question', name: item.q, acceptedAnswer: { '@type': 'Answer', text: item.a } })),
  }).replace(/</g, '\\u003c')

export function Home() {
  const { state } = useStore()
  const site = publicSiteContent(state.settings)
  const place = state.settings.address.trim()
  const hours = state.settings.hours.trim()
  const whatsapp = state.settings.whatsapp.trim()
  const root = useReveal(`${site.gallery.length}-${site.reviews.length}-${place ? 1 : 0}`)
  return (
    <div ref={root} className="home">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Guatemala · Veterinaria · Grooming · Pet shop</p>
          <h1>
            Precisión de clínica.
            <br />
            <em>Trato de casa.</em>
          </h1>
          <p className="lede">
            Baño, corte, consulta y tienda en un solo lugar. Reserva en línea la hora que te queda y te recibimos sabiendo
            su raza, tamaño y alergias.
          </p>
          <div className="hero-actions">
            <Link to="/reservar" className="btn btn-primary">
              Reservar cita
            </Link>
            <Link to="/servicios" className="btn btn-ghost">
              Ver servicios y precios
            </Link>
          </div>
          <dl className="hero-metrics">
            <div>
              <dt>Reserva en línea</dt>
              <dd>Eliges el día y la hora</dd>
            </div>
            <div>
              <dt>Su ficha</dt>
              <dd>Raza, tamaño y alergias anotadas</dd>
            </div>
            <div>
              <dt>Constancia</dt>
              <dd>Fotos y recomendaciones de la visita</dd>
            </div>
          </dl>
        </div>
        <div className="hero-stage">
          <article className="stage-card">
            <div className="logo-badge hero-logo">
              <img src="/logo.png" alt="Logo de PUP'S, un shih tzu sobre el letrero de la tienda" width={342} height={345} />
            </div>
            <div className="price-card">
              <p className="eyebrow">Precios de referencia</p>
              <ul>
                <li>
                  <span>
                    Grooming
                    <small>{PLAN_MINUTES.grooming} min · baño, cepillado, uñas y oídos</small>
                  </span>
                  <b className="num">desde {money(from('grooming'))}</b>
                </li>
                <li>
                  <span>
                    Premium
                    <small>{PLAN_MINUTES.premium} min · suma deslanado, dientes y glándulas</small>
                  </span>
                  <b className="num">desde {money(from('premium'))}</b>
                </li>
              </ul>
              <p className="price-note">
                El precio final depende del tamaño y el pelaje. <Link to="/servicios">Ver la tabla completa</Link>
              </p>
            </div>
          </article>
        </div>
      </section>

      <div className="ticker" aria-hidden="true">
        <div className="ticker-track">
          {[...TICKER, ...TICKER].map((item, index) => (
            <span key={index}>{item}</span>
          ))}
        </div>
      </div>

      <section className="section">
        <div className="section-head" data-reveal>
          <p className="eyebrow">Todo en un solo lugar</p>
          <h2>Grooming, veterinaria y tienda en la misma visita.</h2>
        </div>
        <div className="pillars">
          <article className="pillar" data-reveal style={delay(0)}>
            <Icon>
              <circle cx="6" cy="6" r="3" />
              <path d="M8.12 8.12 12 12" />
              <path d="M20 4 8.12 15.88" />
              <circle cx="6" cy="18" r="3" />
              <path d="M14.8 14.8 20 20" />
            </Icon>
            <h3>Grooming</h3>
            <p>Baño, corte y cuidado del pelaje. Anotamos su tamaño y alergias para no repetir preguntas en cada visita.</p>
            <p className="pillar-foot">
              <b>desde {money(from('grooming'))}</b>
              <Link to={`/reservar?servicio=${encodeURIComponent('Baño y corte')}`}>Reservar grooming</Link>
            </p>
          </article>
          <article className="pillar" data-reveal style={delay(1)}>
            <Icon>
              <path d="M11 2v2" />
              <path d="M5 2v2" />
              <path d="M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1" />
              <path d="M8 15a6 6 0 0 0 12 0v-3" />
              <circle cx="20" cy="10" r="2" />
            </Icon>
            <h3>Veterinaria</h3>
            <p>Consulta, vacunas y desparasitación. Te llevas la constancia de la visita con fecha, hora y costo.</p>
            <p className="pillar-foot">
              <span>Precio según la consulta</span>
              <Link to={`/reservar?servicio=${encodeURIComponent('Consulta veterinaria')}`}>Reservar consulta</Link>
            </p>
          </article>
          <article className="pillar" data-reveal style={delay(2)}>
            <Icon>
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
              <path d="M3 6h18" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </Icon>
            <h3>Pet shop</h3>
            <p>Shampoo, accesorios y cuidado. Haz tu pedido en línea y te lo apartamos para recogerlo o recibirlo.</p>
            <p className="pillar-foot">
              <span>Precios en quetzales</span>
              <Link to="/#tienda">Ver productos</Link>
            </p>
          </article>
        </div>
      </section>

      <Market featured={6} />

      {site.gallery.length > 0 ? (
        <section className="section gallery" aria-labelledby="galeria-title">
          <div className="section-head" data-reveal>
            <p className="eyebrow">Recién salidos del baño</p>
            <h2 id="galeria-title">Así se van de PUP'S.</h2>
          </div>
          <ul className="gallery-grid">
            {site.gallery.map((photo, index) => (
              <li key={photo.src} data-reveal style={delay(index % 4)}>
                <figure>
                  <img src={photo.src} alt={photo.caption || "Mascota después de su visita en PUP'S"} loading="lazy" decoding="async" />
                  {photo.caption ? <figcaption>{photo.caption}</figcaption> : null}
                </figure>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="section">
        <div className="section-head" data-reveal>
          <p className="eyebrow">Cómo reservar</p>
          <h2>Tres pasos y tu cita queda apartada.</h2>
        </div>
        <ol className="steps">
          <li data-reveal style={delay(0)}>
            <span className="num">01</span>
            <h3>Eliges servicio, día y hora</h3>
            <p>Nos cuentas el nombre, la raza y el tamaño de tu mascota, y si tiene alguna alergia.</p>
          </li>
          <li data-reveal style={delay(1)}>
            <span className="num">02</span>
            <h3>Recibes tu número de reserva</h3>
            <p>Al enviar la reserva te damos un número de folio y te esperamos a la hora que elegiste.</p>
          </li>
          <li data-reveal style={delay(2)}>
            <span className="num">03</span>
            <h3>Te llevas su constancia</h3>
            <p>Al terminar te entregamos el resumen de la visita con fotos y recomendaciones.</p>
          </li>
        </ol>
      </section>

      {site.reviews.length > 0 ? (
        <section className="section reviews" aria-labelledby="resenas-title">
          <div className="section-head" data-reveal>
            <p className="eyebrow">Lo que dicen nuestros clientes</p>
            <h2 id="resenas-title">Peludos felices, dueños tranquilos.</h2>
          </div>
          <ul className="review-grid">
            {site.reviews.map((review, index) => (
              <li key={`${review.name}-${index}`} data-reveal style={delay(index % 3)}>
                <blockquote>
                  <p>{review.text}</p>
                  <footer>{review.name}</footer>
                </blockquote>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="section faq" aria-labelledby="faq-title">
        <div className="section-head" data-reveal>
          <p className="eyebrow">Preguntas frecuentes</p>
          <h2 id="faq-title">Lo que más nos preguntan.</h2>
        </div>
        <div className="faq-list" data-reveal>
          {FAQ.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>
                {item.a}
                {item.link ? (
                  <>
                    {' '}
                    <Link to={item.link.to}>{item.link.label}</Link>
                  </>
                ) : null}
              </p>
            </details>
          ))}
        </div>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqData() }} />
      </section>

      {place ? (
        <section className="section visit" aria-labelledby="visita-title">
          <div className="visit-card" data-reveal>
            <div>
              <p className="eyebrow">Visítanos</p>
              <h2 id="visita-title">{place}</h2>
              {hours ? <p className="visit-hours">{hours}</p> : null}
            </div>
            <div className="hero-actions">
              <a className="btn btn-primary" href={mapUrl(place)} target="_blank" rel="noopener noreferrer">
                Cómo llegar
              </a>
              {whatsapp ? (
                <a className="btn btn-ghost" href={whatsappUrl(whatsapp, "Hola PUP'S, quiero información.")} target="_blank" rel="noopener noreferrer">
                  Escribir por WhatsApp
                </a>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      <section className="cta-band" data-reveal>
        <div className="cta-copy">
          <p className="eyebrow">Tu próxima visita</p>
          <h2>¿Le toca baño a tu peludo?</h2>
          <p>Aparta su hora en línea. Te recibimos sabiendo su raza, tamaño y alergias.</p>
          <div className="hero-actions">
            <Link to="/reservar" className="btn btn-primary">
              Reservar ahora
            </Link>
            <Link to="/servicios" className="btn btn-ghost">
              Ver precios
            </Link>
          </div>
        </div>
        <img className="cta-dog" src="/logo.png" alt="" width={342} height={345} loading="lazy" />
      </section>
    </div>
  )
}
