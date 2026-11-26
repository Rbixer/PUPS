# PUP'S · Pet Shop y Grooming

Sitio público (servicios, reservas, tienda) y panel de administración (citas, fichas, caja, inventario, contabilidad, planilla, asistencia, estadísticas, WhatsApp). Todo en español.

## Tecnología

- Interfaz: React 19 + Vite + Tailwind 4 (PWA instalable).
- Servidor: Node (sin base de datos externa). Guarda todo en archivos JSON dentro de la carpeta de datos.
- Pruebas: Vitest (`npm test`).

## Desarrollo local

```bash
npm install
npm run dev        # interfaz en modo desarrollo
npm test           # pruebas
npm run build      # revisa tipos, compila la interfaz y el servidor
npm start          # sirve dist/ y la API (puerto 8080)
```

Usuarios de demostración (solo si la demostración está encendida): `admin` y `recepcion`, clave `pups2026`.

## Variables de entorno

Interfaz (se fijan al compilar):

| Variable | Uso |
| --- | --- |
| `VITE_DEMO=false` | **Obligatoria en la entrega.** Oculta las claves de demostración y el botón "Restaurar demostración". |

Servidor:

| Variable | Uso |
| --- | --- |
| `PORT`, `HOST` | Puerto y dirección (por defecto `8080` y `0.0.0.0`). |
| `PUPS_DATA` | Carpeta de datos (por defecto `./data`). |
| `PUPS_DIST` | Carpeta de la interfaz compilada (por defecto `./dist`). |
| `PUPS_TRUST_PROXY=1` | Detrás de Nginx: toma la IP real de `X-Real-IP`. |
| `WA_TOKEN`, `WA_PHONE_NUMBER_ID`, `WA_VERIFY_TOKEN`, `WA_APP_SECRET`, `WA_TEMPLATE` | WhatsApp Cloud API (Meta). Sin ellas la bandeja no envía ni recibe. Ver `.env.example`. |

## Despliegue (Lightsail, Ubuntu + Nginx + systemd)

Producción: `https://3-239-70-231.sslip.io`. El servicio `pups` corre en `127.0.0.1:8080` detrás de Nginx con HTTPS (certbot renueva solo).

```bash
# 1. Compilar en tu equipo, SIEMPRE con la demostración apagada
VITE_DEMO=false npm run build

# 2. Subir y reiniciar (ajusta la llave y la dirección)
K=~/Downloads/pups.pem; H=ubuntu@3.239.70.231
ssh -i $K $H 'rm -rf /tmp/pups-release && mkdir -p /tmp/pups-release'
scp -q -i $K -r dist dist-server $H:/tmp/pups-release/
ssh -i $K $H 'set -e; sudo rm -rf /opt/pups/dist /opt/pups/dist-server; sudo cp -r /tmp/pups-release/dist /tmp/pups-release/dist-server /opt/pups/; sudo chown -R root:root /opt/pups; sudo systemctl restart pups; rm -rf /tmp/pups-release; sleep 1; systemctl is-active pups; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8080/api/public'
```

Rutas en el servidor:

- Programa: `/opt/pups/dist` y `/opt/pups/dist-server`.
- Datos: `/var/lib/pups` (`pups.json` = datos, `auth.json` = claves con scrypt y sesiones, `media/` = fotos, `respaldos/`).
- Servicio: `sudo systemctl status|restart pups` · registros: `sudo journalctl -u pups -n 100`.

## Respaldos

- El servidor guarda una copia diaria en `/var/lib/pups/respaldos` (`pups-AAAA-MM-DD.json` y `auth-AAAA-MM-DD.json`) y conserva las últimas 30.
- Esa carpeta está en el mismo disco: **activa los snapshots automáticos de Lightsail** para tener copia fuera de la instancia.
- Restaurar una copia:

```bash
sudo systemctl stop pups
sudo cp /var/lib/pups/respaldos/pups-AAAA-MM-DD.json /var/lib/pups/pups.json
sudo cp /var/lib/pups/respaldos/auth-AAAA-MM-DD.json /var/lib/pups/auth.json
sudo chown pups:pups /var/lib/pups/pups.json /var/lib/pups/auth.json
sudo systemctl start pups
```

## Seguridad y operación

- Claves de demostración: cambia las de `admin` y `recepcion` en el primer ingreso (mínimo 8 caracteres, distinta de `pups2026`). El panel avisa mientras la clave sea débil.
- Cinco intentos fallidos de login bloquean al usuario por IP con espera creciente.
- Los permisos se aplican en el servidor, no solo en la pantalla (módulos y acciones sensibles: anular, corte, ajustar inventario, costos, planilla).
- Un día con corte de caja queda cerrado: no se agregan ni borran cobros.
- Firewall de Lightsail: deja abiertos solo 22 (limitado a tu IP), 80 y 443.

## Checklist antes de entregar

1. Compilar con `VITE_DEMO=false` y desplegar; confirmar que el login no muestra "Acceso de demostración".
2. Cambiar las claves de `admin` y `recepcion`. Crear a cada persona en Trabajadores: entra como Trabajador (citas, fichas, tareas y su asistencia, sin caja ni finanzas).
3. Decidir qué datos quedan (catálogo de productos y servicios; borrar citas, movimientos y conversaciones de prueba si el cliente arranca limpio).
4. Activar snapshots de Lightsail.
5. Recorrido manual: reserva pública → cita → constancia → conforme por QR → venta → corte de caja → Contabilidad → Usuarios con permisos → Asistencia → Estadísticas.
6. WhatsApp: cuando el cliente tenga las credenciales de Meta, definir las variables `WA_*` en el servicio y reiniciar.
