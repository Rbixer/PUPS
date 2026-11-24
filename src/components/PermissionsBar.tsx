import { Link, useLocation } from 'react-router-dom'
import { nodeAt, nodeCount } from '../access'
import { useStore } from '../store'

/** Dentro de cada módulo: qué puede y qué no puede hacer quien lo está usando. */
export function PermissionsBar() {
  const { currentUser, allows } = useStore()
  const location = useLocation()
  const node = nodeAt(location.pathname)
  if (!node || !currentUser || !node.actions?.length) return null
  const granted = [node.id, ...node.actions.map((action) => action.id)].filter((id) => allows(id))
  const { total } = nodeCount(granted, node)
  const missing = total - granted.length
  if (missing === 0 && currentUser.role === 'Administrador') return null
  return (
    <details className={missing ? 'perm-bar has-missing' : 'perm-bar'}>
      <summary>
        <span className="perm-bar-title">
          Tus permisos en <b>{node.label}</b>
        </span>
        <span className="perm-bar-count">
          {granted.length} de {total}
        </span>
        {missing ? <span className="perm-bar-lock">{missing} sin acceso</span> : <span className="perm-bar-ok">Acceso completo</span>}
      </summary>
      <ul className="perm-bar-list">
        {node.actions.map((action) => {
          const on = allows(action.id)
          return (
            <li key={action.id} className={on ? 'is-on' : 'is-off'} title={action.detail}>
              <span aria-hidden="true">{on ? '✓' : '🔒'}</span>
              <span>
                {action.label}
                <small className="sr-only">{on ? ' (permitido)' : ' (sin permiso)'}</small>
              </span>
            </li>
          )
        })}
      </ul>
      {allows('equipo') ? (
        <p className="perm-bar-manage">
          <Link to={`/admin/usuarios?modulo=${node.id}`}>Gestionar permisos de este módulo</Link>
        </p>
      ) : missing ? (
        <p className="perm-bar-manage">Si necesitas alguno de los bloqueados, pídeselo al administrador.</p>
      ) : null}
    </details>
  )
}
