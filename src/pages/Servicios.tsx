import { Link, useLocation } from 'react-router-dom'
import { SERVICES } from '../catalog'
import { money } from '../format'
import { PLAN_MINUTES, TARIFF } from '../visit'

export function Servicios() {
  const inAdmin = useLocation().pathname.startsWith('/admin')
  const reservar = inAdmin ? '/admin/reservar' : '/reservar'

  return (
    <section className="section page">
      <div className="section-head">
        <p className="eyebrow">Servicios</p>
        <h2>Lo que se agenda, se ficha y se cobra.</h2>
        <p className="lede">
          El precio se confirma según tamaño, pelaje y el trabajo del día. Aquí está el catálogo que usa el panel.
        </p>
      </div>
      <div className="service-list">
        {SERVICES.map((service, index) => (
          <article key={service.name} className="service-row">
            <span className="num">{String(index + 1).padStart(2, '0')}</span>
            <div>
              <h3>{service.name}</h3>
              <p>{service.detail}</p>
            </div>
            <Link className="btn btn-ghost btn-sm" to={`${reservar}?servicio=${encodeURIComponent(service.name)}`}>
              Reservar
            </Link>
          </article>
        ))}
      </div>
      <div className="section-head">
        <p className="eyebrow">Tiempo y tarifa</p>
        <h2>Grooming y Premium, según el tamaño.</h2>
        <p className="lede">
          Grooming son {PLAN_MINUTES.grooming} minutos: baño, cepillado, uñas y oídos. Premium son {PLAN_MINUTES.premium}{' '}
          minutos y suma deslanado, dientes y glándulas, con foto de antes y de después. El pequeño de grooming queda en{' '}
          {money(TARIFF.grooming.Pequeño)}; el resto es referencia y se confirma en la cita.
        </p>
      </div>
      <table className="tariff">
        <thead>
          <tr>
            <th>Tamaño</th>
            <th>Grooming · {PLAN_MINUTES.grooming} min</th>
            <th>Premium · {PLAN_MINUTES.premium} min</th>
          </tr>
        </thead>
        <tbody>
          {Object.keys(TARIFF.grooming).map((size) => (
            <tr key={size}>
              <td>{size}</td>
              <td className="num">{money(TARIFF.grooming[size])}</td>
              <td className="num">{money(TARIFF.premium[size])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
