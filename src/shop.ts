import type { CatalogItem, Settings, ShopCategoryName } from './types'

/** Categorías fijas del inventario. */
export const BASE_CATEGORY_NAMES = ['Accesorios', 'Alimento', 'Baño medicado', 'Consumible'] as const

export type ShopProduct = CatalogItem

const LEGACY_CATEGORY: Record<string, ShopCategoryName> = {
  Shampoo: 'Baño medicado',
  Cuidado: 'Baño medicado',
  Snacks: 'Alimento',
  Insumos: 'Consumible',
  Accesorios: 'Accesorios',
}

export function normalizeCategory(value: string | undefined): ShopCategoryName {
  const name = (value ?? '').trim()
  if (!name) return 'Consumible'
  return LEGACY_CATEGORY[name] ?? name
}

/** Categorías base + las que agregó el negocio. */
export function categoryNames(settings?: Pick<Settings, 'productCategories'> | null): ShopCategoryName[] {
  const extras = (settings?.productCategories ?? []).map((item) => item.trim()).filter(Boolean)
  const seen = new Set<string>()
  const list: ShopCategoryName[] = []
  for (const name of [...BASE_CATEGORY_NAMES, ...extras]) {
    if (seen.has(name)) continue
    seen.add(name)
    list.push(name)
  }
  return list
}

/** @deprecated Usa categoryNames(settings). Se mantiene para selects que aún no pasan settings. */
export const SHOP_CATEGORY_NAMES: ShopCategoryName[] = [...BASE_CATEGORY_NAMES]

export const SHOP_CATEGORIES = ['Todo', ...BASE_CATEGORY_NAMES] as const

export type ShopCategory = (typeof SHOP_CATEGORIES)[number]

/** Catálogo de demostración. No usa marcas comerciales. */
export const SHOP_PRODUCTS: ShopProduct[] = [
  {
    id: 'shampoo-suave',
    cost: 46,
    minStock: 5,
    name: 'Shampoo suave',
    detail: 'Para piel sensible. Baño frecuente sin resecar el manto.',
    category: 'Baño medicado',
    price: 85,
    unit: '250 ml',
    stock: 14,
    image: '/shop/shampoo-suave.jpg',
  },
  {
    id: 'shampoo-blanco',
    cost: 43,
    minStock: 5,
    name: 'Shampoo para manto claro',
    detail: 'Limpia sin teñir. Pensado para pelaje blanco o crema.',
    category: 'Baño medicado',
    price: 79,
    unit: '250 ml',
    stock: 9,
    image: '/shop/shampoo-blanco.jpg',
  },
  {
    id: 'acondicionador',
    cost: 39,
    minStock: 5,
    name: 'Acondicionador desenredante',
    detail: 'Después del baño. Suelta nudos en pelo largo.',
    category: 'Baño medicado',
    price: 72,
    unit: '250 ml',
    stock: 11,
    image: '/shop/acondicionador.jpg',
  },
  {
    id: 'collar',
    cost: 22,
    minStock: 5,
    name: 'Collar de nylon',
    detail: 'Ajustable, hebilla de plástico. Talla chica y mediana.',
    category: 'Accesorios',
    price: 45,
    unit: 'pieza',
    stock: 18,
    image: '/shop/collar.jpg',
  },
  {
    id: 'correa',
    cost: 28,
    minStock: 5,
    name: 'Correa de paseo',
    detail: '1.5 m, asa acolchada. Se engancha al collar de nylon.',
    category: 'Accesorios',
    price: 55,
    unit: 'pieza',
    stock: 12,
    image: '/shop/correa.jpg',
  },
  {
    id: 'plato',
    cost: 25,
    minStock: 5,
    name: 'Plato de acero',
    detail: 'Antideslizante en la base. Se lava fácil.',
    category: 'Accesorios',
    price: 48,
    unit: 'pieza',
    stock: 16,
    image: '/shop/plato.jpg',
  },
  {
    id: 'peine',
    cost: 18,
    minStock: 5,
    name: 'Peine de púas',
    detail: 'Para nudos sueltos y el acabado después del corte.',
    category: 'Consumible',
    price: 38,
    unit: 'pieza',
    stock: 20,
    image: '/shop/peine.jpg',
  },
  {
    id: 'carda',
    cost: 33,
    minStock: 5,
    name: 'Cepillo de carda',
    detail: 'Saca el pelo muerto en mantos largos.',
    category: 'Consumible',
    price: 62,
    unit: 'pieza',
    stock: 8,
    image: '/shop/carda.jpg',
  },
  {
    id: 'cortauñas',
    cost: 17,
    minStock: 5,
    name: 'Cortaúñas',
    detail: 'Para el corte de uñas entre visitas.',
    category: 'Consumible',
    price: 35,
    unit: 'pieza',
    stock: 15,
    image: '/shop/cortanas.jpg',
  },
  {
    id: 'toallitas',
    cost: 21,
    minStock: 5,
    name: 'Toallitas de oídos',
    detail: 'Limpieza suave de oídos entre un baño y otro.',
    category: 'Consumible',
    price: 42,
    unit: '50 unidades',
    stock: 10,
    image: '/shop/toallitas.jpg',
  },
  {
    id: 'snack',
    cost: 14,
    minStock: 5,
    name: 'Snack de entrenamiento',
    detail: 'Trocitos suaves. Porción chica para la sesión.',
    category: 'Alimento',
    price: 28,
    unit: '100 g',
    stock: 22,
    image: '/shop/snack.jpg',
  },
]

export function demoCatalog(): CatalogItem[] {
  return SHOP_PRODUCTS.map((item) => ({ ...item, active: true, category: normalizeCategory(item.category) }))
}

/** Catálogo guardado. Solo un estado antiguo sin catálogo usa el de muestra; uno vacío se queda vacío. */
export function shelfOf(products?: CatalogItem[]): CatalogItem[] {
  const list = products ?? demoCatalog()
  return list.map((item) => ({ ...item, category: normalizeCategory(item.category) }))
}

export function visibleCatalog(products?: CatalogItem[]): CatalogItem[] {
  return shelfOf(products).filter((item) => item.active !== false && item.kind !== 'insumo' && item.stock >= 0)
}

export type ShopLine = { id: string; qty: number }

export type ShopOrderResult =
  | { ok: true; products: CatalogItem[]; sold: { name: string; qty: number; amount: number }[]; total: number }
  | { ok: false; error: string }

/** Descuenta existencia sin mutar la lista original. */
export function applyShopOrder(products: CatalogItem[], lines: ShopLine[]): ShopOrderResult {
  const wanted = lines
    .map((line) => ({ id: line.id, qty: Math.floor(line.qty) }))
    .filter((line) => line.qty > 0)
  if (wanted.length === 0) return { ok: false, error: 'Agrega al menos un producto.' }
  const next = products.map((item) => ({ ...item }))
  const sold: { name: string; qty: number; amount: number }[] = []
  for (const line of wanted) {
    const item = next.find((product) => product.id === line.id)
    if (!item || item.active === false) return { ok: false, error: 'Un producto ya no está en la tienda.' }
    if (line.qty > item.stock) return { ok: false, error: `No hay suficiente existencia de ${item.name}.` }
    item.stock -= line.qty
    sold.push({ name: item.name, qty: line.qty, amount: item.price * line.qty })
  }
  return { ok: true, products: next, sold, total: sold.reduce((sum, line) => sum + line.amount, 0) }
}
