const PATHS = {
  calendar: 'M5.5 4.5h13a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-12a2 2 0 0 1 2-2zM8 3v3M16 3v3M3.5 9.5h17',
  calendarPlus: 'M5.5 4.5h13a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-12a2 2 0 0 1 2-2zM8 3v3M16 3v3M3.5 9.5h17M12 13v4M10 15h4',
  file: 'M7 3.5h7l5 5v11.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1zM14 3.5V9h5.5M8.5 13.5h7M8.5 17h5',
  chat: 'M6 17.5 4.5 20.5l3.2-1.2A8.2 8.2 0 1 0 6 17.5z',
  arrowDown: 'M12 4.5v15M7 14.5l5 5 5-5',
  arrowUp: 'M12 19.5v-15M7 9.5l5-5 5 5',
  chart: 'M4.5 19.5h15M7.5 16.5v-4M12 16.5v-8M16.5 16.5V8',
  users: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3.5 19.5c.7-3 2.8-4.5 5.5-4.5s4.8 1.5 5.5 4.5M16.5 11.5a2.4 2.4 0 1 0 0-4.8M17 15c1.8.3 3 1.7 3.5 4',
  table: 'M4.5 5.5h15a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1zM3.5 10h17M3.5 14.5h17M9 5.5v13M14.5 5.5v13',
  badge: 'M6 4.5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2zM12 11a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4zM8.2 16.4c.6-1.5 1.8-2.3 3.8-2.3s3.2.8 3.8 2.3',
  home: 'M4 11.5 12 4.5l8 7M7 10.5v9h10v-9',
  list: 'M8 7.5h11M8 12h11M8 16.5h11M4.5 7.5h.01M4.5 12h.01M4.5 16.5h.01',
  mail: 'M4.5 6.5h15v11h-15zM4.5 7.5 12 13l7.5-5.5',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5',
  sun: 'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  download: 'M12 4v11M7 11l5 5 5-5M5 19.5h14',
  share: 'M12 15V3.5M8 7l4-4 4 4M6.5 11.5h-1a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1h-1',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 14.7a2.7 2.7 0 1 0 0-5.4 2.7 2.7 0 0 0 0 5.4z',
  eyeOff: 'M4 4l16 16M9.9 5.8A9 9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-3 3.8M6.2 7.6A16 16 0 0 0 2.5 12S6 18.5 12 18.5c1.2 0 2.3-.3 3.3-.7M10 10a2.7 2.7 0 0 0 3.9 3.7',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  alert: 'M12 4 2.8 19.5h18.4zM12 10v4.5M12 17.3h.01',
  wifiOff: 'M3 3l18 18M8.5 16a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 3.4-2M2 9a15 15 0 0 1 5-3M12 20h.01M15.5 8.7A10 10 0 0 1 19 12.5M17 5.3A15 15 0 0 1 22 9',
  logout: 'M14 4.5H6.5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1H14M10 12h10M16.5 8.5 20 12l-3.5 3.5',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6 6 18',
  plus: 'M12 5v14M5 12h14',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  refresh: 'M20 11a8 8 0 0 0-14-4.5L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4.5L20 15M20 20v-5h-5',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  shield: 'M12 3.5 5 6v5.5c0 4.2 2.9 7.4 7 9 4.1-1.6 7-4.8 7-9V6z',
  bolt: 'M13 3 5 13.5h6L10.5 21 19 10h-6z',
  cloud: 'M7 18.5a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9.5a4.5 4.5 0 0 1 .5 9z',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  paw: 'M8.5 11.5c-1.3 0-2.3-1.2-2.3-2.7S7.2 6 8.5 6s2.3 1.3 2.3 2.8-1 2.7-2.3 2.7zM15.5 11.5c-1.3 0-2.3-1.2-2.3-2.7S14.2 6 15.5 6s2.3 1.3 2.3 2.8-1 2.7-2.3 2.7zM4.6 14c-1 0-1.8-1-1.8-2.2s.8-2.1 1.8-2.1 1.8.9 1.8 2.1S5.6 14 4.6 14zM19.4 14c-1 0-1.8-1-1.8-2.2s.8-2.1 1.8-2.1 1.8.9 1.8 2.1-.8 2.2-1.8 2.2zM12 13c-2.8 0-5.2 2.6-5.2 4.7 0 1.5 1.2 2.3 2.6 2.3 1 0 1.7-.4 2.6-.4s1.6.4 2.6.4c1.4 0 2.6-.8 2.6-2.3C17.2 15.6 14.8 13 12 13z',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 18, strokeWidth = 1.7 }: { name: IconName; size?: number; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}

const ROUTE_ICONS: Record<string, IconName> = {
  '/admin': 'calendar',
  '/admin/fichas': 'file',
  '/admin/whatsapp': 'chat',
  '/admin/ingresos': 'arrowDown',
  '/admin/egresos': 'arrowUp',
  '/admin/constancias': 'file',
  '/admin/estadisticas': 'chart',
  '/admin/trabajadores': 'badge',
  '/admin/control': 'table',
  '/admin/usuarios': 'users',
  '/admin/inicio': 'home',
  '/admin/servicios': 'list',
  '/admin/reservar': 'calendarPlus',
  '/admin/contacto': 'mail',
}

export function routeIcon(to: string): IconName {
  return ROUTE_ICONS[to] ?? 'users'
}
