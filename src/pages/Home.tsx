import { Link } from 'react-router-dom'
import { Market } from '../components/Market'

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
            PUP'S cuida el pelaje, la salud y las compras de tu mascota en la misma visita. Reservas el horario
            en línea y te recibimos con su ficha lista.
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
              <dt>Horario</dt>
              <dd>Eliges la hora que te queda</dd>
            </div>
            <div>
              <dt>Ficha</dt>
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
            <p className="float-note">Tu reserva en línea entra directo a la agenda del día.</p>
          </article>
          </article>
        </div>
      </section>

      <Market />

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
            <p>Shampoo, accesorios y cuidado. Pide en línea y lo recoges en tu próxima visita.</p>
          </article>
        </div>
      </section>

      <section className="section preview-wrap">
        <div className="section-head">
          <p className="eyebrow">Organización</p>
          <h2>Cada mascota con su horario, sin esperas largas.</h2>
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
            <h3>Te esperamos</h3>
            <p>Tu cita queda con número de folio y la recibimos a la hora que elegiste.</p>
          </li>
          <li>
            <span className="num">03</span>
            <h3>Te llevas la constancia</h3>
            <p>Al terminar te entregamos la constancia de la visita con fotos y recomendaciones.</p>
          </li>
        </ol>
        <Link to="/reservar" className="btn btn-primary">
          Reservar ahora
        </Link>
      </section>
    </>
  )
}
