import { Link } from 'react-router-dom'
import { ServiceCards } from '../components/ServiceCards'
import { publicSiteContent } from '../format'
import { useStore } from '../store'
import { PLAN_MINUTES } from '../visit'

export function Servicios() {
  const { state } = useStore()
  const { gallery } = publicSiteContent(state.settings)
  return (
    <div className="services-page">
      <section className="section page">
        <div className="section-head">
          <p className="eyebrow">Servicios</p>
          <h1 className="page-title">Grooming y pet shop para tu peludo.</h1>
          <p className="lede">
            El grooming son {PLAN_MINUTES.grooming} minutos: baño, cepillado, uñas y oídos. El premium son {PLAN_MINUTES.premium} minutos y suma
            deslanado, dientes y glándulas. El precio se confirma al recibir a tu mascota, según su tamaño, su pelaje y el trabajo que necesite.
          </p>
        </div>
        <ServiceCards />
      </section>

      {gallery.length > 0 ? (
        <section className="section gallery" aria-labelledby="trabajos-title">
          <div className="section-head">
            <p className="eyebrow">Nuestros trabajos</p>
            <h2 id="trabajos-title">Algunos peludos que pasaron por PUP'S.</h2>
          </div>
          <ul className="gallery-grid">
            {gallery.map((photo) => (
              <li key={photo.src}>
                <figure>
                  <img src={photo.src} alt={photo.caption || "Mascota después de su visita en PUP'S"} loading="lazy" decoding="async" />
                  {photo.caption ? <figcaption>{photo.caption}</figcaption> : null}
                </figure>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="cta-band">
        <div className="cta-copy">
          <p className="eyebrow">Tu próxima visita</p>
          <h2>¿Listo para dejarlo impecable?</h2>
          <p>Elige el servicio, el día y la hora. Te confirmamos por WhatsApp.</p>
          <div className="hero-actions">
            <Link to="/reservar" className="btn btn-primary">
              Reservar ahora
            </Link>
          </div>
        </div>
        <img className="cta-dog" src="/logo.png" alt="" width={342} height={345} loading="lazy" />
      </section>
    </div>
  )
}
