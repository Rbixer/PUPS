export type Role = 'Administrador' | 'Recepción'

export type Permission =
  | 'citas'
  | 'fichas'
  | 'whatsapp'
  | 'caja'
  | 'costos'
  | 'estadisticas'
  | 'reportes'
  | 'equipo'

export type AppointmentStatus = 'pendiente' | 'completada' | 'cancelada'

export type Mark = '' | 'si' | 'no'

export type CheckItem = {
  value: Mark
  note: string
}

export type GroomingReport = {
  plan: 'grooming' | 'premium'
  address: string
  age: string
  weight: string
  castrated: Mark
  ingreso: Record<string, CheckItem>
  egreso: Record<string, CheckItem>
  recommendations: string
  photos: string[]
}

export type User = {
  id: string
  name: string
  username: string
  password: string
  role: Role
  active: boolean
  /** Si falta, el rol aporta los permisos de siempre. */
  permissions?: Permission[]
}

export type Appointment = {
  id: string
  folio: number
  petName: string
  date: string
  time: string
  status: AppointmentStatus
  clientName: string
  phone: string
  sex: string
  breed: string
  service: string
  size: string
  coat: string
  allergies: string
  cost: number
  report?: GroomingReport
  /** Foto de cómo llegó. Si falta, se usa la de la constancia. */
  beforePhoto?: string
  /** Foto de cómo salió. Si falta, se usa la de la constancia. */
  afterPhoto?: string
}

export type Movement = {
  id: string
  type: 'ingreso' | 'egreso'
  date: string
  concept: string
  amount: number
  method: string
  notes: string
  document: string
  folio?: number
}

export type Lead = {
  id: string
  name: string
  phone: string
  message: string
  createdAt: string
}

export type Settings = {
  whatsapp: string
  address: string
  hours: string
}

export type WaDirection = 'in' | 'out'

export type WaMessage = {
  id: string
  direction: WaDirection
  body: string
  at: string
  status: 'recibido' | 'enviado'
}

export type Conversation = {
  id: string
  phone: string
  name: string
  petName: string
  unread: number
  messages: WaMessage[]
}

export type AppState = {
  version: number
  revision?: number
  sessionUserId: string | null
  users: User[]
  appointments: Appointment[]
  movements: Movement[]
  leads: Lead[]
  settings: Settings
  conversations: Conversation[]
}
