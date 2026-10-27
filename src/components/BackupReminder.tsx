import { useState } from 'react'
import { backupDueDays, hasBackedUp, saveBackupFile, snoozeBackupReminder } from '../backup'
import { useStore } from '../store'

export function BackupReminder() {
  const { exportBackup } = useStore()
  const [days, setDays] = useState(() => backupDueDays())
  if (days === null) return null
  return (
    <div className="backup-reminder" role="status">
      <p>
        <strong>{hasBackedUp() ? `Hace ${days} días que no descargas un respaldo.` : 'Todavía no has descargado un respaldo.'}</strong>{' '}
        Los datos viven en este equipo; una copia fuera del local los protege.
      </p>
      <div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => {
            const data = exportBackup()
            if (!data) return
            saveBackupFile(data)
            setDays(null)
          }}
        >
          Descargar ahora
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            snoozeBackupReminder()
            setDays(null)
          }}
        >
          Más tarde
        </button>
      </div>
    </div>
  )
}
