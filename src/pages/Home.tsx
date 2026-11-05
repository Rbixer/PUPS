import { Link } from 'react-router-dom'
import { Market } from '../components/Market'
import { money } from '../format'
import { PLAN_MINUTES, TARIFF } from '../visit'

const from = (plan: keyof typeof TARIFF) => Math.min(...Object.values(TARIFF[plan]))

export function Home() {
  return (
    <>
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

      <section className="section">
        <div className="section-head">
          <p className="eyebrow">Todo en un solo lugar</p>
          <h2>Grooming, veterinaria y tienda en la misma visita.</h2>
        </div>
        <div className="pillars">
          <article className="pillar">
            <span className="num">01</span>
            <h3>Grooming</h3>
            <p>Baño, corte y cuidado del pelaje. Anotamos su tamaño y alergias para no repetir preguntas en cada visita.</p>
            <p className="pillar-foot">
              <b>desde {money(from('grooming'))}</b>
              <Link to={`/reservar?servicio=${encodeURIComponent('Baño y corte')}`}>Reservar grooming</Link>
            </p>
          </article>
          <article className="pillar">
            <span className="num">02</span>
            <h3>Veterinaria</h3>
            <p>Consulta, vacunas y desparasitación. Te llevas la constancia de la visita con fecha, hora y costo.</p>
            <p className="pillar-foot">
              <span>Precio según la consulta</span>
              <Link to={`/reservar?servicio=${encodeURIComponent('Consulta veterinaria')}`}>Reservar consulta</Link>
            </p>
          </article>
          <article className="pillar">
            <span className="num">03</span>
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

      <section className="section">
        <div className="section-head">
          <p className="eyebrow">Cómo reservar</p>
          <h2>Tres pasos y tu cita queda apartada.</h2>
        </div>
        <ol className="steps">
          <li>
            <span className="num">01</span>
            <h3>Eliges servicio, día y hora</h3>
            <p>Nos cuentas el nombre, la raza y el tamaño de tu mascota, y si tiene alguna alergia.</p>
          </li>
          <li>
            <span className="num">02</span>
            <h3>Recibes tu número de reserva</h3>
            <p>Al enviar la reserva te damos un número de folio y te esperamos a la hora que elegiste.</p>
          </li>
          <li>
            <span className="num">03</span>
            <h3>Te llevas su constancia</h3>
            <p>Al terminar te entregamos el resumen de la visita con fotos y recomendaciones.</p>
          </li>
        </ol>
        <Link to="/reservar" className="btn btn-primary">
          Reservar ahora
        </Link>
      </section>
    </>
  )
}
