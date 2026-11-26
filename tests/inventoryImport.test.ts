import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildLoad, cellValue, fold, parseInventoryMatrix, readInventorySheet } from '../src/inventoryImport'
import * as ops from '../src/ops'
import type { Op } from '../src/ops'
import { createSeed } from '../src/seed'
import type { AppState, Purchase } from '../src/types'

function apply<T>(state: AppState, result: Op<T>) {
  if (!result.ok) throw new Error(result.error)
  return { state: { ...state, ...result.patch }, value: result.value }
}

const order: Purchase = {
  id: 'p1',
  number: 'COM-0001',
  date: '2026-11-24',
  supplierName: 'Distribuidora',
  invoice: 'A-1',
  withTax: false,
  lines: [
    { productId: 'collar', description: 'Collar de nylon', qty: 10, cost: 20 },
    { description: 'Flete', qty: 1, cost: 15 },
  ],
  total: 215,
  terms: 'contado',
  notes: '',
}

describe('carga de inventario', () => {
  it('lee columnas con acento, uso y fecha', () => {
    const parsed = parseInventoryMatrix([
      ['Inventario de noviembre'],
      ['Producto', 'Existencia', 'Categoría', 'Código', 'Uso', 'Vence'],
      ['Collar de nylon', '18', 'Accesorios', 'COL-1', 'Ventas', '01/12/2026'],
      ['Gel de baño', '4', 'Consumible', '', 'servicio', ''],
    ])
    expect(parsed.error).toBeUndefined()
    expect(parsed.rows).toMatchObject([
      { name: 'Collar de nylon', qty: 18, category: 'Accesorios', sku: 'COL-1', use: 'venta', expiresOn: '2026-12-01' },
      { name: 'Gel de baño', qty: 4, use: 'insumo' },
    ])
  })

  it('rechaza existencia fraccionaria, uso desconocido y nombres repetidos', () => {
    const parsed = parseInventoryMatrix([
      ['Producto', 'Existencia', 'Uso'],
      ['Collar de nylon', '10.5', 'Ventas'],
      ['Shampoo', '2', 'Ambos'],
      ['Gel', '1', 'Servicio'],
      ['gel', '3', 'Servicio'],
    ])
    expect(parsed.rows.map((row) => row.error)).toEqual([
      'La existencia de Collar de nylon tiene que ser un número entero.',
      'El uso de Shampoo tiene que ser Ventas o Servicio.',
      undefined,
      undefined,
    ])
    expect(parsed.rows[3]?.name).toBe('gel (2)')
    expect(parsed.rows[3]?.warning).toContain('gel')
  })

  it('compara el archivo con el pedido al proveedor', () => {
    const seed = createSeed()
    const parsed = parseInventoryMatrix([
      ['Producto', 'Existencia', 'Uso'],
      ['Collar de nylon', '8', 'Ventas'],
      ['Shampoo suave', '14', 'Servicio'],
      ['Gel de baño', '4', 'Servicio'],
    ])
    const load = buildLoad(seed.products ?? [], parsed.rows, order)
    const byName = (name: string) => load.rows.find((row) => row.name === name)
    expect(byName('Collar de nylon')).toMatchObject({ status: 'falta', orderQty: 10, currentStock: 18, productId: 'collar' })
    expect(byName('Shampoo suave')).toMatchObject({ status: 'ajeno', orderQty: null, use: 'insumo', previousUse: 'venta' })
    expect(byName('Gel de baño')).toMatchObject({ status: 'ajeno', fresh: true, use: 'insumo' })
    expect(load.missing).toEqual([{ description: 'Flete', qty: 1 }])

    const same = buildLoad(seed.products ?? [], [{ line: 2, name: 'Collar de nylon', qty: 10, use: 'venta' }], order)
    expect(same.rows[0]?.status).toBe('coincide')
    expect(buildLoad(seed.products ?? [], same.rows, null).rows[0]?.status).toBe('sin-pedido')
  })

  it('deja la existencia del archivo y separa ventas de servicio', () => {
    const seed = createSeed()
    const loaded = apply(
      seed,
      ops.importInventory(seed, [
        { name: 'COLLAR DE NYLON', qty: 10, use: 'venta' },
        { name: 'Gel de baño', qty: 4, use: 'insumo', unit: 'galón', category: 'Baño medicado', cost: 30, expiresOn: '2026-12-01' },
        { name: 'Pelota', qty: 6, use: 'venta', category: 'Juguetes', price: 25 },
      ]),
    )
    const collar = loaded.state.products?.find((item) => item.id === 'collar')
    const gel = loaded.state.products?.find((item) => item.name === 'Gel de baño')
    const ball = loaded.state.products?.find((item) => item.name === 'Pelota')
    expect(collar).toMatchObject({ name: 'Collar de nylon', stock: 10, kind: 'venta', image: '/shop/collar.jpg' })
    expect(collar?.active).not.toBe(false)
    expect(gel).toMatchObject({ stock: 4, kind: 'insumo', category: 'Baño medicado', unit: 'galón', cost: 30, expiresOn: '2026-12-01', active: false, price: 0 })
    expect(ball).toMatchObject({ stock: 6, kind: 'venta', category: 'Juguetes', price: 25, active: false })
    expect(loaded.state.settings.productCategories).toContain('Juguetes')
    expect(loaded.value).toEqual({ created: 2, updated: 1, unchanged: 0 })
    const moves = (loaded.state.stockMoves ?? []).filter((move) => move.reference === 'Excel')
    expect(moves.map((move) => [move.productId, move.kind, move.qty, move.balance])).toEqual([
      ['collar', 'ajuste', -8, 10],
      [gel?.id, 'inicial', 4, 4],
      [ball?.id, 'inicial', 6, 6],
    ])

    const again = apply(
      loaded.state,
      ops.importInventory(loaded.state, [
        { name: 'Collar de nylon', qty: 10, use: 'venta' },
        { name: 'Gel de baño', qty: 4, use: 'insumo' },
      ]),
    )
    expect(again.value).toEqual({ created: 0, updated: 0, unchanged: 2 })
    expect(again.state.products?.find((item) => item.id === 'collar')?.cost).toBe(collar?.cost)
    expect((again.state.stockMoves ?? []).filter((move) => move.reference === 'Excel')).toHaveLength(moves.length)
  })

  it('encuentra por código y pasa un producto a servicio sin cambiar el nombre', () => {
    const seed = createSeed()
    const withSku = {
      ...seed,
      products: (seed.products ?? []).map((item) => (item.id === 'collar' ? { ...item, sku: 'COL-1' } : item)),
    }
    const loaded = apply(withSku, ops.importInventory(withSku, [{ name: 'Otro nombre', sku: 'col-1', qty: 18, use: 'insumo' }]))
    expect(loaded.state.products?.find((item) => item.id === 'collar')).toMatchObject({
      name: 'Collar de nylon',
      sku: 'COL-1',
      stock: 18,
      kind: 'insumo',
      active: false,
    })
    expect(loaded.value.updated).toBe(1)
    expect((loaded.state.stockMoves ?? []).some((move) => move.reference === 'Excel')).toBe(false)
  })

  it('lee la hoja de Excel', async () => {
    const { Workbook } = await import('exceljs')
    const workbook = new Workbook()
    const sheet = workbook.addWorksheet('Inventario')
    sheet.addRow(['Producto', 'Existencia', 'Uso'])
    sheet.addRow(['Collar de nylon', 12, 'Ventas'])
    sheet.addRow(['Gel de baño', 2, 'Servicio'])
    const raw = await workbook.xlsx.writeBuffer()
    const view = raw instanceof ArrayBuffer ? new Uint8Array(raw) : new Uint8Array(raw)
    const parsed = await readInventorySheet(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer)
    expect(parsed.error).toBeUndefined()
    expect(parsed.rows.map((row) => [row.name, row.qty, row.use])).toEqual([
      ['Collar de nylon', 12, 'venta'],
      ['Gel de baño', 2, 'insumo'],
    ])
  })

  it('lee el excel de productos de Odoo', () => {
    const parsed = parseInventoryMatrix([
      ['Moneda', 'Estado de la actividad', 'Categoría del producto', 'Favorito', 'Nombre', 'Referencia interna', '# Variantes de producto', 'Precio de venta', 'Cantidad a la mano', 'Unidad', 'Imagen 128'],
      ['GTQ', '', 'ACCESORIOS', 'false', 'ARNES AJUSTABLE ESTAMPADO M', '55588', '1', '45', '4', 'Unidades', ''],
      ['GTQ', '', '', 'false', 'ARNES AJUSTABLE ESTAMPADO M', '', '1', '125', '1', 'Unidades', ''],
      ['GTQ', '', 'BAÑO MEDICADO', 'false', 'ACONDICIONADOR TOONS 265ML', '', '1', '35', '3', 'Unidades', 'UklGRxxx'],
      ['GTQ', '', 'Services', 'false', 'Propinas', 'TIPS', '1', '1', '0', 'Unidades', ''],
      ['GTQ', '', 'Expenses', 'false', 'Comidas', 'FOOD', '1', '1', '0', 'Unidades', ''],
      ['GTQ', '', 'Deliveries', 'false', 'Envío estándar', 'Delivery_007', '1', '0', '0', 'Unidades', ''],
      ['GTQ', '', '', 'false', 'COMBO AJUSTABLE', '', '1', '90', '-1', 'Unidades', ''],
      ['GTQ', '', 'ALIMENTO', 'false', 'ADULT CHICKEN', 'NUTRI SOURCE', '1', '310', '0', 'Unidades', ''],
    ])
    expect(parsed.error).toBeUndefined()
    expect(parsed.skipped.map((row) => row.name)).toEqual(['Propinas', 'Comidas', 'Envío estándar'])
    const byLine = (line: number) => parsed.rows.find((row) => row.line === line)
    expect(byLine(2)).toMatchObject({ name: 'Arnes Ajustable Estampado M · 55588', qty: 4, price: 45, category: 'Accesorios', unit: 'pieza', detail: '55588', sku: undefined })
    expect(byLine(3)?.name).toContain('Arnes Ajustable Estampado M')
    expect(byLine(3)?.name).not.toBe(byLine(2)?.name)
    expect(byLine(4)).toMatchObject({ category: 'Baño medicado', qty: 3, price: 35, image: 'data:image/webp;base64,UklGRxxx' })
    expect(byLine(8)).toMatchObject({ qty: 0, warning: expect.stringContaining('-1') })
    expect(byLine(9)).toMatchObject({ category: 'Alimento', detail: 'NUTRI SOURCE', sku: undefined })
    expect(parsed.rows.some((row) => row.name === 'Propinas')).toBe(false)
  })

  it('acepta el archivo de referencia de productos', async () => {
    const path = '/Users/krodas7/Downloads/Producto (product.template).xlsx'
    if (!existsSync(path)) return
    const view = new Uint8Array(readFileSync(path))
    const parsed = await readInventorySheet(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer)
    expect(parsed.error).toBeUndefined()
    expect(parsed.skipped).toHaveLength(15)
    expect(parsed.rows).toHaveLength(702)
    expect(parsed.rows.filter((row) => row.error)).toEqual([])
    expect(parsed.rows.filter((row) => row.category === 'Accesorios')).toHaveLength(99)
    expect(parsed.rows.filter((row) => row.category === 'Alimento')).toHaveLength(34)
    expect(parsed.rows.filter((row) => row.category === 'Consumible')).toHaveLength(15)
    expect(parsed.rows.filter((row) => row.category === 'Baño medicado')).toHaveLength(4)
    expect(parsed.rows.filter((row) => row.category === 'Vacunas')).toHaveLength(4)
    expect(parsed.rows.filter((row) => row.category === 'Sin categoría')).toHaveLength(546)
    expect(parsed.rows.some((row) => fold(row.name) === 'propinas')).toBe(false)
    const towel = parsed.rows.find((row) => row.name.startsWith('Acondicionador Toons'))
    expect(towel).toMatchObject({ qty: 3, price: 35, category: 'Baño medicado', unit: 'pieza' })
    expect(towel?.image?.startsWith('data:image/webp;base64,')).toBe(true)
    expect(parsed.rows.filter((row) => row.qty < 0)).toEqual([])
  })

  it('normaliza fechas y fórmulas de celda', () => {
    expect(cellValue(new Date(2026, 11, 1))).toBe('2026-12-01')
    expect(cellValue({ result: 12 })).toBe('12')
    expect(cellValue({ richText: [{ text: 'Gel' }, { text: ' de baño' }] })).toBe('Gel de baño')
  })
})
