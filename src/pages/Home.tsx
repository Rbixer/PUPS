import { Link } from 'react-router-dom'
import { SERVICES } from '../catalog'

const RAIL = [...SERVICES.map((service) => service.name), 'Ficha de alergias', 'Constancia impresa']

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
            PUP'S cuida el pelaje, la salud y la tienda en la misma visita. Reservas el horario y la cita
            aparece en el panel del equipo, con la ficha de la mascota lista.
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
              <dt>Agenda</dt>
              <dd>El día, hora por hora</dd>
            </div>
            <div>
              <dt>Ficha</dt>
              <dd>Raza, tamaño y alergias</dd>
            </div>
            <div>
              <dt>Caja</dt>
              <dd>Ingreso, egreso y constancia</dd>
            </div>
          </dl>
        </div>
        <div className="hero-stage">
          <div className="logo-badge hero-logo">
            <img src="/logo.png" alt="Logo de PUP'S, un shih tzu sobre el letrero de la tienda" />
          </div>
          <article className="float-card">
            <p className="eyebrow">Así se ve el día</p>
            <ul>
              <li>
                <span className="num">09:00</span>
                <span>Luna · baño y corte</span>
                <em>Pendiente</em>
              </li>
              <li>
                <span className="num">10:30</span>
                <span>Rocky · consulta</span>
                <em className="done">Completada</em>
              </li>
              <li>
                <span className="num">15:00</span>
                <span>Nube · vacunación</span>
                <em>Pendiente</em>
              </li>
            </ul>
            <p className="float-note">La reserva del sitio entra a esta lista.</p>
          </article>
        </div>
      </section>

      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          {[...RAIL, ...RAIL].map((item, index) => (
            <span key={`${item}-${index}`}>{item}</span>
          ))}
        </div>
      </div>

      <section className="section">
        <div className="section-head">
          <p className="eyebrow">Tres mesas, una visita</p>
          <h2>Grooming, clínica y tienda sin pasarte de local.</h2>
        </div>
        <div className="pillars">
          <article className="pillar">
            <span className="num">01</span>
            <h3>Grooming</h3>
            <p>Baño, corte y pelaje. El tamaño y las alergias viajan con la cita para no repetir preguntas.</p>
          </article>
          <article className="pillar">
            <span className="num">02</span>
            <h3>Veterinaria</h3>
            <p>Consulta, vacunas y desparasitación. Cada visita deja constancia con folio, hora y costo.</p>
          </article>
          <article className="pillar">
            <span className="num">03</span>
            <h3>Pet shop</h3>
            <p>Alimento y accesorios. Lo que se cobra queda como ingreso, separado del documento de egreso.</p>
          </article>
        </div>
      </section>

      <section className="section preview-wrap">
        <div className="section-head">
          <p className="eyebrow">Panel</p>
          <h2>La operación del día, en una sola superficie.</h2>
        </div>
        <div className="preview">
          <div className="preview-top">
            <span />
            <span />
            <span />
            <strong>citas · hoy</strong>
          </div>
          <div className="preview-kpis">
            <div>
              <small>Pendientes</small>
              <b className="num hot">2</b>
            </div>
            <div>
              <small>Completadas</small>
              <b className="num ok">1</b>
            </div>
            <div>
              <small>Canceladas</small>
              <b className="num">0</b>
            </div>
            <div>
              <small>Ventas</small>
              <b className="num cyan">Q 220.00</b>
            </div>
          </div>
          <div className="preview-list">
            <p>
              <span className="num">09:00</span> Luna · Andrea Paz
            </p>
            <p>
              <span className="num">10:30</span> Rocky · Carlos Méndez
            </p>
            <p>
              <span className="num">15:00</span> Nube · María López
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <p className="eyebrow">De la reserva al folio</p>
          <h2>Tres pasos y la cita ya tiene número.</h2>
        </div>
        <ol className="steps">
          <li>
            <span className="num">01</span>
            <h3>Eliges hora y servicio</h3>
            <p>Mascota, raza, tamaño y teléfono. Si hay alergia, se anota en el mismo paso.</p>
          </li>
          <li>
            <span className="num">02</span>
            <h3>Entra como pendiente</h3>
            <p>Recepción la ve en las citas de hoy, con búsqueda por teléfono, cliente o mascota.</p>
          </li>
          <li>
            <span className="num">03</span>
            <h3>Se cobra y se imprime</h3>
            <p>Al completar, el costo queda en la ficha. La constancia sale lista para firmar.</p>
          </li>
        </ol>
        <Link to="/reservar" className="btn btn-cyan">
          Reservar ahora
        </Link>
      </section>
    </>
  )
}
