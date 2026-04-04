import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import {
  createPeriod, deletePeriod, setActivePeriod,
  createPerformanceParameter, updatePerformanceParameter, deletePerformanceParameter,
  upsertQuarterlyResult, lockQuarter, unlockQuarter,
  upsertVestingBase, createBooster, toggleBooster, deleteBooster,
  adminSetCompensation, adminAddKpiTask, adminDeleteKpiTask, adminToggleKpiTask, updateKpiTaskCompletion,
  setParameterWeight, resetParameterWeight,
  adminAddPhantomGrant, adminUpdatePhantomGrant, adminDeletePhantomGrant,
  closeQuarter,
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
  const isAdmin = caller?.role === "ADMIN"

  const { periodId, userId, tab = "firma", year } = await searchParams

  const [periods, users, divisions] = await Promise.all([
    prisma.period.findMany({ orderBy: { startDate: "desc" } }),
    prisma.user.findMany({ where: { isAllowed: true }, include: { division: true }, orderBy: { name: "asc" } }),
    (prisma as unknown as { division: { findMany: (a: object) => Promise<{ id: string; name: string }[]> } }).division.findMany({ orderBy: { name: "asc" } }),
  ])

  const sel  = periods.find(p => p.id === periodId) ?? null
  const selU = users.find(u => u.id === userId) ?? null

  // Data pro vybrané období
  const [perfParams, vestingBase, boosters] = sel ? await Promise.all([
    prisma.performanceParameter.findMany({
      where:   { periodId: sel.id },
      include: { results: { orderBy: { year: "asc" } } },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.vestingBase.findUnique({ where: { periodId: sel.id } }),
    prisma.strategicBooster.findMany({ where: { periodId: sel.id }, orderBy: { name: "asc" } }),
  ]) : [[], null, []]

  // Data pro vybraného uživatele + období
  type PhantomGrantRow = { id: string; name: string; sharePercent: number; grantEbitda: number; grantMultiplier: number; grantDate: Date; vestingYears: number; vestingPercent: number; isActive: boolean }
  const [compensation, kpiTasks, allCompensations, weightOverrides, phantomGrants] = (sel && selU) ? await Promise.all([
    prisma.compensation.findUnique({ where: { userId_periodId: { userId: selU.id, periodId: sel.id } } }),
    prisma.kpiTask.findMany({ where: { userId: selU.id, periodId: sel.id }, orderBy: { name: "asc" } }),
    prisma.compensation.findMany({ where: { periodId: sel.id }, select: { userId: true } }),
    (prisma as unknown as { parameterWeight: { findMany: (a: object) => Promise<{ parameterId: string; weight: number }[]> } })
      .parameterWeight.findMany({ where: { userId: selU.id } }),
    (prisma as unknown as { phantomGrant: { findMany: (a: object) => Promise<PhantomGrantRow[]> } })
      .phantomGrant.findMany({ where: { userId: selU.id }, orderBy: { grantDate: "asc" } }),
  ]) : [null, [], sel ? await prisma.compensation.findMany({ where: { periodId: sel.id }, select: { userId: true } }) : [], [], []]

  const weightMap    = new Map((weightOverrides as { parameterId: string; weight: number }[]).map(r => [r.parameterId, r.weight]))
  const phantomList  = phantomGrants as PhantomGrantRow[]

  const now   = new Date()
  const curQ  = Math.ceil((now.getMonth() + 1) / 3)
  const nowY  = now.getFullYear()
  const curY  = year ? parseInt(year) : nowY

  // Dostupné roky z výsledků parametrů
  const availableYears: number[] = Array.from(
    new Set(perfParams.flatMap(p => p.results.map(r => r.year as number)))
  ).sort()
  if (!availableYears.includes(nowY)) availableYears.push(nowY)

  type PerfParamRow = {
    id: string; name: string; description: string | null; weight: number; threshold: number
    sortOrder: number; gatesParamId: string | null; divisionId: string | null
    results: { id: string; quarter: number; year: number; actual: number; target: number; note: string | null; isLocked: boolean; lockedAt: Date | null; lockedByEmail: string | null }[]
  }
  const allParams = perfParams as unknown as PerfParamRow[]
  const companyParams   = allParams.filter(p => !p.divisionId)
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
      <header className="bg-white border-b border-gray-100 px-8 py-4 flex justify-between items-center sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-4">
          <a href="/"><Image src="/algotech-logo.png" alt="Algotech" width={130} height={38} className="object-contain" /></a>
          <div className="w-px h-7 bg-gray-200" />
          <div>
            <h1 className="text-sm font-black italic uppercase tracking-tight text-gray-900">
              <span className="text-brand-pink">Parametry</span>
            </h1>
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Firemní metriky · Odměny · POP</p>
          </div>
          {selU && (
            <>
              <div className="w-px h-7 bg-gray-200" />
              <div>
                <p className="text-sm font-black text-gray-900">{selU.name || selU.email}</p>
                <p className="text-[9px] font-black text-brand-cyan uppercase tracking-widest">
                  {(selU as { division?: { name: string } | null })?.division?.name ?? "Bez divize"}
                </p>
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          {sel && (
            <>
              <a href={href({ tab: "firma" })} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${tab === "firma" ? "bg-brand-cyan text-brand-navy" : "text-gray-500 hover:text-brand-cyan"}`}>
                Firma
              </a>
              <a href={href({ tab: "manageri" })} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${tab === "manageri" ? "bg-brand-cyan text-brand-navy" : "text-gray-500 hover:text-brand-cyan"}`}>
                Manažeři
              </a>
            </>
          )}
          {isAdmin && (
            <a href="/admin" className="bg-gray-100 text-gray-600 px-4 py-2 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-brand-pink hover:text-white transition-all ml-2">
              ← Uživatelé
            </a>
          )}
        </div>
      </header>

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
        {sel && tab === "firma" && (
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
                          <span className="text-[9px] font-black bg-brand-cyan/10 text-brand-cyan px-2 py-0.5 rounded-full">váha {p.weight}%</span>
                          <span className="text-[9px] font-black bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">bariéra {p.threshold}%</span>
                          {p.gatesParamId && (
                            <span className="text-[9px] font-black bg-brand-pink/10 text-brand-pink px-2 py-0.5 rounded-full">
                              gates → {allParams.find(x => x.id === p.gatesParamId)?.name ?? "?"}
                            </span>
                          )}
                        </div>
                        {p.description && <p className="text-[10px] text-gray-400 mt-1">{p.description}</p>}
                      </div>
                      <div className="flex items-center gap-2 ml-3">
                        {(() => {
                          const res = p.results.find(r => r.quarter === curQ && r.year === curY)
                          const ach = res && res.target > 0 ? Math.min(1.5, res.actual / res.target) : null
                          const met = ach !== null ? ach >= p.threshold / 100 : null
                          return met !== null ? (
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${met ? "bg-brand-green/10 text-brand-green" : "bg-brand-pink/10 text-brand-pink"}`}>
                              {ach !== null ? `${Math.round(ach * 100)}%` : "—"} {met ? "✓" : "✗ bariéra"}
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
                                  <div className="text-[10px] text-gray-400">
                                    <p>Skutečnost: <span className="font-black text-gray-700">{fmt(r.actual)}</span></p>
                                    <p>Cíl: {fmt(r.target)}</p>
                                    <div className="flex items-center justify-between mt-1">
                                      <p className="text-[9px] text-brand-green">🔒 Uzavřeno</p>
                                      {isAdmin && (
                                        <form action={unlockQuarter.bind(null, p.id, q, curY)}>
                                          <button type="submit" className="text-[8px] font-black text-gray-400 hover:text-brand-pink transition-colors uppercase tracking-wider">🔓 Odemknout</button>
                                        </form>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="space-y-1.5">
                                    <div>
                                      <p className="text-[8px] font-black text-gray-400 uppercase tracking-wider mb-0.5">Skutečnost</p>
                                      <input name="actual" type="number" defaultValue={r?.actual ?? 0} step="any"
                                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-bold text-gray-900 outline-none focus:border-brand-cyan" />
                                    </div>
                                    <div>
                                      <p className="text-[8px] font-black text-gray-400 uppercase tracking-wider mb-0.5">Cíl</p>
                                      <input name="target" type="number" defaultValue={r?.target ?? 0} step="any"
                                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-bold text-gray-900 outline-none focus:border-brand-cyan" />
                                    </div>
                                    <input name="note" placeholder="Poznámka" defaultValue={r?.note ?? ""}
                                      className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-[10px] text-gray-600 outline-none focus:border-brand-cyan" />
                                    <div className="flex gap-1">
                                      <button type="submit" className="flex-1 bg-brand-cyan text-brand-navy py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider hover:bg-brand-pink hover:text-white transition-all">Uložit</button>
                                      {r && isAdmin && (
                                        <form action={lockQuarter.bind(null, p.id, q, curY)}>
                                          <button type="submit" className="bg-gray-100 text-gray-500 px-2 py-1.5 rounded-lg text-[9px] font-black hover:bg-brand-navy hover:text-white transition-all" title="Uzavřít kvartál">🔒</button>
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

                const weightBadge = (params: PerfParamRow[]) => {
                  const total = params.reduce((s, p) => s + p.weight, 0)
                  return <p className={`text-[10px] text-right mt-2 font-black ${total === 100 ? "text-brand-green" : "text-brand-pink"}`}>Váha: {total}% {total !== 100 ? "(doporučeno 100%)" : "✓"}</p>
                }

                return (
                  <div className="space-y-6">
                    {/* FIREMNÍ — platí všem */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-[10px] font-black text-gray-700 uppercase tracking-widest">Firemní</span>
                        <span className="text-[9px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">platí všem manažerům</span>
                      </div>
                      <div className="space-y-3">{companyParams.map(renderParamCard)}</div>
                      {companyParams.length > 0 && weightBadge(companyParams)}
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
                          {dps.length > 0 && weightBadge(dps)}
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

            {/* POP – Valuační základ */}
            <section className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
              <h2 className="text-[11px] font-black text-brand-cyan uppercase tracking-[0.3em] italic mb-1">POP – Valuační základ</h2>
              <p className="text-[11px] text-gray-400 mb-5">Hodnota firmy = Aktuální EBITDA × (Základní koeficient + Boostery). Slouží jako základ pro výpočet zisku z podílových plánů.</p>

              <form action={upsertVestingBase.bind(null, sel.id)} className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <div>
                  <Label>Aktuální EBITDA (CZK)</Label>
                  <input name="currentEbitda" type="number" step="1" defaultValue={vestingBase?.currentEbitda ?? 0} className={inputCls} />
                </div>
                <div>
                  <Label>Základní koeficient</Label>
                  <input name="baseMultiplier" type="number" step="0.1" defaultValue={vestingBase?.baseMultiplier ?? 6.0} className={inputCls} />
                </div>
                <div className="flex flex-col justify-end">
                  <button type="submit" className={btnCyan + " w-full"}>Uložit</button>
                  {vestingBase && (
                    <p className="text-[10px] text-gray-400 mt-2 text-center">
                      Základ: {fmt(vestingBase.currentEbitda * vestingBase.baseMultiplier)}
                    </p>
                  )}
                </div>
              </form>

              {/* Strategické boostery */}
              <div className="pt-4 border-t border-gray-100">
                <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">Strategické boostery</h3>
                <p className="text-[10px] text-gray-400 mb-4">Každý splněný booster navyšuje valuační koeficient. Celkový koeficient = {vestingBase?.baseMultiplier ?? 6} + {boosters.filter(b => b.isAchieved).reduce((s, b) => s + b.multiplierBoost, 0).toFixed(1)} (boostery) = <span className="font-black text-brand-green">{((vestingBase?.baseMultiplier ?? 6) + boosters.filter(b => b.isAchieved).reduce((s, b) => s + b.multiplierBoost, 0)).toFixed(1)}×</span></p>

                {boosters.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {boosters.map(b => (
                      <div key={b.id} className={`flex items-start gap-3 p-4 rounded-xl border ${b.isAchieved ? "bg-brand-green/5 border-brand-green/20" : "bg-gray-50 border-gray-200"}`}>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-sm text-gray-900">{b.name}</span>
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${b.isAchieved ? "bg-brand-green/20 text-brand-green" : "bg-gray-100 text-gray-500"}`}>
                              +{b.multiplierBoost}× {b.isAchieved ? "✓ Splněno" : "Čeká"}
                            </span>
                          </div>
                          {b.description && <p className="text-[10px] text-gray-400 mt-1">{b.description}</p>}
                        </div>
                        <div className="flex gap-2">
                          <form action={toggleBooster.bind(null, b.id, b.isAchieved)}>
                            <button className={`text-[9px] font-black px-3 py-1.5 rounded-lg uppercase tracking-wider transition-all border ${b.isAchieved ? "border-brand-green/30 text-brand-green hover:bg-brand-green/10" : "border-gray-200 text-gray-400 hover:border-brand-cyan hover:text-brand-cyan"}`}>
                              {b.isAchieved ? "Zrušit" : "Splněno"}
                            </button>
                          </form>
                          <form action={deleteBooster.bind(null, b.id)}>
                            <button className="text-gray-300 hover:text-brand-pink p-1.5 rounded-lg transition-colors">
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                            </button>
                          </form>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <form action={createBooster.bind(null, sel.id)} className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-gray-50 rounded-2xl border border-dashed border-gray-300">
                  <div className="sm:col-span-1">
                    <Label>Název boosteru</Label>
                    <input name="name" placeholder="např. Technologický rozvoj" required className={inputCls} />
                  </div>
                  <div className="sm:col-span-1">
                    <Label>Popis podmínek</Label>
                    <input name="description" placeholder="Co musí nastat..." className={inputCls} />
                  </div>
                  <div>
                    <Label>Navýšení koeficientu (+×)</Label>
                    <div className="flex gap-2">
                      <input name="multiplierBoost" type="number" step="0.1" placeholder="0.5" required className={inputCls} />
                      <button type="submit" className={btnCyan}>+</button>
                    </div>
                  </div>
                </form>
              </div>
            </section>

            {/* Uzavření kvartálu */}
            {isAdmin && (
              <section className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
                <h2 className="text-[11px] font-black text-brand-cyan uppercase tracking-[0.3em] italic mb-1">Uzavření kvartálu</h2>
                <p className="text-[11px] text-gray-400 mb-5">
                  Uzavřením kvartálu se vytvoří historický snapshot pro každého manažera (bonus + POP hodnota)
                  a výsledky se zamknou. Akci nelze vzít zpět.
                </p>
                <div className="flex flex-wrap gap-3">
                  {[1, 2, 3, 4].map(q => {
                    const isCurrentQ = q === curQ
                    return (
                      <form key={q} action={closeQuarter.bind(null, sel.id, q, curY)}>
                        <button
                          type="submit"
                          className={`px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                            isCurrentQ
                              ? "bg-brand-navy text-white border-brand-navy hover:bg-brand-pink hover:border-brand-pink"
                              : "bg-gray-50 text-gray-400 border-gray-200 hover:border-brand-navy hover:text-brand-navy"
                          }`}
                        >
                          🔒 Uzavřít Q{q} {curY}
                          {isCurrentQ && <span className="ml-1 text-brand-cyan/80">(aktuální)</span>}
                        </button>
                      </form>
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
                        <div><Label>Základní plat / měs. (CZK)</Label><input name="baseSalary" type="number" defaultValue={compensation?.baseSalary ?? 0} className={inputCls} /></div>
                        <div><Label>Roční cílový bonus (CZK)</Label><input name="targetBonusAnnual" type="number" defaultValue={compensation?.targetBonusAnnual ?? 0} className={inputCls} /></div>
                        <div>
                          <Label>KPI váha (% z bonusu)</Label>
                          <input name="kpiWeight" type="number" step="0.1" min="0" max="100"
                            defaultValue={(compensation as { kpiWeight?: number })?.kpiWeight ?? 0} className={inputCls} />
                          <p className="text-[9px] text-gray-400 mt-1">Kolik % z cílového bonusu tvoří KPI složka. 0 = KPI bonus nepočítá.</p>
                        </div>
                      </div>

                      <button type="submit" className={btnCyan + " w-full"}>Uložit smluvní podmínky</button>
                    </form>
                  </section>

                  {/* VÝKONNOSTNÍ PARAMETRY — přepsání vah */}
                  {sel && (() => {
                    const selUDivId = (selU as unknown as { divisionId: string | null }).divisionId
                    const managerParams = allParams.filter(p => !p.divisionId || p.divisionId === selUDivId)
                    if (managerParams.length === 0) return null
                    const totalOverride = managerParams.reduce((s, p) => s + (weightMap.get(p.id) ?? p.weight), 0)
                    const hasAnyOverride = managerParams.some(p => weightMap.has(p.id))
                    return (
                      <section className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <h3 className="text-[11px] font-black text-brand-cyan uppercase tracking-[0.3em] italic">Výkonnostní parametry</h3>
                            <p className="text-[11px] text-gray-400 mt-0.5">Přepište váhu pro tohoto manažera. Prázdné = výchozí globální hodnota.</p>
                          </div>
                          <span className={`text-[9px] font-black px-3 py-1 rounded-full flex-shrink-0 ${Math.abs(totalOverride - 100) < 0.1 ? "bg-brand-green/10 text-brand-green" : "bg-brand-pink/10 text-brand-pink"}`}>
                            Celkem: {totalOverride.toFixed(1)}%
                          </span>
                        </div>
                        <div className="space-y-2">
                          {managerParams.map(p => {
                            const globalW   = p.weight
                            const overrideW = weightMap.get(p.id)
                            const effective = overrideW ?? globalW
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
                                  <span className="text-[10px] text-gray-400">
                                    Globální: {globalW}%
                                    {overrideW !== undefined && <span className="text-brand-cyan font-black"> → přepsáno na {overrideW}%</span>}
                                  </span>
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
                                    <button type="submit" className="text-[9px] font-black text-gray-300 hover:text-brand-pink transition-colors px-2 py-1.5" title="Obnovit globální váhu">
                                      ↺
                                    </button>
                                  </form>
                                )}
                              </div>
                            )
                          })}
                        </div>
                        {hasAnyOverride && Math.abs(totalOverride - 100) > 0.1 && (
                          <p className="text-[10px] text-brand-pink font-black mt-3 text-right">
                            Váhy nesumují na 100 % — bonus bude vypočten s neúplnou škálou
                          </p>
                        )}
                      </section>
                    )
                  })()}

                  {/* KPI ÚKOLY */}
                  <section className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
                    <h3 className="text-[11px] font-black text-brand-cyan uppercase tracking-[0.3em] italic mb-5">Individuální KPI úkoly</h3>

                    <form action={adminAddKpiTask.bind(null, selU.id, sel.id)} className="space-y-2 mb-5 bg-gray-50 p-3 rounded-xl border border-gray-200">
                      <div className="flex gap-3">
                        <div className="flex-1 space-y-2">
                          <input name="name" placeholder="Název úkolu..." required className="w-full bg-transparent px-3 py-2 outline-none font-bold text-sm text-gray-900 placeholder:text-gray-400" />
                          <input name="description" placeholder="Popis a podmínky splnění..." className="w-full bg-transparent px-3 py-1 outline-none text-[11px] text-gray-500 placeholder:text-gray-300" />
                        </div>
                        <div className="flex flex-col gap-2 items-end">
                          <input name="weight" type="number" step="1" min="0" max="100" placeholder="%" required
                            className="w-16 bg-white rounded-lg px-2 py-2 text-center font-black text-brand-cyan border-2 border-gray-200 focus:border-brand-cyan outline-none text-sm" />
                          <button type="submit" className={btnCyan}>+</button>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 pt-1 border-t border-gray-200">
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Typ:</span>
                        {[["BOOLEAN","Splněno/Ne"],["PERCENT","% plnění"],["AMOUNT","Částka"]].map(([val, label]) => (
                          <label key={val} className="flex items-center gap-1 cursor-pointer">
                            <input type="radio" name="taskType" value={val} defaultChecked={val === "BOOLEAN"} className="accent-brand-cyan" />
                            <span className="text-[10px] font-bold text-gray-600">{label}</span>
                          </label>
                        ))}
                        <input name="targetAmount" type="number" step="1" min="0" placeholder="Cíl (CZK)"
                          className="ml-auto w-28 bg-white rounded-lg px-2 py-1 text-sm font-bold text-gray-700 border border-gray-200 focus:border-brand-cyan outline-none placeholder:text-gray-300" />
                        <span className="text-[9px] text-gray-400">← jen pro typ Částka</span>
                      </div>
                    </form>

                    {(() => {
                      type KpiExt = { id: string; name: string; description: string | null; weight: number; isCompleted: boolean; taskType: string; completionPct: number | null; targetAmount: number | null; actualAmount: number | null }
                      const tasks = kpiTasks as unknown as KpiExt[]
                      if (tasks.length === 0) return (
                        <p className="text-center text-gray-300 py-6 text-sm italic border-2 border-dashed border-gray-100 rounded-xl">Žádné KPI úkoly.</p>
                      )
                      const typeLabel: Record<string, string> = { BOOLEAN: "Splněno/Ne", PERCENT: "% plnění", AMOUNT: "Částka" }
                      return (
                        <div className="space-y-2">
                          {tasks.map(t => {
                            const norm = t.taskType === "PERCENT" ? Math.min(1, (t.completionPct ?? 0) / 100)
                              : t.taskType === "AMOUNT" && (t.targetAmount ?? 0) > 0 ? Math.min(1, (t.actualAmount ?? 0) / t.targetAmount!)
                              : t.isCompleted ? 1 : 0
                            return (
                              <div key={t.id} className={`px-4 py-3 rounded-xl border ${norm > 0 ? "bg-brand-green/5 border-brand-green/20" : "bg-gray-50 border-gray-200"}`}>
                                <div className="flex items-start gap-3">
                                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${norm >= 1 ? "bg-brand-green" : norm > 0 ? "bg-brand-cyan" : "bg-gray-300"}`} />
                                  <div className="flex-1 min-w-0">
                                    <p className={`font-black text-sm ${norm >= 1 ? "text-brand-green italic" : "text-gray-900"}`}>{t.name}</p>
                                    {t.description && <p className="text-[10px] text-gray-400 mt-0.5">{t.description}</p>}
                                  </div>
                                  <span className="text-[9px] font-black text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200 flex-shrink-0">{typeLabel[t.taskType] ?? t.taskType}</span>
                                  <span className="text-[9px] font-black text-brand-cyan bg-white px-2 py-0.5 rounded-full border border-gray-200 flex-shrink-0">{t.weight}%</span>
                                  <form action={adminDeleteKpiTask.bind(null, t.id)}>
                                    <button className="text-gray-300 hover:text-brand-pink p-1 rounded transition-colors flex-shrink-0">
                                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                                    </button>
                                  </form>
                                </div>
                                {t.taskType === "BOOLEAN" && (
                                  <form action={adminToggleKpiTask.bind(null, t.id, t.isCompleted)} className="mt-2">
                                    <button type="submit" className={`text-[9px] font-black px-3 py-1.5 rounded-xl border transition-all ${t.isCompleted ? "border-brand-green/30 text-brand-green hover:bg-brand-green/10" : "border-gray-200 text-gray-400 hover:border-brand-cyan hover:text-brand-cyan"}`}>
                                      {t.isCompleted ? "✓ Splněno" : "Označit jako splněno"}
                                    </button>
                                  </form>
                                )}
                                {t.taskType === "PERCENT" && (
                                  <form action={updateKpiTaskCompletion.bind(null, t.id)} className="mt-2 flex items-center gap-2">
                                    <input type="hidden" name="taskType" value="PERCENT" />
                                    <input name="completionPct" type="number" min="0" max="100" step="1" defaultValue={t.completionPct ?? 0}
                                      className="w-20 bg-white border border-gray-200 rounded-lg px-2 py-1 text-sm font-bold text-gray-900 outline-none focus:border-brand-cyan" />
                                    <span className="text-[10px] text-gray-400 font-bold">%</span>
                                    <button type="submit" className="text-[9px] font-black px-3 py-1.5 rounded-xl border border-brand-cyan/30 text-brand-cyan hover:bg-brand-cyan/10 transition-all">Uložit</button>
                                  </form>
                                )}
                                {t.taskType === "AMOUNT" && (
                                  <form action={updateKpiTaskCompletion.bind(null, t.id)} className="mt-2 flex items-center gap-2 flex-wrap">
                                    <input type="hidden" name="taskType" value="AMOUNT" />
                                    <span className="text-[10px] text-gray-400">Cíl: <span className="font-black text-gray-700">{fmt(t.targetAmount ?? 0)}</span></span>
                                    <span className="text-gray-300">|</span>
                                    <span className="text-[10px] text-gray-400">Skutečnost:</span>
                                    <input name="actualAmount" type="number" min="0" step="1" defaultValue={t.actualAmount ?? 0}
                                      className="w-28 bg-white border border-gray-200 rounded-lg px-2 py-1 text-sm font-bold text-gray-900 outline-none focus:border-brand-cyan" />
                                    <button type="submit" className="text-[9px] font-black px-3 py-1.5 rounded-xl border border-brand-cyan/30 text-brand-cyan hover:bg-brand-cyan/10 transition-all">Uložit</button>
                                  </form>
                                )}
                              </div>
                            )
                          })}
                          <p className={`text-[10px] text-right pt-1 font-black ${tasks.reduce((s, t) => s + t.weight, 0) === 100 ? "text-brand-green" : "text-brand-pink"}`}>
                            Váha celkem: {tasks.reduce((s, t) => s + t.weight, 0)}%
                            {tasks.reduce((s, t) => s + t.weight, 0) !== 100 && " (doporučeno 100%)"}
                          </p>
                        </div>
                      )
                    })()}
                  </section>

                  {/* PHANTOM OPTION GRANTY */}
                  <section className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
                    <details>
                      <summary className="cursor-pointer px-6 py-4 flex items-center justify-between list-none select-none hover:bg-gray-50 transition-colors">
                        <div className="flex items-center gap-3">
                          <span className="text-[11px] font-black text-brand-pink uppercase tracking-[0.3em] italic">Phantom Option Granty</span>
                          {phantomList.length > 0 && (
                            <span className="text-[9px] font-black bg-brand-pink/10 text-brand-pink px-2 py-0.5 rounded-full">{phantomList.length} grant{phantomList.length > 1 ? "y" : ""}</span>
                          )}
                        </div>
                        <span className="text-gray-300 text-xs">▼</span>
                      </summary>

                      <div className="px-6 pb-6 pt-2 space-y-4 border-t border-gray-100">
                        <p className="text-[11px] text-gray-400">Každý grant je samostatný POP s vlastním názvem, podílem a vestingem. Manažer může mít více grantů z různých let.</p>

                        {/* Globální boostery — pro referenci */}
                        {boosters.length > 0 && (
                          <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Globální boostery ovlivňující multiplikátor</p>
                            <div className="flex flex-wrap gap-2">
                              {boosters.map((b: { id: string; name: string; multiplierBoost: number; isAchieved: boolean }) => (
                                <span key={b.id} className={`text-[9px] font-black px-2.5 py-1 rounded-full border ${b.isAchieved ? "bg-brand-green/10 text-brand-green border-brand-green/20" : "bg-gray-100 text-gray-400 border-gray-200"}`}>
                                  {b.isAchieved ? "✓" : "○"} {b.name} +{b.multiplierBoost}×
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Existující granty */}
                        {phantomList.map(g => (
                          <div key={g.id} className="border border-gray-200 rounded-2xl overflow-hidden">
                            <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                              <span className="font-black text-sm text-gray-900">{g.name}</span>
                              <div className="flex items-center gap-2">
                                <span className={`text-[8px] font-black px-2 py-0.5 rounded-full ${g.isActive ? "bg-brand-green/10 text-brand-green" : "bg-gray-100 text-gray-400"}`}>
                                  {g.isActive ? "Aktivní" : "Neaktivní"}
                                </span>
                                <form action={adminDeletePhantomGrant.bind(null, g.id)}>
                                  <button className="text-gray-300 hover:text-brand-pink transition-colors p-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                                  </button>
                                </form>
                              </div>
                            </div>
                            <form action={adminUpdatePhantomGrant.bind(null, g.id)} className="p-4 grid grid-cols-2 gap-3">
                              <div className="col-span-2"><Label>Název grantu</Label>
                                <input name="name" defaultValue={g.name} required className={inputCls} />
                              </div>
                              <div><Label>Podíl (%)</Label>
                                <input name="sharePercent" type="number" step="0.01" defaultValue={g.sharePercent} className={inputCls} />
                              </div>
                              <div><Label>EBITDA při vstupu (CZK)</Label>
                                <input name="grantEbitda" type="number" defaultValue={g.grantEbitda} className={inputCls} />
                              </div>
                              <div><Label>Multiplier při vstupu</Label>
                                <input name="grantMultiplier" type="number" step="0.1" defaultValue={g.grantMultiplier} className={inputCls} />
                              </div>
                              <div><Label>Datum grantu</Label>
                                <input name="grantDate" type="date" defaultValue={new Date(g.grantDate).toISOString().split('T')[0]} className={inputCls} />
                              </div>
                              <div><Label>Délka vestingu (roky)</Label>
                                <input name="vestingYears" type="number" defaultValue={g.vestingYears} className={inputCls} />
                              </div>
                              <div><Label>Výplata ročně (%)</Label>
                                <input name="vestingPercent" type="number" step="0.1" defaultValue={g.vestingPercent} className={inputCls} />
                              </div>
                              <div className="col-span-2">
                                <button type="submit" className={btnCyan + " w-full"}>Uložit grant</button>
                              </div>
                            </form>
                          </div>
                        ))}

                        {/* Přidat nový grant */}
                        <details className="group">
                          <summary className="cursor-pointer text-[10px] font-black text-brand-pink uppercase tracking-widest hover:underline list-none">+ Přidat nový grant</summary>
                          <form action={adminAddPhantomGrant.bind(null, selU.id)} className="mt-3 grid grid-cols-2 gap-3 p-4 bg-gray-50 rounded-2xl border border-gray-200">
                            <div className="col-span-2"><Label>Název grantu</Label>
                              <input name="name" placeholder="např. POP 2025" required className={inputCls} />
                            </div>
                            <div><Label>Podíl (%)</Label>
                              <input name="sharePercent" type="number" step="0.01" placeholder="0.5" className={inputCls} />
                            </div>
                            <div><Label>EBITDA při vstupu (CZK)</Label>
                              <input name="grantEbitda" type="number" placeholder="35000000" className={inputCls} />
                            </div>
                            <div><Label>Multiplier při vstupu</Label>
                              <input name="grantMultiplier" type="number" step="0.1" placeholder="8" className={inputCls} />
                            </div>
                            <div><Label>Datum grantu</Label>
                              <input name="grantDate" type="date" defaultValue={new Date().toISOString().split('T')[0]} className={inputCls} />
                            </div>
                            <div><Label>Délka vestingu (roky)</Label>
                              <input name="vestingYears" type="number" defaultValue={4} className={inputCls} />
                            </div>
                            <div><Label>Výplata ročně (%)</Label>
                              <input name="vestingPercent" type="number" step="0.1" defaultValue={25} className={inputCls} />
                            </div>
                            <div className="col-span-2">
                              <button type="submit" className={btnCyan + " w-full"}>Přidat grant</button>
                            </div>
                          </form>
                        </details>
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
