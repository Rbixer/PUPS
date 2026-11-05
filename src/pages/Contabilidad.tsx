import { useMemo, useState } from 'react'
import { Metrics, Tabs, Tag } from '../components/ui'
import { isoDate, longDate, money, monthTitle, shiftMonth } from '../format'
import { accountName, balanceSheet, buildJournal, incomeStatement, taxMonths, type Balance } from '../ledger'
import { round2 } from '../ops'
import { useStore } from '../store'

type Scope = 'mes' | 'anio'

function lastOfMonth(month: string) {
  const [year, number] = month.split('-').map(Number)
  return isoDate(new Date(year, number, 0))
}

export function Contabilidad() {
  const { state, allows, setTaxRegime } = useStore()
  const [tab, setTab] = useState<'resultados' | 'balance' | 'diario' | 'impuestos'>('resultados')
  const [scope, setScope] = useState<Scope>('mes')
  const [month, setMonth] = useState(() => isoDate().slice(0, 7))
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const regime = state.settings.taxRegime
  const entries = useMemo(() => buildJournal(state), [state])
  const year = Number(month.slice(0, 4))
  const from = scope === 'mes' ? `${month}-01` : `${year}-01-01`
  const to = scope === 'mes' ? lastOfMonth(month) : `${year}-12-31`
  const label = scope === 'mes' ? monthTitle(`${month}-01`) : `Año ${year}`
  const statement = incomeStatement(entries, from, to)
  const sheet = balanceSheet(entries, to)
  const taxes = taxMonths(entries, state.settings, year)
  const anyRegime = taxes.some((item) => item.regime)
  const anyGeneral = taxes.some((item) => item.regime === 'general')
  const mixed = new Set(taxes.map((item) => item.regime ?? '')).size > 1
  const since = state.settings.taxHistory?.length ? [...state.settings.taxHistory].sort((a, b) => b.from.localeCompare(a.from))[0].from : ''
  const inRange = entries.filter((entry) => entry.date >= from && entry.date <= to)
  const monthly = Array.from({ length: 12 }, (_, index) => {
    const key = `${year}-${String(index + 1).padStart(2, '0')}`
    const result = incomeStatement(entries, `${key}-01`, lastOfMonth(key))
    return { key, label: monthTitle(`${key}-01`).split(' ')[0], revenue: result.totalRevenue, net: result.net }
  })
  const peak = Math.max(...monthly.map((item) => Math.abs(item.net)), 1)
  const squared = Math.round(sheet.totalAssets * 100) === Math.round((sheet.totalLiabilities + sheet.totalEquity) * 100)

  async function onExcel() {
    setBusy(true)
    setNote('')
    try {
      const filename = `pups-contabilidad-${scope === 'mes' ? month : year}.xlsx`
      const { downloadLedgerExcel } = await import('../ledgerExport')
      await downloadLedgerExcel({ label, filename, entries: inRange, statement, sheet, taxes })
      setNote(`Se descargó ${filename}.`)
    } catch {
      setNote('No se pudo armar el Excel. Inténtalo de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">Finanzas</p>
          <h1>Contabilidad</h1>
          <p className="lede">Partidas automáticas desde ventas, cobros, compras, gastos, planilla e inventario. Listo para revisar con el contador.</p>
          {note ? <p className="excel-note">{note}</p> : null}
        </div>
        <div className="export-row">
          <label className="field">
            <span>Régimen fiscal</span>
            <select value={regime ?? ''} onChange={(event) => setTaxRegime((event.target.value || undefined) as typeof regime)}>
              <option value="">Sin elegir</option>
              <option value="general">General · IVA 12 %</option>
              <option value="pequeno">Pequeño contribuyente · 5 %</option>
            </select>
            {since && since > '0000-01-01' ? <small>Vigente desde {longDate(since)}. Los meses anteriores conservan su régimen.</small> : null}
          </label>
          {allows('reportes') ? (
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void onExcel()}>
              {busy ? 'Preparando…' : 'Excel'}
            </button>
          ) : null}
        </div>
      </header>

      {!regime ? <p className="banner">Elige el régimen fiscal del negocio para que la contabilidad separe el IVA o calcule el impuesto del 5 %. Mientras tanto, los montos se muestran sin impuestos.</p> : null}

      <div className="biz-row" style={{ justifyContent: 'space-between' }}>
        <Tabs
          label="Periodo"
          value={scope}
          onChange={setScope}
          tabs={[
            { id: 'mes', label: 'Mes' },
            { id: 'anio', label: 'Año' },
          ]}
        />
        <div className="month-switch">
          <button type="button" className="cal-arrow" aria-label="Anterior" onClick={() => setMonth((value) => shiftMonth(`${value}-01`, scope === 'mes' ? -1 : -12).slice(0, 7))}>
            ‹
          </button>
          <strong>{label}</strong>
          <button type="button" className="cal-arrow" aria-label="Siguiente" onClick={() => setMonth((value) => shiftMonth(`${value}-01`, scope === 'mes' ? 1 : 12).slice(0, 7))}>
            ›
          </button>
        </div>
      </div>

      <Metrics
        items={[
          { label: 'Ingresos', value: money(statement.totalRevenue), tone: 'ok' },
          { label: 'Utilidad bruta', value: money(statement.gross), detail: `Costo de ventas ${money(statement.cost)}` },
          { label: 'Gastos y planilla', value: money(round2(statement.totalExpenses + statement.totalPayroll)), tone: 'hot' },
          { label: 'Utilidad neta', value: money(statement.net), tone: statement.net >= 0 ? 'ok' : 'bad', detail: `Margen ${statement.margin} %` },
        ]}
      />

      <Tabs
        label="Reportes contables"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'resultados', label: 'Estado de resultados' },
          { id: 'balance', label: 'Balance general' },
          { id: 'diario', label: 'Libro diario' },
          { id: 'impuestos', label: 'Impuestos' },
        ]}
      />

      {tab === 'resultados' ? (
        <div className="biz-split wide-left">
          <div className="ledger">
            <header className="module-bar">
              <h2>Estado de resultados</h2>
              <span>{label}</span>
            </header>
            <div className="statement">
              <Rows title="Ingresos" rows={statement.revenue} />
              <div className="sub">
                <span>Total de ingresos</span>
                <span>{money(statement.totalRevenue)}</span>
              </div>
              <div className="indent">
                <span>(−) Costo de ventas</span>
                <span>{money(statement.cost)}</span>
              </div>
              <div className="sub">
                <span>Utilidad bruta</span>
                <span>{money(statement.gross)}</span>
              </div>
              <Rows title="Planilla" rows={statement.payroll} />
              <Rows title="Gastos de operación" rows={statement.expenses} />
              {statement.taxes ? (
                <div className="indent">
                  <span>(−) Impuesto pequeño contribuyente</span>
                  <span>{money(statement.taxes)}</span>
                </div>
              ) : null}
              <div className="total">
                <span>Utilidad neta</span>
                <span className={statement.net >= 0 ? 'ok-text' : 'hot-text'}>{money(statement.net)}</span>
              </div>
            </div>
            {regime === 'general' ? <p className="section-note">En régimen general el ISR se calcula al cierre con el contador; esta utilidad es antes de ISR.</p> : null}
          </div>
          <article className="panel">
            <h2>Utilidad por mes · {year}</h2>
            <div className="meter">
              {monthly.map((item) => (
                <div key={item.key} className="meter-row">
                  <div>
                    <strong style={{ textTransform: 'capitalize' }}>{item.label}</strong>
                    <div className="meter-track" aria-hidden="true">
                      <div className="meter-fill" style={{ width: `${item.net ? Math.max(4, (Math.abs(item.net) / peak) * 100) : 0}%`, background: item.net < 0 ? 'var(--red)' : undefined }} />
                    </div>
                  </div>
                  <b className={`num ${item.net < 0 ? 'hot-text' : ''}`}>{money(item.net)}</b>
                </div>
              ))}
            </div>
          </article>
        </div>
      ) : null}

      {tab === 'balance' ? (
        <div className="ledger">
          <header className="module-bar">
            <h2>Balance general al {longDate(to > isoDate() ? isoDate() : to)}</h2>
            {squared ? <Tag tone="ok">Cuadra</Tag> : <Tag tone="bad">Revisar</Tag>}
          </header>
          <div className="statement">
            <Rows title="Activo" rows={sheet.assets} />
            <div className="sub">
              <span>Total activo</span>
              <span>{money(sheet.totalAssets)}</span>
            </div>
            <Rows title="Pasivo" rows={sheet.liabilities} />
            <div className="sub">
              <span>Total pasivo</span>
              <span>{money(sheet.totalLiabilities)}</span>
            </div>
            <div className="head">
              <span>Patrimonio</span>
              <span />
            </div>
            <div className="indent">
              <span>Capital aportado (inventario inicial y aportes)</span>
              <span>{money(sheet.capital)}</span>
            </div>
            <div className="indent">
              <span>Resultado acumulado</span>
              <span>{money(sheet.result)}</span>
            </div>
            <div className="sub">
              <span>Total patrimonio</span>
              <span>{money(sheet.totalEquity)}</span>
            </div>
            <div className="total">
              <span>Pasivo más patrimonio</span>
              <span>{money(round2(sheet.totalLiabilities + sheet.totalEquity))}</span>
            </div>
          </div>
          <p className="section-note">Caja y bancos parten de cero: los saldos reflejan solo lo registrado en el sistema. Un saldo negativo indica pagos sin el ingreso que los cubrió.</p>
        </div>
      ) : null}

      {tab === 'diario' ? (
        <div className="ledger">
          <header className="module-bar">
            <h2>Libro diario</h2>
            <span>{inRange.length} partidas</span>
          </header>
          {inRange.length === 0 ? (
            <p className="empty" style={{ margin: 14 }}>Sin partidas en {label.toLowerCase()}.</p>
          ) : (
            <div className="table-wrap">
              <table className="biz-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Partida</th>
                    <th>Cuenta</th>
                    <th className="num">Debe</th>
                    <th className="num">Haber</th>
                  </tr>
                </thead>
                <tbody>
                  {inRange
                    .slice()
                    .reverse()
                    .slice(0, 150)
                    .flatMap((entry) =>
                      entry.lines.map((line, index) => (
                        <tr key={`${entry.id}-${index}`} style={index === entry.lines.length - 1 ? { borderBottom: '2px solid var(--line)' } : undefined}>
                          <td>{index === 0 ? longDate(entry.date) : ''}</td>
                          <td>
                            {index === 0 ? (
                              <>
                                <strong>{entry.ref}</strong>
                                <small>{entry.concept}</small>
                              </>
                            ) : null}
                          </td>
                          <td style={line.credit ? { paddingLeft: 34 } : undefined}>
                            {line.code} {accountName(line.code)}
                          </td>
                          <td className="num">{line.debit ? money(line.debit) : ''}</td>
                          <td className="num">{line.credit ? money(line.credit) : ''}</td>
                        </tr>
                      )),
                    )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {tab === 'impuestos' ? (
        <div className="ledger">
          <header className="module-bar">
            <h2>{mixed ? 'Impuestos del año' : regime === 'pequeno' ? 'Impuesto de pequeño contribuyente (5 %)' : regime === 'general' ? 'IVA del año' : 'Impuestos'}</h2>
            <span>{year}</span>
          </header>
          {!anyRegime ? (
            <p className="empty" style={{ margin: 14 }}>Elige el régimen fiscal arriba para calcular impuestos.</p>
          ) : (
            <div className="table-wrap">
              <table className="biz-table">
                <thead>
                  <tr>
                    <th>Mes</th>
                    {mixed ? <th>Régimen</th> : null}
                    <th className="num">Ingresos</th>
                    {anyGeneral ? <th className="num">IVA débito</th> : null}
                    {anyGeneral ? <th className="num">IVA crédito</th> : null}
                    {anyGeneral ? <th className="num">Crédito anterior</th> : null}
                    <th className="num">A pagar</th>
                  </tr>
                </thead>
                <tbody>
                  {taxes.map((item) => (
                    <tr key={item.month}>
                      <td style={{ textTransform: 'capitalize' }}>{item.label}</td>
                      {mixed ? <td>{item.regime === 'general' ? 'General' : item.regime === 'pequeno' ? 'Pequeño' : 'Sin elegir'}</td> : null}
                      <td className="num">{money(item.base)}</td>
                      {anyGeneral ? <td className="num">{item.regime === 'general' ? money(item.debitTax) : '—'}</td> : null}
                      {anyGeneral ? <td className="num">{money(item.creditTax)}</td> : null}
                      {anyGeneral ? <td className="num">{item.regime === 'general' ? money(item.carried) : '—'}</td> : null}
                      <td className="num">
                        <strong>{money(item.payable)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    {mixed ? <td /> : null}
                    <td className="num">{money(round2(taxes.reduce((sum, item) => sum + item.base, 0)))}</td>
                    {anyGeneral ? <td className="num">{money(round2(taxes.reduce((sum, item) => sum + item.debitTax, 0)))}</td> : null}
                    {anyGeneral ? <td className="num">{money(round2(taxes.reduce((sum, item) => sum + item.creditTax, 0)))}</td> : null}
                    {anyGeneral ? <td /> : null}
                    <td className="num">{money(round2(taxes.reduce((sum, item) => sum + item.payable, 0)))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <p className="section-note">
            El pago a la SAT se registra en Gastos con la categoría “Pago de impuestos SAT” y baja el saldo de impuestos por pagar. En régimen general, el IVA crédito que sobra un mes se
            arrastra al siguiente. Para que una factura de proveedor cuente como crédito, marca “Factura con IVA” al registrar el gasto.
          </p>
        </div>
      ) : null}
    </section>
  )
}

function Rows({ title, rows }: { title: string; rows: Balance[] }) {
  return (
    <>
      <div className="head">
        <span>{title}</span>
        <span />
      </div>
      {rows.length === 0 ? (
        <div className="indent">
          <span>Sin movimientos</span>
          <span>{money(0)}</span>
        </div>
      ) : (
        rows.map((row) => (
          <div key={row.code} className="indent">
            <span>
              {row.code} · {row.name}
            </span>
            <span>{money(row.balance)}</span>
          </div>
        ))
      )}
    </>
  )
}
