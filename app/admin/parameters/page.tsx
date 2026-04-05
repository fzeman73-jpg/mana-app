import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import {
  createPeriod, deletePeriod, setActivePeriod,
  createPerformanceParameter, updatePerformanceParameter, deletePerformanceParameter,
  upsertQuarterlyResult, lockQuarter,
  adminSetCompensation, adminAddKpiTask, adminDeleteKpiTask, adminToggleKpiTask, updateKpiTaskCompletion,
  setParameterWeight, resetParameterWeight,
  upsertPopAssignment, deletePopAssignment,
  closeQuarter, reopenQuarter,
} from "@/lib/actions"
import Image from "next/image"
import { redirect } from "next/navigation"

const fmt  = (n: number) => Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 }).format(Math.round(n))
const pct  = (n: number) => `${n}%`

export default async function ParametersPage({
  searchParams,
}: {
  searchParams: Promise<{ periodId?: string; userId?: string; tab?: string; year?: string }>
}) {
  const session = await auth()
  const caller  = await prisma.user.findUnique({
    where:   { email: session?.user?.email || "" },
    include: { division: true },
  })
  if (caller?.role !== "ADMIN" && caller?.role !== "MANAGER") redirect("/")
  const isAdmin   = caller?.role === "ADMIN"
  const isManager = caller?.role === "MANAGER"

  // Manager vidí pouze tab Manažeři
  const { periodId, userId, year } = await searchParams
  const rawTab = (await searchParams).tab
  const tab = isManager ? "manageri" : (rawTab ?? "firma")

  const [periods, users, divisions] = await Promise.all([
    prisma.period.findMany({ orderBy: { startDate: "desc" } }),
    prisma.user.findMany({ where: { isAllowed: true }, include: { division: true }, orderBy: { name: "asc" } }),
    prisma.division.findMany({ orderBy: { name: "asc" } }),
  ])

  const sel  = (periods.find(p => p.id === periodId) ?? periods.find(p => p.isActive) ?? periods[0] ?? null) as typeof periods[number] | null
  const selU = users.find(u => u.id === userId) ?? null

  // Data pro vybrané období
  const [perfParams, closedQuarters] = sel ? await Promise.all([
    prisma.performanceParameter.findMany({
      where:   { periodId: sel.id },
      include: { results: { orderBy: { year: "asc" } } },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.quarterlySnapshot.findMany({ where: { periodId: sel.id }, select: { quarter: true, year: true } }),
  ]) : [[], []]

  // PopPlány (vždy)
  const allPopPlans = await prisma.popPlan.findMany({ orderBy: { name: "asc" } })

  // Data pro vybraného uživatele + období
  const [compensation, kpiTasks, allCompensations, weightOverrides, popAssignments] = (sel && selU) ? await Promise.all([
    prisma.compensation.findUnique({ where: { userId_periodId: { userId: selU.id, periodId: sel.id } } }),
    prisma.kpiTask.findMany({ where: { userId: selU.id, periodId: sel.id }, orderBy: { name: "asc" } }),
    prisma.compensation.findMany({ where: { periodId: sel.id }, select: { userId: true } }),
    prisma.parameterWeight.findMany({ where: { userId: selU.id } }),
    prisma.popAssignment.findMany({ where: { userId: selU.id }, include: { popPlan: true }, orderBy: { grantDate: "asc" } }),
  ]) : [null, [], sel ? await prisma.compensation.findMany({ where: { periodId: sel.id }, select: { userId: true } }) : [], [], []]

  const weightMap      = new Map(weightOverrides.map(r => [r.parameterId, r.weight]))
  const assignmentList = popAssignments

  const now   = new Date()
  const curQ  = Math.ceil((now.getMonth() + 1) / 3)
  const nowY  = now.getFullYear()
  const curY  = year ? parseInt(year) : nowY

  // Dostupné roky z výsledků parametrů
  const availableYears: number[] = Array.from(
    new Set(perfParams.flatMap(p => p.results.map(r => r.year as number)))
  ).sort()
  if (!availableYears.includes(nowY)) availableYears.push(nowY)

  type PerfParamRow = typeof perfParams[number]
  type KpiTaskRow   = typeof kpiTasks[number]
  const allParams         = perfParams
  const companyParams     = allParams.filter(p => !p.divisionId)
  const divisionParamsFor = (divId: string) => allParams.filter(p => p.divisionId === divId)

  const href = (params: Record<string, string | undefined>) => {
    const base: Record<string, string> = {}
    if (periodId) base.periodId = periodId
    if (userId)   base.userId   = userId
    if (tab)      base.tab      = tab
    if (year)     base.year     = year
    Object.assign(base, params)
    return `/admin/parameters?${new URLSearchParams(Object.fromEntries(Object.entries(base).filter(([,v]) => v))).toString()}`
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans selection:bg-brand-cyan/20">

      {/* HLAVIČKA */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
        <div className="px-4 sm:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <a href="/"><Image src="/algotech-logo.png" alt="Algotech" width={130} height={38} className="object-contain" /></a>
            <div className="w-px h-6 bg-gray-200 hidden sm:block" />
            <div className="hidden sm:block">
              <p className="text-sm font-black text-brand-pink uppercase tracking-tight">Nastavení plánů</p>
              {selU && <p className="text-[9px] font-black text-brand-cyan uppercase tracking-widest">{selU.name || selU.email}</p>}
            </div>
          </div>
          <div className="flex items-center gap-4 sm:gap-6">
            {sel && !isManager && (
              <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
                <a href={href({ tab: "firma" })} className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${tab === "firma" ? "bg-white text-brand-cyan shadow-sm" : "text-gray-400 hover:text-brand-cyan"}`}>Firma</a>
                <a href={href({ tab: "manageri" })} className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${tab === "manageri" ? "bg-white text-brand-cyan shadow-sm" : "text-gray-400 hover:text-brand-cyan"}`}>Manažeři</a>
              </div>
            )}
            <div className="w-px h-5 bg-gray-200 hidden sm:block" />
            <a href="/admin/reports" className="text-gray-400 hover:text-brand-cyan text-xs font-black uppercase tracking-widest transition-colors hidden sm:block">Reporty</a>
            <a href="/admin/pop" className="text-gray-400 hover:text-brand-cyan text-xs font-black uppercase tracking-widest transition-colors hidden sm:block">POP</a>
            <a href="/admin" className="text-gray-400 hover:text-brand-cyan text-xs font-black uppercase tracking-widest transition-colors hidden sm:block">Uživatelé</a>
            <a href="/" className="text-gray-400 hover:text-brand-cyan text-xs font-black uppercase tracking-widest transition-colors">← Cockpit</a>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto p-8 space-y-6">

        {/* ── OBDOBÍ ─────────────────────────────────────────────────────── */}
        <section className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[11px] font-black text-brand-cyan uppercase tracking-[0.3em] italic">Časové období</h2>
            {sel && <span className="text-[10px] font-black text-white bg-brand-cyan px-3 py-1 rounded-full">{sel.name}</span>}
          </div>

          <div className="flex flex-wrap gap-3 mb-4">
            {periods.map(p => (
              <div key={p.id} className={`rounded-2xl border transition-all ${sel?.id === p.id ? "border-brand-cyan ring-2 ring-brand-cyan/20" : "border-gray-200"}`}>
                <a href={href({ periodId: p.id, userId: undefined })}
                  className={`flex items-center gap-3 px-4 py-3 block ${sel?.id === p.id ? "bg-brand-cyan/5" : "hover:bg-gray-50"}`}>
                  <div>
                    <p className="font-black text-gray-900 text-sm">{p.name}</p>
                    <p className="text-[10px] text-gray-400">{new Date(p.startDate).toLocaleDateString('cs-CZ')} – {new Date(p.endDate).toLocaleDateString('cs-CZ')}</p>
                  </div>
                  {p.isActive && <span className="text-[8px] font-black bg-brand-green/20 text-brand-green px-2 py-0.5 rounded-full uppercase ml-1">Aktivní</span>}
                </a>
                <div className="flex gap-3 px-4 py-2 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
                  {!p.isActive && (
                    <form action={setActivePeriod.bind(null, p.id)}>
                      <button className="text-[9px] font-black text-gray-400 hover:text-brand-green transition-colors uppercase tracking-wider">Aktivovat</button>
                    </form>
                  )}
                  {isAdmin && (
                    <form action={deletePeriod.bind(null, p.id)} className="ml-auto">
                      <button className="text-[9px] font-black text-gray-300 hover:text-brand-pink transition-colors uppercase tracking-wider">Smazat</button>
                    </form>
                  )}
                </div>
              </div>
            ))}
            {periods.length === 0 && <p className="text-gray-400 text-sm italic">Zatím žádná období.</p>}
          </div>

          {isAdmin && (
            <form action={createPeriod} className="flex flex-wrap gap-3 pt-4 border-t border-gray-100">
              <input name="name" placeholder="Název (např. Rok 2025)" required className={inputCls} />
              <input name="startDate" type="date" required className={inputCls} />
              <input name="endDate"   type="date" required className={inputCls} />
              <button type="submit" className={btnCyan}>+ Přidat</button>
            </form>
          )}
        </section>

        {/* ── TAB: FIRMA ─────────────────────────────────────────────────── */}
        {sel && tab === "firma" && isAdmin && (
          <>

            {/* Výkonnostní parametry */}
            <section className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
              {/* Hlavička + rok */}
              <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
                <div>
                  <h2 className="text-[11px] font-black text-brand-cyan uppercase tracking-[0.3em] italic mb-1">Výkonnostní parametry</h2>
                  <p className="text-[11px] text-gray-400">Firemní parametry platí všem. Divize dostávají navíc své vlastní. Celková váha = 100 %.</p>
                </div>
                {availableYears.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mr-1">Rok:</span>
                    {availableYears.map(yr => (
                      <a key={yr} href={href({ year: String(yr) })}
                        className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all border ${yr === curY ? "bg-brand-navy text-white border-brand-navy" : "border-gray-200 text-gray-400 hover:border-brand-navy hover:text-brand-navy"}`}>
                        {yr}
                      </a>
                    ))}
                  </div>
                )}
              </div>

              {(() => {
                const renderParamCard = (p: PerfParamRow) => (
                  <div key={p.id} className="border border-gray-200 rounded-2xl overflow-hidden">
                    <div className="flex items-start justify-between px-5 py-4 bg-gray-50">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="font-black text-gray-900 text-sm">{p.name}</span>
                          {p.gatesParamId && (
                            <span className="text-[9px] font-black bg-brand-pink/10 text-brand-pink px-2 py-0.5 rounded-full">
                              gates → {allParams.find(x => x.id === p.gatesParamId)?.name ?? "?"}
                            </span>
                          )}
                        </div>
                        {p.description && <p className="text-[10px] text-gray-400 mt-1">{p.description}</p>}
                        {/* Inline edit: minimální plnění (váha se nastavuje per-user) */}
                        <form action={updatePerformanceParameter.bind(null, p.id)} className="flex items-center gap-3 mt-2 flex-wrap">
                          <input type="hidden" name="name" value={p.name} />
                          <input type="hidden" name="description" value={p.description ?? ""} />
                          <input type="hidden" name="weight" value={p.weight} />
                          <input type="hidden" name="gatesParamId" value={p.gatesParamId ?? ""} />
                          <label className="flex items-center gap-1.5">
                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider">Min. plnění</span>
                            <input name="threshold" type="number" step="0.1" min="0" max="100" defaultValue={p.threshold}
                              className="w-16 bg-white border border-gray-200 rounded-lg px-2 py-1 text-xs font-bold text-gray-900 outline-none focus:border-brand-cyan text-center" />
                            <span className="text-[9px] text-gray-400">%</span>
                          </label>
                          <button type="submit" className="text-[9px] font-black px-2.5 py-1 rounded-lg bg-brand-cyan/10 text-brand-cyan border border-brand-cyan/20 hover:bg-brand-cyan hover:text-brand-navy transition-all">
                            Uložit
                          </button>
                        </form>
                      </div>
                      <div className="flex items-center gap-2 ml-3">
                        {(() => {
                          const res = p.results.find(r => r.quarter === curQ && r.year === curY)
                          const ach = res && res.target > 0 ? Math.min(1.5, res.actual / res.target) : null
                          const met = ach !== null ? ach >= p.threshold / 100 : null
                          return met !== null ? (
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${met ? "bg-brand-green/10 text-brand-green" : "bg-brand-pink/10 text-brand-pink"}`}>
                              {ach !== null ? `${Math.round(ach * 100)}%` : "—"} {met ? "✓" : "✗"}
                            </span>
                          ) : null
                        })()}
                        <form action={deletePerformanceParameter.bind(null, p.id)}>
                          <button className="text-gray-300 hover:text-brand-pink transition-colors p-1">
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                          </button>
                        </form>
                      </div>
                    </div>
                    <div className="px-5 py-4">
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-3">Kvartální výsledky {curY}</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[1, 2, 3, 4].map(q => {
                          const r = p.results.find(r => r.quarter === q && r.year === curY)
                          const qAch = r && r.target > 0 ? Math.min(1.5, r.actual / r.target) : null
                          return (
                            <form key={q} action={upsertQuarterlyResult.bind(null, p.id, q, curY)}>
                              <div className={`rounded-xl border p-3 ${r?.isLocked ? "bg-gray-50 border-gray-200" : "border-gray-200 hover:border-brand-cyan/40"}`}>
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-[9px] font-black text-gray-500 uppercase">Q{q}</span>
                                  {qAch !== null && (
                                    <span className={`text-[9px] font-black ${qAch >= p.threshold / 100 ? "text-brand-green" : "text-brand-pink"}`}>
                                      {Math.round(qAch * 100)}%
                                    </span>
                                  )}
                                </div>
                                {r?.isLocked ? (
                                  <div className="space-y-2">
                                    <div className="bg-brand-green/10 border border-brand-green/30 rounded-xl px-3 py-2">
                                      <p className="text-[8px] font-black text-brand-green uppercase tracking-widest mb-1">🔒 Uzavřeno</p>
                                      <p className="text-xs font-black text-gray-900">{fmt(r.actual)}</p>
                                      <p className="text-[9px] text-gray-400">cíl: {fmt(r.target)}</p>
                                      {r.lockedByEmail && <p className="text-[8px] text-gray-300 mt-1">{r.lockedByEmail}</p>}
                                    </div>
                                    {isAdmin && (
                                      <form action={reopenQuarter.bind(null, sel.id, q, curY)}>
                                        <button type="submit" className="w-full bg-brand-pink/10 text-brand-pink border border-brand-pink/30 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider hover:bg-brand-pink hover:text-white transition-all">
                                          🔓 Odemknout kvartál
                                        </button>
                                      </form>
                                    )}
                                  </div>
                                ) : (
                                  <div className="space-y-1.5">
                                    <div>
                                      <p className="text-[8px] font-black text-gray-400 uppercase tracking-wider mb-0.5">Skutečnost</p>
                                      <input name="actual" type="number" defaultValue={r?.actual ?? 0} step="any"
                                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-bold text-gray-900 outline-none focus:border-brand-cyan" />
                                      <p className="text-[9px] text-gray-400 mt-0.5">{fmt(r?.actual ?? 0)}</p>
                                    </div>
                                    <div>
                                      <p className="text-[8px] font-black text-gray-400 uppercase tracking-wider mb-0.5">Cíl</p>
                                      <input name="target" type="number" defaultValue={r?.target ?? 0} step="any"
                                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-bold text-gray-900 outline-none focus:border-brand-cyan" />
                                      <p className="text-[9px] text-gray-400 mt-0.5">{fmt(r?.target ?? 0)}</p>
                                    </div>
                                    <input name="note" placeholder="Poznámka" defaultValue={r?.note ?? ""}
                                      className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-[10px] text-gray-600 outline-none focus:border-brand-cyan" />
                                    <div className="flex gap-1">
                                      <button type="submit" className="flex-1 bg-brand-cyan text-brand-navy py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider hover:bg-brand-pink hover:text-white transition-all">Uložit</button>
                                      {isAdmin && (
                                        <form action={lockQuarter.bind(null, p.id, q, curY)}>
                                          <button type="submit" className="bg-brand-navy/10 text-brand-navy border border-brand-navy/20 px-3 py-1.5 rounded-lg text-[9px] font-black hover:bg-brand-navy hover:text-white transition-all" title="Uzavřít kvartál">
                                            🔒
                                          </button>
                                        </form>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </form>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )

                const addParamForm = (divisionId: string | null, count: number) => (
                  <details className="group mt-3">
                    <summary className="cursor-pointer text-[10px] font-black text-brand-cyan uppercase tracking-widest hover:underline list-none">+ Přidat parametr</summary>
                    <form action={createPerformanceParameter.bind(null, sel.id)} className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-gray-50 rounded-2xl border border-gray-200">
                      <input type="hidden" name="divisionId" value={divisionId ?? ""} />
                      <div className="sm:col-span-2">
                        <Label>Název</Label>
                        <input name="name" placeholder="např. EBITDA skupiny" required className={inputCls} />
                      </div>
                      <div className="sm:col-span-2">
                        <Label>Popis metodiky</Label>
                        <textarea name="description" rows={2} className={inputCls + " resize-none"} />
                      </div>
                      <div><Label>Váha (%)</Label><input name="weight" type="number" step="0.1" min="0" max="100" placeholder="40" className={inputCls} /></div>
                      <div><Label>Bariéra (%)</Label><input name="threshold" type="number" step="0.1" min="0" max="100" placeholder="80" className={inputCls} /></div>
                      <div><Label>Pořadí</Label><input name="sortOrder" type="number" defaultValue={count} className={inputCls} /></div>
                      <div className="flex items-end"><button type="submit" className={btnCyan + " w-full"}>Přidat</button></div>
                    </form>
                  </details>
                )

                return (
                  <div className="space-y-6">
                    {/* FIREMNÍ — platí všem */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-[10px] font-black text-gray-700 uppercase tracking-widest">Firemní</span>
                        <span className="text-[9px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">platí všem manažerům</span>
                      </div>
                      <div className="space-y-3">{companyParams.map(renderParamCard)}</div>
                      {addParamForm(null, companyParams.length)}
                    </div>

                    {/* PER DIVIZE */}
                    {divisions.map(div => {
                      const dps = divisionParamsFor(div.id)
                      return (
                        <div key={div.id} className="border-t border-gray-100 pt-5">
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-[10px] font-black text-brand-pink uppercase tracking-widest">{div.name}</span>
                            <span className="text-[9px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">pouze tato divize</span>
                          </div>
                          <div className="space-y-3">{dps.map(renderParamCard)}</div>
                          {dps.length === 0 && <p className="text-[11px] text-gray-300 italic py-2">Žádné divize parametry.</p>}
                          {/* Celková váha pro manažera v této divizi: firemní + divize */}
                          {dps.length > 0 && (() => {
                            const total = [...companyParams, ...dps].reduce((s, p) => s + p.weight, 0)
                            return <p className={`text-[10px] text-right mt-2 font-black ${Math.abs(total - 100) < 0.1 ? "text-brand-green" : "text-brand-pink"}`}>
                              Váha manažera v {div.name}: {total}% {Math.abs(total - 100) >= 0.1 ? "(doporučeno 100%)" : "✓"}
                            </p>
                          })()}
                          {addParamForm(div.id, dps.length)}
                        </div>
                      )
                    })}

                    {/* GATING */}
                    {allParams.length >= 2 && (
                      <div className="border-t border-gray-100 pt-4">
                        <details className="group">
                          <summary className="cursor-pointer text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-brand-pink transition-colors list-none">⚡ Nastavit gating (podmíněné nulování)</summary>
                          <div className="mt-4 space-y-2 p-4 bg-gray-50 rounded-2xl border border-gray-200">
                            <p className="text-[10px] text-gray-400 mb-3">Pokud parametr A nesplní bariéru, parametr B se automaticky nuluje.</p>
                            {allParams.map(p => (
                              <form key={p.id} action={updatePerformanceParameter.bind(null, p.id)} className="flex items-center gap-3">
                                <span className="text-sm font-black text-gray-700 w-40 truncate">{p.name}</span>
                                <span className="text-[10px] text-gray-400">nuluje →</span>
                                <select name="gatesParamId" defaultValue={p.gatesParamId ?? ""}
                                  className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand-cyan">
                                  <option value="">— žádný —</option>
                                  {allParams.filter(x => x.id !== p.id).map(x => (
                                    <option key={x.id} value={x.id}>{x.name}</option>
                                  ))}
                                </select>
                                <input type="hidden" name="name"        value={p.name} />
                                <input type="hidden" name="description" value={p.description ?? ""} />
                                <input type="hidden" name="weight"      value={p.weight} />
                                <input type="hidden" name="threshold"   value={p.threshold} />
                                <button type="submit" className="text-[9px] font-black text-brand-cyan hover:underline uppercase tracking-wider">Uložit</button>
                              </form>
                            ))}
                          </div>
                        </details>
                      </div>
                    )}
                  </div>
                )
              })()}
            </section>


            {/* Uzavření / otevření kvartálu */}
            {isAdmin && (
              <section className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
                <h2 className="text-[11px] font-black text-brand-cyan uppercase tracking-[0.3em] italic mb-1">Správa kvartálů</h2>
                <p className="text-[11px] text-gray-400 mb-5">
                  Uzavřením kvartálu se vytvoří historický snapshot pro každého manažera (bonus + POP hodnota)
                  a výsledky se zamknou. Otevřením se snapshot smaže a výsledky se odemknou.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[1, 2, 3, 4].map(q => {
                    const isClosed   = (closedQuarters as { quarter: number; year: number }[]).some(s => s.quarter === q && s.year === curY)
                    const isCurrentQ = q === curQ && curY === nowY
                    return (
                      <div key={q} className={`rounded-2xl border p-4 flex flex-col gap-3 ${
                        isClosed
                          ? "bg-gray-50 border-gray-300"
                          : isCurrentQ
                          ? "bg-brand-navy/5 border-brand-navy/30"
                          : "border-gray-200"
                      }`}>
                        <div className="flex items-center justify-between">
                          <span className="font-black text-sm text-gray-900">Q{q} {curY}</span>
                          {isClosed
                            ? <span className="text-[8px] font-black px-2 py-0.5 rounded-full bg-gray-200 text-gray-500 uppercase tracking-wider">Uzavřen</span>
                            : isCurrentQ
                            ? <span className="text-[8px] font-black px-2 py-0.5 rounded-full bg-brand-cyan/15 text-brand-cyan uppercase tracking-wider">Aktuální</span>
                            : <span className="text-[8px] font-black px-2 py-0.5 rounded-full bg-brand-green/10 text-brand-green uppercase tracking-wider">Otevřen</span>
                          }
                        </div>
                        {isClosed ? (
                          <form action={reopenQuarter.bind(null, sel.id, q, curY)}>
                            <button type="submit" className="w-full text-[9px] font-black px-3 py-2 rounded-xl border border-gray-300 text-gray-500 hover:border-brand-pink hover:text-brand-pink transition-all uppercase tracking-wider">
                              Otevřít znovu
                            </button>
                          </form>
                        ) : (
                          <form action={closeQuarter.bind(null, sel.id, q, curY)}>
                            <button type="submit" className={`w-full text-[9px] font-black px-3 py-2 rounded-xl border transition-all uppercase tracking-wider ${
                              isCurrentQ
                                ? "bg-brand-navy text-white border-brand-navy hover:bg-brand-pink hover:border-brand-pink"
                                : "border-gray-200 text-gray-400 hover:border-brand-navy hover:text-brand-navy"
                            }`}>
                              Uzavřít
                            </button>
                          </form>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            )}
          </>
        )}

        {/* ── TAB: MANAŽEŘI ──────────────────────────────────────────────── */}
        {sel && tab === "manageri" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Seznam uživatelů */}
            <div className="lg:col-span-1">
              <section className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
                  <h3 className="text-[11px] font-black text-brand-cyan uppercase tracking-[0.3em] italic">Manažeři</h3>
                </div>
                <div className="divide-y divide-gray-100">
                  {users.map(u => {
                    const hasComp  = allCompensations.some(c => c.userId === u.id)
                    const isSel    = selU?.id === u.id
                    return (
                      <a key={u.id} href={href({ userId: u.id })}
                        className={`flex items-center gap-3 px-4 py-3.5 transition-all ${isSel ? "bg-brand-cyan/5 border-l-[3px] border-brand-cyan" : "hover:bg-gray-50 border-l-[3px] border-transparent"}`}>
                        <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center font-black text-brand-cyan text-xs border border-gray-200 flex-shrink-0">
                          {u.name?.charAt(0) || u.email?.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-black text-gray-900 text-sm truncate">{u.name || u.email}</p>
                          <p className="text-[9px] text-gray-400 truncate">{u.email}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase ${u.role === "ADMIN" ? "bg-brand-cyan/10 text-brand-cyan" : u.role === "MANAGER" ? "bg-brand-pink/10 text-brand-pink" : "bg-gray-100 text-gray-400"}`}>
                            {u.role === "ADMIN" ? "Admin" : u.role === "MANAGER" ? "Manažer" : "User"}
                          </span>
                          <span className={`text-[8px] font-black ${hasComp ? "text-brand-green" : "text-gray-300"}`}>
                            {hasComp ? "✓" : "○"} odměna
                          </span>
                        </div>
                      </a>
                    )
                  })}
                </div>
              </section>
            </div>

            {/* Detail uživatele */}
            <div className="lg:col-span-2 space-y-5">
              {!selU ? (
                <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm flex items-center justify-center h-48">
                  <p className="text-gray-400 font-black text-sm uppercase tracking-widest">← Vyberte manažera</p>
                </div>
              ) : (
                <>
                  {/* Identita */}
                  <div className="bg-white px-5 py-4 rounded-[2rem] border border-gray-100 shadow-sm flex items-center gap-4">
                    <div className="w-11 h-11 rounded-2xl bg-gray-100 flex items-center justify-center font-black text-brand-cyan text-base border border-gray-200">
                      {selU.name?.charAt(0) || selU.email?.charAt(0)}
                    </div>
                    <div>
                      <p className="font-black text-gray-900 italic uppercase tracking-tight">{selU.name || "—"}</p>
                      <p className="text-[11px] text-gray-400">{selU.email} · {sel.name}</p>
                    </div>
                  </div>

                  {/* ODMĚNA */}
                  <section className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
                    <h3 className="text-[11px] font-black text-brand-cyan uppercase tracking-[0.3em] italic mb-5">Smluvní podmínky odměny</h3>
                    <form action={adminSetCompensation.bind(null, selU.id, sel.id)} className="space-y-5">

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Základní plat / měs. (CZK)</Label>
                          <input name="baseSalary" type="number" defaultValue={compensation?.baseSalary ?? 0} className={inputCls} />
                          <p className="text-[9px] text-gray-400 mt-1">{fmt(compensation?.baseSalary ?? 0)}</p>
                        </div>
                        <div>
                          <Label>Roční cílový bonus (CZK)</Label>
                          <input name="targetBonusAnnual" type="number" defaultValue={compensation?.targetBonusAnnual ?? 0} className={inputCls} />
                          <p className="text-[9px] text-gray-400 mt-1">{fmt(compensation?.targetBonusAnnual ?? 0)}</p>
                        </div>
                        <div>
                          <Label>KPI váha (% z bonusu)</Label>
                          <input name="kpiWeight" type="number" step="0.1" min="0" max="100"
                            defaultValue={compensation?.kpiWeight ?? 0} className={inputCls} />
                          <p className="text-[9px] text-gray-400 mt-1">Kolik % z cílového bonusu tvoří KPI složka. 0 = KPI bonus nepočítá.</p>
                        </div>
                      </div>

                      <button type="submit" className={btnCyan + " w-full"}>Uložit smluvní podmínky</button>
                    </form>
                  </section>

                  {/* VÝKONNOSTNÍ PARAMETRY — přepsání vah */}
                  {sel && (() => {
                    const selUDivId = selU.divisionId
                    const managerParams = allParams.filter(p => !p.divisionId || p.divisionId === selUDivId)
                    if (managerParams.length === 0) return null
                    const totalOverride = managerParams.reduce((s, p) => s + (weightMap.get(p.id) ?? p.weight), 0)
                    const kpiW = compensation?.kpiWeight ?? 0
                    const grandTotal = totalOverride + kpiW
                    return (
                      <section className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <h3 className="text-[11px] font-black text-brand-cyan uppercase tracking-[0.3em] italic">Výkonnostní parametry</h3>
                            <p className="text-[11px] text-gray-400 mt-0.5">Přepište váhu pro tohoto manažera. Prázdné = výchozí globální hodnota.</p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className={`text-[9px] font-black px-3 py-1 rounded-full flex-shrink-0 ${Math.abs(grandTotal - 100) < 0.1 ? "bg-brand-green/10 text-brand-green" : "bg-brand-pink/10 text-brand-pink"}`}>
                              Celkem: {grandTotal.toFixed(1)}% / 100%
                            </span>
                            <span className="text-[8px] text-gray-400">
                              parametry {totalOverride.toFixed(1)}% + KPI {kpiW.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                        <div className="space-y-2">
                          {managerParams.map(p => {
                            const overrideW = weightMap.get(p.id)
                            const effective = overrideW ?? p.weight
                            const isDiv     = !!p.divisionId
                            return (
                              <div key={p.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${overrideW !== undefined ? "bg-brand-cyan/5 border-brand-cyan/20" : "bg-gray-50 border-gray-200"}`}>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-black text-sm text-gray-900 truncate">{p.name}</span>
                                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full ${isDiv ? "bg-brand-pink/10 text-brand-pink" : "bg-gray-100 text-gray-400"}`}>
                                      {isDiv ? "divize" : "firemní"}
                                    </span>
                                  </div>
                                  <span className="text-[9px] text-gray-400">bariéra {p.threshold}%</span>
                                </div>
                                <form action={setParameterWeight.bind(null, selU.id, p.id)} className="flex items-center gap-2">
                                  <input name="weight" type="number" step="0.1" min="0" max="100"
                                    defaultValue={effective}
                                    className="w-20 bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-bold text-gray-900 outline-none focus:border-brand-cyan text-center" />
                                  <span className="text-[10px] text-gray-400">%</span>
                                  <button type="submit" className="text-[9px] font-black px-3 py-1.5 rounded-xl bg-brand-cyan/10 text-brand-cyan hover:bg-brand-cyan hover:text-brand-navy transition-all border border-brand-cyan/20">
                                    Uložit
                                  </button>
                                </form>
                                {overrideW !== undefined && (
                                  <form action={resetParameterWeight.bind(null, selU.id, p.id)}>
                                    <button type="submit" className="text-[9px] font-black text-gray-300 hover:text-brand-pink transition-colors px-2 py-1.5" title="Obnovit výchozí váhu">
                                      ↺
                                    </button>
                                  </form>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </section>
                    )
                  })()}

                  {/* KPI ÚKOLY — per kvartál */}
                  <section className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
                    <h3 className="text-[11px] font-black text-brand-cyan uppercase tracking-[0.3em] italic mb-5">Individuální KPI úkoly</h3>
                    {[1, 2, 3, 4].map(q => {
                      const qTasks = kpiTasks.filter((t: KpiTaskRow) => (t.quarter ?? 1) === q)
                      const qTotal = qTasks.reduce((s: number, t: KpiTaskRow) => s + t.weight, 0)
                      const typeLabel: Record<string, string> = { BOOLEAN: "Splněno/Ne", PERCENT: "% plnění", AMOUNT: "Částka" }
                      return (
                        <details key={q} className="mb-3 border border-gray-100 rounded-2xl overflow-hidden" open={q === curQ}>
                          <summary className="cursor-pointer px-5 py-3 flex items-center justify-between list-none select-none bg-gray-50 hover:bg-gray-100 transition-colors">
                            <span className="text-xs font-black text-gray-700 uppercase tracking-wider">Q{q} {curY}</span>
                            <div className="flex items-center gap-2">
                              <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${Math.abs(qTotal - 100) < 0.1 ? "bg-brand-green/10 text-brand-green" : qTasks.length === 0 ? "bg-gray-100 text-gray-400" : "bg-brand-pink/10 text-brand-pink"}`}>
                                {qTasks.length === 0 ? "bez KPI" : `váha ${qTotal.toFixed(0)}%`}
                              </span>
                              <span className="text-gray-300 text-xs">▼</span>
                            </div>
                          </summary>
                          <div className="px-5 py-4 space-y-3">
                            {/* Formulář pro přidání */}
                            <form action={adminAddKpiTask.bind(null, selU.id, sel.id, q)} className="space-y-2 bg-gray-50 p-3 rounded-xl border border-gray-200">
                              <div className="flex gap-3">
                                <div className="flex-1 space-y-1.5">
                                  <input name="name" placeholder="Název KPI úkolu..." required
                                    className="w-full bg-transparent px-3 py-2 outline-none font-bold text-sm text-gray-900 placeholder:text-gray-400" />
                                  <textarea name="description" placeholder="Krátký popis a podmínky splnění..." rows={2}
                                    className="w-full bg-transparent px-3 py-1 outline-none text-[11px] text-gray-500 placeholder:text-gray-300 resize-none" />
                                  <textarea name="assignmentDetail" placeholder="Detailní zadání — metodika, kontext, příklady..." rows={3}
                                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 outline-none text-[11px] text-gray-600 placeholder:text-gray-300 resize-none focus:border-brand-cyan" />
                                </div>
                                <div className="flex flex-col gap-2 items-end">
                                  <input name="weight" type="number" step="1" min="0" max="100" placeholder="%" required
                                    className="w-16 bg-white rounded-lg px-2 py-2 text-center font-black text-brand-cyan border-2 border-gray-200 focus:border-brand-cyan outline-none text-sm" />
                                  <button type="submit" className={btnCyan}>+</button>
                                </div>
                              </div>
                              <div className="flex items-center gap-3 pt-1 border-t border-gray-200 flex-wrap">
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Typ:</span>
                                {[["BOOLEAN","Splněno/Ne"],["PERCENT","% plnění"],["AMOUNT","Částka"]].map(([val, label]) => (
                                  <label key={val} className="flex items-center gap-1 cursor-pointer">
                                    <input type="radio" name="taskType" value={val} defaultChecked={val === "BOOLEAN"} className="accent-brand-cyan" />
                                    <span className="text-[10px] font-bold text-gray-600">{label}</span>
                                  </label>
                                ))}
                                <input name="targetAmount" type="number" step="1" min="0" placeholder="Cíl (CZK)"
                                  className="ml-auto w-28 bg-white rounded-lg px-2 py-1 text-sm font-bold text-gray-700 border border-gray-200 focus:border-brand-cyan outline-none placeholder:text-gray-300" />
                                <span className="text-[9px] text-gray-400">← jen Částka</span>
                              </div>
                            </form>

                            {/* Seznam úkolů */}
                            {qTasks.length === 0 ? (
                              <p className="text-center text-gray-300 py-4 text-xs italic">Žádné KPI úkoly pro Q{q}.</p>
                            ) : (
                              <div className="space-y-2">
                                {qTasks.map((t: KpiTaskRow) => {
                                  const norm = t.taskType === "PERCENT" ? Math.min(1, (t.completionPct ?? 0) / 100)
                                    : t.taskType === "AMOUNT" && (t.targetAmount ?? 0) > 0 ? Math.min(1, (t.actualAmount ?? 0) / t.targetAmount!)
                                    : t.isCompleted ? 1 : 0
                                  return (
                                    <div key={t.id} className={`px-4 py-3 rounded-xl border ${norm >= 1 ? "bg-brand-green/5 border-brand-green/20" : norm > 0 ? "bg-brand-cyan/5 border-brand-cyan/20" : "bg-gray-50 border-gray-200"}`}>
                                      <div className="flex items-start gap-3">
                                        <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${norm >= 1 ? "bg-brand-green" : norm > 0 ? "bg-brand-cyan" : "bg-gray-300"}`} />
                                        <div className="flex-1 min-w-0">
                                          <p className={`font-black text-sm ${norm >= 1 ? "text-brand-green" : "text-gray-900"}`}>{t.name}</p>
                                          {t.description && <p className="text-[10px] text-gray-500 mt-0.5 whitespace-pre-wrap">{t.description}</p>}
                                          {t.assignmentDetail && <p className="text-[10px] text-gray-400 mt-1 whitespace-pre-wrap border-l-2 border-gray-200 pl-2">{t.assignmentDetail}</p>}
                                          {t.evaluationNote && <p className="text-[10px] text-brand-cyan italic mt-1">Vyhodnocení: {t.evaluationNote}</p>}
                                        </div>
                                        <span className="text-[9px] font-black text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200 flex-shrink-0">{typeLabel[t.taskType] ?? t.taskType}</span>
                                        <span className="text-[9px] font-black text-brand-cyan bg-white px-2 py-0.5 rounded-full border border-gray-200 flex-shrink-0">{t.weight}%</span>
                                        <form action={adminDeleteKpiTask.bind(null, t.id)}>
                                          <button className="text-gray-300 hover:text-brand-pink p-1 rounded transition-colors flex-shrink-0">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                                          </button>
                                        </form>
                                      </div>
                                      {/* Vyhodnocení */}
                                      {t.taskType === "BOOLEAN" && (
                                        <form action={adminToggleKpiTask.bind(null, t.id, t.isCompleted)} className="mt-2 space-y-1.5">
                                          <textarea name="evaluationNote" placeholder="Komentář k vyhodnocení..." defaultValue={t.evaluationNote ?? ""} rows={2}
                                            className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-[10px] text-gray-700 outline-none focus:border-brand-cyan resize-none placeholder:text-gray-300" />
                                          <button type="submit" className={`text-[9px] font-black px-3 py-1.5 rounded-xl border transition-all ${t.isCompleted ? "border-brand-green/30 text-brand-green hover:bg-brand-green/10" : "border-gray-200 text-gray-400 hover:border-brand-cyan hover:text-brand-cyan"}`}>
                                            {t.isCompleted ? "✓ Splněno — klikem odvolat" : "Označit jako splněno"}
                                          </button>
                                        </form>
                                      )}
                                      {t.taskType === "PERCENT" && (
                                        <form action={updateKpiTaskCompletion.bind(null, t.id)} className="mt-2 space-y-1.5">
                                          <input type="hidden" name="taskType" value="PERCENT" />
                                          <div className="flex items-center gap-2">
                                            <input name="completionPct" type="number" min="0" max="100" step="1" defaultValue={t.completionPct ?? 0}
                                              className="w-20 bg-white border border-gray-200 rounded-lg px-2 py-1 text-sm font-bold text-gray-900 outline-none focus:border-brand-cyan" />
                                            <span className="text-[10px] text-gray-400 font-bold">%</span>
                                            <button type="submit" className="text-[9px] font-black px-3 py-1.5 rounded-xl border border-brand-cyan/30 text-brand-cyan hover:bg-brand-cyan/10 transition-all">Uložit</button>
                                          </div>
                                          <textarea name="evaluationNote" placeholder="Komentář k vyhodnocení..." defaultValue={t.evaluationNote ?? ""} rows={2}
                                            className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-[10px] text-gray-700 outline-none focus:border-brand-cyan resize-none placeholder:text-gray-300" />
                                        </form>
                                      )}
                                      {t.taskType === "AMOUNT" && (
                                        <form action={updateKpiTaskCompletion.bind(null, t.id)} className="mt-2 space-y-1.5">
                                          <input type="hidden" name="taskType" value="AMOUNT" />
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-[10px] text-gray-400">Cíl: <span className="font-black text-gray-700">{fmt(t.targetAmount ?? 0)}</span></span>
                                            <span className="text-gray-300">|</span>
                                            <span className="text-[10px] text-gray-400">Skutečnost:</span>
                                            <div className="flex flex-col">
                                              <input name="actualAmount" type="number" min="0" step="1" defaultValue={t.actualAmount ?? 0}
                                                className="w-28 bg-white border border-gray-200 rounded-lg px-2 py-1 text-sm font-bold text-gray-900 outline-none focus:border-brand-cyan" />
                                              <p className="text-[9px] text-gray-400 mt-0.5 ml-1">{fmt(t.actualAmount ?? 0)}</p>
                                            </div>
                                            <button type="submit" className="text-[9px] font-black px-3 py-1.5 rounded-xl border border-brand-cyan/30 text-brand-cyan hover:bg-brand-cyan/10 transition-all">Uložit</button>
                                          </div>
                                          <textarea name="evaluationNote" placeholder="Komentář k vyhodnocení..." defaultValue={t.evaluationNote ?? ""} rows={2}
                                            className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-[10px] text-gray-700 outline-none focus:border-brand-cyan resize-none placeholder:text-gray-300" />
                                        </form>
                                      )}
                                    </div>
                                  )
                                })}
                                <p className={`text-[10px] text-right pt-1 font-black ${Math.abs(qTotal - 100) < 0.1 ? "text-brand-green" : "text-brand-pink"}`}>
                                  Váha celkem: {qTotal.toFixed(0)}%{Math.abs(qTotal - 100) >= 0.1 && " (doporučeno 100%)"}
                                </p>
                              </div>
                            )}
                          </div>
                        </details>
                      )
                    })}
                  </section>

                  {/* POP PŘIŘAZENÍ */}
                  <section className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
                    <details>
                      <summary className="cursor-pointer px-6 py-4 flex items-center justify-between list-none select-none hover:bg-gray-50 transition-colors">
                        <div className="flex items-center gap-3">
                          <span className="text-[11px] font-black text-brand-pink uppercase tracking-[0.3em] italic">POP Přiřazení</span>
                          {assignmentList.length > 0 && (
                            <span className="text-[9px] font-black bg-brand-pink/10 text-brand-pink px-2 py-0.5 rounded-full">{assignmentList.length} plán{assignmentList.length > 1 ? "y" : ""}</span>
                          )}
                        </div>
                        <span className="text-gray-300 text-xs">▼</span>
                      </summary>

                      <div className="px-6 pb-6 pt-2 space-y-4 border-t border-gray-100">
                        <p className="text-[11px] text-gray-400">Vyberte existující POP plán a nastavte podíl manažera. Ostatní parametry (EBITDA, multiplikátor, vesting) jsou řízeny z nastavení plánu.</p>

                        {/* Existující přiřazení */}
                        {assignmentList.map(a => (
                          <div key={a.id} className="border border-gray-200 rounded-2xl overflow-hidden">
                            <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                              <div>
                                <span className="font-black text-sm text-gray-900">{a.popPlan.name}</span>
                                <span className="ml-2 text-[9px] text-gray-400">{new Date(a.grantDate).toLocaleDateString("cs-CZ")}</span>
                              </div>
                              <form action={deletePopAssignment.bind(null, a.id, a.popPlanId)}>
                                <button className="text-gray-300 hover:text-brand-pink transition-colors p-1">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                                </button>
                              </form>
                            </div>
                            <form action={upsertPopAssignment.bind(null, a.popPlanId)} className="p-4 grid grid-cols-3 gap-3 items-end">
                              <input type="hidden" name="userId" value={selU.id} />
                              <div><Label>Podíl (%)</Label>
                                <input name="sharePercent" type="number" step="0.01" defaultValue={a.sharePercent} className={inputCls} />
                              </div>
                              <div><Label>Datum grantu</Label>
                                <input name="grantDate" type="date" defaultValue={new Date(a.grantDate).toISOString().split('T')[0]} className={inputCls} />
                              </div>
                              <button type="submit" className={btnCyan}>Uložit</button>
                            </form>
                          </div>
                        ))}

                        {/* Přidat přiřazení */}
                        {allPopPlans.length > 0 && (
                          <details className="group">
                            <summary className="cursor-pointer text-[10px] font-black text-brand-pink uppercase tracking-widest hover:underline list-none">+ Přiřadit POP plán</summary>
                            <div className="mt-3 space-y-3 p-4 bg-gray-50 rounded-2xl border border-gray-200">
                              {allPopPlans
                                .filter(p => !assignmentList.some(a => a.popPlanId === p.id))
                                .map(p => (
                                  <form key={p.id} action={upsertPopAssignment.bind(null, p.id)} className="grid grid-cols-3 gap-3 items-end border border-gray-200 rounded-xl p-3 bg-white">
                                    <input type="hidden" name="userId" value={selU.id} />
                                    <div className="col-span-3">
                                      <p className="font-black text-sm text-gray-900">{p.name}</p>
                                      <p className="text-[9px] text-gray-400">EBITDA {fmt(p.grantEbitda)} · koef. {p.baseMultiplier}× · {p.vestingGranularity === "YEARLY" ? `${p.vestingYears} roků` : "kvartálně"}</p>
                                    </div>
                                    <div><Label>Podíl (%)</Label>
                                      <input name="sharePercent" type="number" step="0.01" placeholder="0.5" required className={inputCls} />
                                    </div>
                                    <div><Label>Datum grantu</Label>
                                      <input name="grantDate" type="date" defaultValue={new Date().toISOString().split('T')[0]} className={inputCls} />
                                    </div>
                                    <button type="submit" className={btnCyan}>Přiřadit</button>
                                  </form>
                                ))
                              }
                            </div>
                          </details>
                        )}
                        {allPopPlans.length === 0 && (
                          <p className="text-[11px] text-gray-400 text-center py-4">Nejsou žádné POP plány. Vytvořte je v sekci <a href="/admin/pop" className="text-brand-cyan underline">POP Plány</a>.</p>
                        )}
                      </div>
                    </details>
                  </section>
                </>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const inputCls = "w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all placeholder:text-gray-400 text-gray-900"
const btnCyan  = "bg-brand-cyan text-brand-navy px-5 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-brand-pink hover:text-white transition-all active:scale-95 whitespace-nowrap"

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">{children}</label>
}
