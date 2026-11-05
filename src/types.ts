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
  | 'compras'
  | 'planilla'
  | 'contabilidad'
  | 'tareas'

export type AppointmentStatus = 'pendiente' | 'completada' | 'cancelada'

export type Mark = '' | 'si' | 'no'

export type CheckItem = {
  value: Mark
  note: string
}

export type GroomingPackage = 'premium' | 'estandar' | 'basico' | 'paquete' | 'stripping'

export type GroomingReport = {
  plan: 'grooming' | 'premium'
  /** Opción elegida en Grooming: premium, estándar, básico, paquete o stripping. */
  packageId: GroomingPackage
  /** Se llena al guardar, para que el módulo Constancias la muestre. */
  savedAt?: string
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
  /** Solo existe en datos viejos y respaldos: el servidor guarda las claves aparte y nunca las envía. */
  password?: string
  role: Role
  active: boolean
  /** Si falta, el rol aporta los permisos de siempre. */
  permissions?: Permission[]
  /** Código fijo del trabajador. Se imprime en las citas que registra. */
  employeeCode?: string
  lastName?: string
  phone?: string
  email?: string
  salary?: number
  /** Porcentaje sobre los servicios completados que atiende. */
  commissionRate?: number
  /** Bonificación incentivo mensual. Si falta, se usa la de ley. */
  bonus?: number
  hiredAt?: string
}

export type ControlField =
  | 'servicio'
  | 'hospedaje'
  | 'domicilio'
  | 'bien'
  | 'local'
  | 'telefono'
  | 'internet'
  | 'luz'
  | 'impuesto'
  | 'afp'
  | 'planilla'
  | 'deas'
  | 'extra'
  | 'bonos'
  | 'comision'
  | 'prestamo'
  | 'proveedores'
  | 'gastos'
  | 'basico'
  | 'estandar'
  | 'premium'
  | 'diferencia'
  | 'hospedajeCant'
  | 'domicilioCant'
  | 'ventas'

export type ControlRow = {
  year: number
  month: number
  values: Partial<Record<ControlField, number>>
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
  /** Trabajador que registró la cita. */
  employeeCode?: string
  employeeId?: string
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
  category?: string
  saleId?: string
  purchaseId?: string
  payableId?: string
  payrollId?: string
  fixedId?: string
  /** Mes (AAAA-MM) que cubre un gasto fijo. */
  period?: string
  /** Movimiento que esta devolución revierte. La contabilidad lo refleja con la fecha de la devolución. */
  reverses?: string
  /** Gasto con factura: en el régimen general separa el crédito fiscal. */
  withTax?: boolean
}

export type ShopCategoryName = 'Shampoo' | 'Accesorios' | 'Cuidado' | 'Snacks' | 'Insumos'

export type CatalogItem = {
  id: string
  name: string
  detail: string
  category: ShopCategoryName
  price: number
  unit: string
  stock: number
  image: string
  /** Si es false, no se muestra en la portada. */
  active?: boolean
  /** Costo unitario promedio, se actualiza con cada compra. */
  cost?: number
  minStock?: number
  /** Los insumos se controlan en inventario y no salen en la tienda. */
  kind?: 'venta' | 'insumo'
  sku?: string
}

export type SaleLine = { productId?: string; name: string; qty: number; price: number; cost?: number }

export type SaleStatus = 'pagada' | 'por cobrar' | 'anulada'

export type Sale = {
  id: string
  number: string
  date: string
  at: string
  channel: 'mostrador' | 'tienda'
  clientName: string
  phone: string
  lines: SaleLine[]
  discount: number
  total: number
  method: string
  status: SaleStatus
  document: string
  userId?: string
}

export type StockKind = 'inicial' | 'compra' | 'venta' | 'pedido' | 'ajuste' | 'consumo' | 'anulación'

export type StockMove = {
  id: string
  date: string
  at: string
  productId: string
  qty: number
  kind: StockKind
  reference: string
  note: string
  balance: number
  unitCost?: number
  /** Costo promedio del producto antes de este movimiento; valora la existencia de apertura. */
  costBefore?: number
}

export type Supplier = {
  id: string
  name: string
  nit: string
  phone: string
  email: string
  contact: string
  notes: string
}

export type PurchaseLine = { productId?: string; description: string; qty: number; cost: number }

export type Purchase = {
  id: string
  number: string
  date: string
  supplierId?: string
  supplierName: string
  invoice: string
  /** Factura con IVA: genera crédito fiscal en el régimen general. */
  withTax: boolean
  lines: PurchaseLine[]
  total: number
  terms: 'contado' | 'credito'
  method?: string
  dueDate?: string
  payableId?: string
  document?: string
  notes: string
}

export type PayablePayment = { id: string; date: string; amount: number; method: string; document: string }

export type Payable = {
  id: string
  number: string
  date: string
  dueDate: string
  supplierId?: string
  supplierName: string
  invoice: string
  concept: string
  category: string
  amount: number
  payments: PayablePayment[]
  purchaseId?: string
  payrollId?: string
  /** Factura con IVA: en el régimen general separa el crédito fiscal. */
  withTax?: boolean
}

export type FixedCost = {
  id: string
  name: string
  category: string
  amount: number
  /** Día del mes en que vence. */
  day: number
  active: boolean
  /** Llega con factura que separa IVA crédito. */
  withTax?: boolean
}

export type PayrollLine = {
  userId: string
  name: string
  code: string
  salary: number
  servicesBase: number
  services: number
  commissionRate: number
  commission: number
  bonus: number
  extra: number
  deductions: number
  igss: number
  net: number
  employerIgss: number
  aguinaldo: number
  bono14: number
  vacaciones: number
  indemnizacion: number
}

export type PayrollRun = {
  id: string
  period: string
  paidAt: string
  method: string
  document: string
  payableId?: string
  lines: PayrollLine[]
}

export type TaskStatus = 'pendiente' | 'en curso' | 'hecha'

export type Task = {
  id: string
  title: string
  detail: string
  assigneeId?: string
  dueDate?: string
  priority: 'alta' | 'media' | 'baja'
  status: TaskStatus
  createdBy?: string
  createdAt: string
  doneAt?: string
  folio?: number
}

export type CashClose = {
  id: string
  date: string
  opening: number
  cashIn: number
  cashOut: number
  expected: number
  counted: number
  difference: number
  byMethod: Record<string, number>
  closedBy?: string
  closedAt: string
  note: string
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
  /** Sin régimen elegido, la contabilidad no separa impuestos. */
  taxRegime?: 'general' | 'pequeno'
  /** Cambios de régimen con su fecha, para que el historial no se recalcule con el régimen nuevo. */
  taxHistory?: { from: string; regime?: 'general' | 'pequeno' }[]
  cashFloat?: number
  /** Meta mensual de paquetes de grooming del control general. */
  controlGoal?: number
  /** Aviso arriba del sitio público; vacío no se muestra. */
  promoText?: string
  promoLink?: string
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
  /** Si falta, la tienda usa el catálogo de demostración. */
  products?: CatalogItem[]
  settings: Settings
  conversations: Conversation[]
  controlRows?: ControlRow[]
  sales?: Sale[]
  stockMoves?: StockMove[]
  suppliers?: Supplier[]
  purchases?: Purchase[]
  payables?: Payable[]
  fixedCosts?: FixedCost[]
  payrolls?: PayrollRun[]
  tasks?: Task[]
  cashCloses?: CashClose[]
  /** Último número usado por serie (ING, EG, VEN, COM, CXP, FOLIO). Evita repetir documentos borrados. */
  counters?: Record<string, number>
}
