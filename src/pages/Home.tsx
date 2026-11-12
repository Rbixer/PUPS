import { useEffect, useRef, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { Market } from '../components/Market'
import { ServiceCards } from '../components/ServiceCards'
import { mapUrl, publicSiteContent, whatsappUrl } from '../format'
import { useStore } from '../store'
import { PLAN_MINUTES } from '../visit'

const TICKER = ['Baño', 'Secado', 'Cepillado', 'Corte de raza', 'Uñas', 'Oídos', 'Deslanado', 'Corte higiénico', 'Pet shop']

const delay = (index: number) => ({ '--d': index }) as CSSProperties

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
    a: 'Depende del tamaño, del pelaje y del trabajo que necesite tu mascota. Te confirmamos el precio al recibirla, o escríbenos antes por WhatsApp.',
    link: { to: '/servicios', label: 'Ver todos los servicios' },
  },
  {
    q: '¿Cómo reservo una cita?',
    a: 'En línea: eliges el servicio, el día y la hora, y nos cuentas el nombre, la raza y el tamaño de tu mascota. Al enviar te damos un número de folio y te escribimos por WhatsApp para confirmarla.',
    link: { to: '/reservar', label: 'Reservar ahora' },
  },
  {
    q: 'Mi mascota tiene alergias, ¿cómo lo saben?',
    a: 'Nos lo cuentas al reservar y queda anotado en su ficha, así no hay que repetirlo en cada visita.',
  },
  {
    q: '¿Qué me entregan al terminar?',
    a: 'Una constancia de la visita con fecha, hora, fotos y recomendaciones para casa.',
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
          <p className="eyebrow">Guatemala · Grooming · Pet shop</p>
          <h1>
            Grooming con detalle.
            <br />
            <em>Trato de casa.</em>
          </h1>
          <p className="lede">
            Baño, corte y tienda en un solo lugar. Reserva en línea la hora que te queda y te recibimos sabiendo su raza,
            tamaño y alergias.
          </p>
          <div className="hero-actions">
            <Link to="/reservar" className="btn btn-primary">
              Reservar cita
            </Link>
            <Link to="/servicios" className="btn btn-ghost">
              Ver servicios
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
              <p className="eyebrow">Nuestros paquetes</p>
              <ul>
                <li>
                  <span>
                    Grooming
                    <small>{PLAN_MINUTES.grooming} min · baño, cepillado, uñas y oídos</small>
                  </span>
                  <Link to={`/reservar?servicio=${encodeURIComponent('Baño y corte')}`}>Reservar</Link>
                </li>
                <li>
                  <span>
                    Premium
                    <small>{PLAN_MINUTES.premium} min · suma deslanado, dientes y glándulas</small>
                  </span>
                  <Link to={`/reservar?servicio=${encodeURIComponent('Grooming premium')}`}>Reservar</Link>
                </li>
              </ul>
              <p className="price-note">
                El precio se confirma al recibir a tu mascota, según su tamaño y pelaje. <Link to="/servicios">Ver todos los servicios</Link>
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

      <section className="section" aria-labelledby="servicios-title">
        <div className="section-head" data-reveal>
          <p className="eyebrow">Nuestros servicios</p>
          <h2 id="servicios-title">Todo lo que tu peludo necesita para salir impecable.</h2>
        </div>
        <ServiceCards reveal />
      </section>

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

      <Market featured={6} />

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
              Ver servicios
            </Link>
          </div>
        </div>
        <img className="cta-dog" src="/logo.png" alt="" width={342} height={345} loading="lazy" />
      </section>
    </div>
  )
}
