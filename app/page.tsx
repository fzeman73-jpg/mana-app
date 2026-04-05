import { auth, signIn, signOut } from "@/auth"
import { prisma } from "@/lib/db"
import { loginWithCredentials, adminToggleKpiTask, updateKpiTaskCompletion } from "@/lib/actions"
import { calcBonus, calcPOP, calcVestingSchedule, currentQuarter } from "@/lib/calculator"
import Image from "next/image"

const fmt = (n: number) => Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 }).format(Math.round(n))

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; y?: string; periodId?: string }>
}) {
  const session = await auth()

  // ── LOGIN ────────────────────────────────────────────────────────────────
  if (!session?.user?.email) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6 relative overflow-hidden">
        <div className="absolute -left-40 -top-40 w-[600px] h-[600px] bg-brand-cyan rounded-full opacity-5 blur-[150px]" />
        <div className="absolute right-0 bottom-0 w-[400px] h-[400px] bg-brand-pink rounded-full opacity-5 blur-[120px]" />
        <div className="text-center p-12 border border-gray-200 rounded-[3rem] bg-white shadow-2xl max-w-md w-full border-b-4 border-b-brand-cyan relative z-10">
          <div className="flex justify-center mb-10 mt-4">
            <Image src="/algotech-logo.png" alt="Algotech Logo" width={280} height={84} priority className="opacity-90" />
          </div>
          <h1 className="text-4xl font-black mb-2 tracking-tighter italic uppercase text-gray-900">
            Performance <span className="text-brand-cyan">Cockpit</span>
          </h1>
          <p className="text-gray-400 mb-10 font-medium italic tracking-wide text-base underline decoration-brand-cyan/40 underline-offset-8">
            Sledování výkonnostních pobídek
          </p>
          <form action={loginWithCredentials} className="space-y-3 mb-6">
            <input name="email" type="email" placeholder="Email" required
              className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-4 font-bold text-base outline-none focus:ring-2 ring-brand-cyan transition-all placeholder:text-gray-400 text-gray-900" />
            <input name="password" type="password" placeholder="Heslo" required
              className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-4 font-bold text-base outline-none focus:ring-2 ring-brand-cyan transition-all placeholder:text-gray-400 text-gray-900" />
            <button type="submit" className="w-full bg-brand-navy text-white font-black py-4 px-8 rounded-2xl hover:bg-brand-cyan hover:text-brand-navy transition-all shadow-sm active:scale-95 uppercase tracking-[0.2em] text-sm">
              Přihlásit se
            </button>
          </form>
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs font-black text-gray-400 uppercase tracking-widest">nebo</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
          <form action={async () => { "use server"; await signIn("google") }}>
            <button className="w-full bg-brand-cyan text-brand-navy font-black py-4 px-8 rounded-2xl hover:bg-brand-pink hover:text-white transition-all shadow-sm active:scale-95 uppercase tracking-[0.2em] text-sm">
              Vstoupit přes Google
            </button>
          </form>
        </div>
      </main>
    )
  }

  // ── DATA ─────────────────────────────────────────────────────────────────
  const dbUser = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!dbUser) return <div className="p-8 text-center text-gray-400">Účet nenalezen.</div>

  const isAdmin   = dbUser.role === "ADMIN"
  const isManager = dbUser.role === "MANAGER"
  const canEdit   = isAdmin || isManager

  const { y, periodId: pidParam } = await searchParams

  const allPeriods = await prisma.period.findMany({ orderBy: { startDate: "desc" } })
  const period = pidParam
    ? (allPeriods.find(p => p.id === pidParam) ?? allPeriods.find(p => p.isActive) ?? null)
    : (allPeriods.find(p => p.isActive) ?? null)

  const [compensation, kpiTasks, perfParams, snapshots] = period
    ? await Promise.all([
        prisma.compensation.findUnique({ where: { userId_periodId: { userId: dbUser.id, periodId: period.id } } }),
        prisma.kpiTask.findMany({ where: { userId: dbUser.id, periodId: period.id }, orderBy: { name: "asc" } }),
        prisma.performanceParameter.findMany({
          where: {
            periodId: period.id,
            OR: [
              { divisionId: null },
              ...(dbUser.divisionId ? [{ divisionId: dbUser.divisionId }] : []),
            ],
          },
          include: { results: { orderBy: [{ year: "asc" }, { quarter: "asc" }] } },
          orderBy: { sortOrder: "asc" },
        }),
        prisma.quarterlySnapshot.findMany({
          where: { userId: dbUser.id, periodId: period.id },
          orderBy: [{ year: "asc" }, { quarter: "asc" }],
        }),
      ])
    : [null, [], [], []]

  // PopAssignments
  const popAssignments = await prisma.popAssignment.findMany({
    where:   { userId: dbUser.id },
    include: {
      payments: { orderBy: { vestingYear: "asc" } },
      popPlan:  { include: { boosters: true, yearData: { orderBy: { year: "asc" } } } },
    },
  })

  const { quarter: nowQ, year: nowY } = currentQuarter()
  const curQ = nowQ
  const curY = y ? parseInt(y) : nowY

  const availableYears: number[] = Array.from(new Set(perfParams.flatMap(p => p.results.map(r => Number(r.year))))).sort()

  // Přepsání vah
  const weightOverrides = period ? await prisma.parameterWeight.findMany({ where: { userId: dbUser.id } }) : []
  const weightMap = new Map(weightOverrides.map(r => [r.parameterId, r.weight]))

  type KpiTaskRow = typeof kpiTasks[number]
  const kpiNorm = kpiTasks.map((t: KpiTaskRow) => {
    if (t.taskType === "PERCENT") return Math.min(1, (t.completionPct ?? 0) / 100)
    if (t.taskType === "AMOUNT" && (t.targetAmount ?? 0) > 0) return Math.min(1, (t.actualAmount ?? 0) / t.targetAmount!)
    return t.isCompleted ? 1 : 0
  })

  // ── Výpočet bonusu pro každý kvartál roku (pro roční přehled) ─────────────
  const quarterCalcs = [1, 2, 3, 4].map(qn => {
    const inputs = perfParams.map(p => {
      const res = p.results.find(r => r.quarter === qn && r.year === curY)
      return {
        id: p.id, name: p.name,
        weight: weightMap.get(p.id) ?? p.weight,
        threshold: p.threshold, gatesParamId: p.gatesParamId,
        actual: res?.actual ?? 0, target: res?.target ?? 0,
      }
    })
    const snap = snapshots.find(s => s.quarter === qn && s.year === curY)
    const bonus = calcBonus(
      inputs,
      compensation?.targetBonusAnnual ?? 0,
      kpiTasks.map((t, i) => ({ weight: t.weight, completionPct: kpiNorm[i] })),
      compensation?.kpiWeight ?? 0
    )
    const hasData = inputs.some(p => p.actual > 0 || p.target > 0)
    return { quarter: qn, bonus, snap, hasData, inputs }
  })

  const yearBonusTotal = quarterCalcs.reduce((s, q) => s + (q.snap ? q.snap.bonusAmount : q.bonus.total), 0)

  // ── POP výpočty ────────────────────────────────────────────────────────────
  const popCalcs = popAssignments.map(a => {
    const latestYear = a.popPlan.yearData.at(-1)
    const effectiveGrantEbitda = a.grantEbitda > 0 ? a.grantEbitda : a.popPlan.grantEbitda
    const pop = latestYear ? calcPOP({
      sharePercent:     a.sharePercent,
      grantEbitda:      effectiveGrantEbitda,
      grantMultiplier:  a.popPlan.baseMultiplier,
      currentEbitda:    latestYear.currentEbitda,
      baseMultiplier:   a.popPlan.baseMultiplier,
      boosters:         a.popPlan.boosters,
      minGrowthPercent: a.popPlan.minGrowthPercent,
    }) : null
    const schedule = pop ? calcVestingSchedule({
      grossGain: pop.grossGain,
      granularity: a.popPlan.vestingGranularity as "YEARLY" | "QUARTERLY",
      vestingYears: a.popPlan.vestingYears,
      vestingPaymentDay: a.popPlan.vestingPaymentDay,
      vestingPaymentMonth: a.popPlan.vestingPaymentMonth,
      vestingQuarters: a.popPlan.vestingQuarters,
      grantYear: new Date(a.grantDate).getFullYear(),
    }) : []
    return { assignment: a, pop, schedule }
  })
  const totalPopGain = popCalcs.reduce((s, c) => s + (c.pop?.grossGain ?? 0), 0)

  const noData = !period || !compensation

  return (
    <div className="min-h-screen bg-gray-50 font-sans selection:bg-brand-cyan/20">

      {/* ── NAVBAR ─────────────────────────────────────────────────────────── */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
        <div className="px-4 sm:px-8 py-4 flex justify-between items-center">
          <a href="/"><Image src="/algotech-logo.png" alt="Algotech" width={175} height={52} className="object-contain" /></a>
          <div className="flex items-center gap-3 sm:gap-5">
            {(isAdmin || isManager) && (
              <a href="/admin/parameters" className="text-gray-400 hover:text-brand-cyan text-xs font-black uppercase tracking-widest transition-colors">
                Plány
              </a>
            )}
            {isAdmin && (
              <a href="/admin/reports" className="hidden sm:block text-gray-400 hover:text-brand-cyan text-xs font-black uppercase tracking-widest transition-colors">
                Reporty
              </a>
            )}
            {isAdmin && (
              <>
                <a href="/admin/pop" className="hidden sm:block text-gray-400 hover:text-brand-cyan text-xs font-black uppercase tracking-widest transition-colors">
                  POP
                </a>
                <a href="/admin" className="hidden sm:block bg-brand-cyan/10 text-brand-cyan border border-brand-cyan/30 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-brand-cyan hover:text-brand-navy transition-all">
                  Uživatelé
                </a>
              </>
            )}
            <div className="flex items-center gap-3">
              {session.user?.image && (
                <img src={session.user.image} className="w-9 h-9 rounded-full ring-2 ring-brand-cyan/20 hidden sm:block" referrerPolicy="no-referrer" alt="" />
              )}
              <div className="leading-none text-right hidden sm:block">
                <p className="text-sm font-black text-gray-900">{session.user?.name}</p>
                <p className="text-xs text-gray-400 uppercase tracking-wider mt-0.5">{dbUser.role === "ADMIN" ? "Admin" : dbUser.role === "MANAGER" ? "Manažer" : "Viewer"}</p>
              </div>
            </div>
            <a href="/settings" className="text-gray-400 hover:text-brand-cyan transition-colors text-xs font-black uppercase tracking-widest">
              Nastavení
            </a>
            <form action={async () => { "use server"; await signOut() }}>
              <button className="text-gray-400 hover:text-brand-pink transition-colors text-xs font-black uppercase tracking-widest">Odhlásit</button>
            </form>
          </div>
        </div>
        {/* Selektor období / roku / kvartálu */}
        <div className="border-t border-gray-100 px-4 sm:px-8 py-2.5 overflow-x-auto">
          <div className="flex items-center gap-2 min-w-max">
            {allPeriods.map(p => (
              <a key={p.id} href={`/?periodId=${p.id}&y=${nowY}&q=${nowQ}`}
                className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all border whitespace-nowrap ${p.id === period?.id ? "bg-brand-cyan text-brand-navy border-brand-cyan" : "border-gray-200 text-gray-400 hover:border-brand-cyan hover:text-brand-cyan"}`}>
                {p.name}{p.isActive && <span className="ml-1 opacity-60">●</span>}
              </a>
            ))}
            {allPeriods.length === 0 && (
              <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Žádné aktivní období</span>
            )}
            {period && availableYears.length > 1 && (
              <>
                <span className="w-px h-4 bg-gray-200 mx-1 flex-shrink-0" />
                {availableYears.map(yr => (
                  <a key={yr} href={`/?periodId=${period.id}&y=${yr}&q=${yr === curY ? curQ : 1}`}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all whitespace-nowrap ${yr === curY ? "bg-brand-navy text-white" : "text-gray-400 hover:text-brand-navy"}`}>
                    {yr}
                  </a>
                ))}
              </>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto py-10 px-6 space-y-8">

        {noData ? (
          <div className="bg-white rounded-[3rem] border border-gray-100 shadow-sm p-16 text-center">
            <p className="text-5xl mb-4">⚙️</p>
            <p className="font-black text-gray-400 text-base uppercase tracking-widest">
              {!period ? "Není aktivní žádné období." : "Vaše odměna zatím není nastavena."}
            </p>
            {isAdmin && <a href="/admin/parameters" className="inline-block mt-6 bg-brand-cyan text-brand-navy px-8 py-3 rounded-2xl font-black uppercase text-sm tracking-widest hover:bg-brand-pink hover:text-white transition-all">Nastavit parametry →</a>}
          </div>
        ) : (
          <>

            {/* ── BLOK 1: Roční přehled bonusů ─────────────────────────────── */}
            <section className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm p-8">
              <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                <div>
                  <h2 className="text-base font-black text-gray-900 uppercase tracking-widest">Roční přehled bonusů</h2>
                  <p className="text-sm text-gray-400 mt-0.5">Cílový bonus: {fmt(compensation?.targetBonusAnnual ?? 0)} / rok</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Celkem {curY}</p>
                  <p className="text-3xl font-black text-brand-navy">{fmt(yearBonusTotal)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {quarterCalcs.map(({ quarter: qn, bonus, snap, hasData, inputs: qInputs }) => {
                  const isCurrent  = qn === nowQ && curY === nowY
                  const isClosed   = !!snap
                  const displayBonus = isClosed ? snap!.bonusAmount : bonus.total
                  const quarterTarget = (compensation?.targetBonusAnnual ?? 0) / 4
                  const displayPct = quarterTarget > 0 ? Math.round(displayBonus / quarterTarget * 100) : 0

                  return (
                    <div key={qn}
                      className={`rounded-2xl border p-5 ${
                        isCurrent ? "border-brand-cyan ring-2 ring-brand-cyan/20 bg-brand-cyan/5"
                        : isClosed ? "bg-gray-50 border-gray-200"
                        : "border-gray-200"
                      }`}>

                      {/* Hlavička */}
                      <div className="flex items-center justify-between mb-4">
                        <span className={`text-sm font-black uppercase tracking-widest ${isCurrent ? "text-brand-cyan" : "text-gray-500"}`}>
                          Q{qn} {curY}
                        </span>
                        <span className={`text-xs font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          isClosed   ? "bg-gray-200 text-gray-500" :
                          isCurrent  ? "bg-brand-cyan/15 text-brand-cyan" :
                                       "bg-gray-100 text-gray-400"
                        }`}>
                          {isClosed ? "Uzavřen" : isCurrent ? "Aktuální" : "Otevřen"}
                        </span>
                      </div>

                      {/* Bonus */}
                      <p className={`text-2xl font-black ${isClosed ? "text-gray-700" : hasData ? "text-gray-900" : "text-gray-300"}`}>
                        {hasData || isClosed ? fmt(displayBonus) : "—"}
                      </p>
                      {quarterTarget > 0 && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          Cíl: <span className="font-black text-gray-600">{fmt(quarterTarget)}</span>
                        </p>
                      )}
                      {(hasData || isClosed) && quarterTarget > 0 && (
                        <>
                          <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${isClosed ? "bg-gray-400" : displayPct >= 100 ? "bg-brand-green" : "bg-brand-cyan"}`}
                              style={{ width: `${Math.min(150, displayPct)}%` }} />
                          </div>
                          <p className={`text-xs font-black mt-1 ${isClosed ? "text-gray-400" : displayPct >= 100 ? "text-brand-green" : "text-gray-500"}`}>
                            {displayPct}% z cíle
                          </p>
                        </>
                      )}

                      {/* Parametry */}
                      {qInputs.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
                          {qInputs.map(p => {
                            const ach = p.target > 0 ? Math.min(150, Math.round(p.actual / p.target * 100)) : null
                            return (
                              <div key={p.id} className="space-y-0.5">
                                <div className="flex justify-between items-baseline">
                                  <span className="text-xs font-black text-gray-600 truncate max-w-[60%]">{p.name}</span>
                                  <span className={`text-xs font-black flex-shrink-0 ml-1 ${ach === null ? "text-gray-300" : ach >= 100 ? "text-brand-green" : ach > 0 ? "text-brand-cyan" : "text-gray-300"}`}>
                                    {ach !== null ? `${ach}%` : "—"}
                                  </span>
                                </div>
                                {(p.actual > 0 || p.target > 0) && (
                                  <p className="text-[11px] text-gray-400">
                                    {fmt(p.actual)} <span className="text-gray-300">/</span> {fmt(p.target)}
                                  </p>
                                )}
                                <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${ach !== null && ach >= 100 ? "bg-brand-green" : "bg-brand-cyan/60"}`}
                                    style={{ width: `${Math.min(100, ach ?? 0)}%` }} />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {!hasData && !isClosed && (
                        <p className="text-xs text-gray-300 mt-3">Výsledky nejsou zadány</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>

            {/* ── BLOK 2: KPI úkoly ────────────────────────────────────────── */}
            <section className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
              <h2 className="text-base font-black text-gray-900 uppercase tracking-widest mb-6">KPI Úkoly</h2>
              {kpiTasks.length === 0 ? (
                <p className="text-gray-300 text-sm italic text-center py-10">Žádné KPI úkoly nejsou zadány.</p>
              ) : (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map(q => {
                    const qTasks = kpiTasks.filter((t: KpiTaskRow) => (t.quarter ?? 1) === q)
                    const qNorms = qTasks.map((t: KpiTaskRow) => {
                      if (t.taskType === "PERCENT") return Math.min(1, (t.completionPct ?? 0) / 100)
                      if (t.taskType === "AMOUNT" && (t.targetAmount ?? 0) > 0) return Math.min(1, (t.actualAmount ?? 0) / t.targetAmount!)
                      return t.isCompleted ? 1 : 0
                    })
                    const qTotalW   = qTasks.reduce((s: number, t: KpiTaskRow) => s + t.weight, 0)
                    const qWeighted = qTasks.reduce((s: number, t: KpiTaskRow, i: number) => s + t.weight * qNorms[i], 0)
                    const qAch      = qTotalW > 0 ? qWeighted / qTotalW : 0
                    const qPct      = Math.round(qAch * 100)
                    return (
                      <details key={q} open={q === curQ} className="border border-gray-100 rounded-2xl overflow-hidden">
                        <summary className="cursor-pointer list-none select-none px-6 py-4 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-black text-gray-700 uppercase tracking-wider">Q{q} {curY}</span>
                            <span className="text-[9px] font-black text-gray-400">{qTasks.length} úkol{qTasks.length > 1 ? "y" : ""}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${qPct >= 100 ? "bg-brand-green" : qPct > 0 ? "bg-brand-cyan" : "bg-gray-300"}`} style={{ width: `${qPct}%` }} />
                            </div>
                            <span className={`text-xs font-black ${qPct >= 100 ? "text-brand-green" : qPct > 0 ? "text-brand-cyan" : "text-gray-400"}`}>{qPct}%</span>
                          </div>
                        </summary>
                        <div className="px-6 py-4 space-y-3">
                          {qTasks.map((t: KpiTaskRow, i: number) => {
                            const norm       = qNorms[i]
                            const pctDisplay = Math.round(norm * 100)
                            const isGreen    = norm >= 1
                            return (
                              <div key={t.id} className={`rounded-2xl border overflow-hidden ${isGreen ? "border-brand-green/20" : norm > 0 ? "border-brand-cyan/20" : "border-gray-200"}`}>
                                {/* Hlavička úkolu */}
                                <div className={`px-5 py-4 ${isGreen ? "bg-brand-green/5" : norm > 0 ? "bg-brand-cyan/5" : "bg-gray-50"}`}>
                                  <div className="flex items-start gap-3">
                                    <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${isGreen ? "bg-brand-green" : norm > 0 ? "bg-brand-cyan" : "bg-gray-300"}`} />
                                    <div className="flex-1 min-w-0">
                                      <p className={`font-black text-base ${isGreen ? "text-brand-green" : "text-gray-900"}`}>{t.name}</p>
                                      {t.description && <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>}
                                    </div>
                                    <span className="text-xs font-black text-brand-cyan bg-white px-2 py-1 rounded-full border border-gray-200 flex-shrink-0">{t.weight}%</span>
                                    <span className={`text-xs font-black px-2 py-1 rounded-full flex-shrink-0 ${isGreen ? "bg-brand-green/20 text-brand-green" : norm > 0 ? "bg-brand-cyan/10 text-brand-cyan" : "bg-gray-100 text-gray-400"}`}>
                                      {pctDisplay}%
                                    </span>
                                  </div>
                                  {/* Progress bar */}
                                  {t.taskType !== "BOOLEAN" && (
                                    <div className="mt-3 h-1.5 bg-white/60 rounded-full overflow-hidden border border-gray-100">
                                      <div className={`h-full rounded-full transition-all ${isGreen ? "bg-brand-green" : "bg-brand-cyan"}`} style={{ width: `${pctDisplay}%` }} />
                                    </div>
                                  )}
                                </div>
                                {/* Detailní zadání */}
                                {t.assignmentDetail && (
                                  <div className="px-5 py-3 border-t border-gray-100 bg-white">
                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Detailní zadání</p>
                                    <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{t.assignmentDetail}</p>
                                  </div>
                                )}
                                {/* Vyhodnocení */}
                                {t.evaluationNote && (
                                  <div className="px-5 py-3 border-t border-gray-100 bg-brand-cyan/5">
                                    <p className="text-[9px] font-black text-brand-cyan uppercase tracking-widest mb-1">Vyhodnocení</p>
                                    <p className="text-xs text-gray-700 italic">{t.evaluationNote}</p>
                                  </div>
                                )}
                                {/* Akce (canEdit) */}
                                {canEdit && (
                                  <div className="px-5 py-3 border-t border-gray-100 bg-white">
                                    {t.taskType === "BOOLEAN" && (
                                      <form action={adminToggleKpiTask.bind(null, t.id, t.isCompleted)} className="space-y-2">
                                        <textarea name="evaluationNote" placeholder="Komentář k vyhodnocení..." defaultValue={t.evaluationNote ?? ""} rows={2}
                                          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-700 outline-none focus:border-brand-cyan resize-none placeholder:text-gray-300" />
                                        <button type="submit" className={`text-xs font-black px-4 py-2 rounded-xl border transition-all ${t.isCompleted ? "border-brand-green/30 text-brand-green hover:bg-brand-green/10" : "border-gray-200 text-gray-400 hover:border-brand-cyan hover:text-brand-cyan"}`}>
                                          {t.isCompleted ? "✓ Splněno — klikem odvolat" : "Označit jako splněno"}
                                        </button>
                                      </form>
                                    )}
                                    {t.taskType === "PERCENT" && (
                                      <form action={updateKpiTaskCompletion.bind(null, t.id)} className="space-y-2">
                                        <input type="hidden" name="taskType" value="PERCENT" />
                                        <div className="flex items-center gap-2">
                                          <input name="completionPct" type="number" min="0" max="100" step="1" defaultValue={t.completionPct ?? 0}
                                            className="w-20 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-bold text-gray-900 outline-none focus:border-brand-cyan" />
                                          <span className="text-sm text-gray-400 font-bold">%</span>
                                          <button type="submit" className="text-xs font-black px-3 py-1.5 rounded-xl border border-brand-cyan/30 text-brand-cyan hover:bg-brand-cyan/10 transition-all">Uložit</button>
                                        </div>
                                        <textarea name="evaluationNote" placeholder="Komentář k vyhodnocení..." defaultValue={t.evaluationNote ?? ""} rows={2}
                                          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-700 outline-none focus:border-brand-cyan resize-none placeholder:text-gray-300" />
                                      </form>
                                    )}
                                    {t.taskType === "AMOUNT" && (
                                      <form action={updateKpiTaskCompletion.bind(null, t.id)} className="space-y-2">
                                        <input type="hidden" name="taskType" value="AMOUNT" />
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="text-sm text-gray-400">Cíl: <span className="font-black text-gray-700">{fmt(t.targetAmount ?? 0)}</span></span>
                                          <span className="text-gray-300">|</span>
                                          <div className="flex flex-col">
                                            <input name="actualAmount" type="number" min="0" step="1" defaultValue={t.actualAmount ?? 0}
                                              className="w-32 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-bold text-gray-900 outline-none focus:border-brand-cyan" />
                                            <p className="text-[9px] text-gray-400 mt-0.5 ml-1">{fmt(t.actualAmount ?? 0)}</p>
                                          </div>
                                          <button type="submit" className="text-xs font-black px-3 py-1.5 rounded-xl border border-brand-cyan/30 text-brand-cyan hover:bg-brand-cyan/10 transition-all">Uložit</button>
                                        </div>
                                        <textarea name="evaluationNote" placeholder="Komentář k vyhodnocení..." defaultValue={t.evaluationNote ?? ""} rows={2}
                                          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-700 outline-none focus:border-brand-cyan resize-none placeholder:text-gray-300" />
                                      </form>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </details>
                    )
                  })}
                </div>
              )}
            </section>

            {/* ── BLOK 3: POP (pouze pokud má přiřazen plán) ───────────────── */}
            {popCalcs.length > 0 && (
              <section className="bg-brand-navy rounded-[2.5rem] p-10 relative overflow-hidden shadow-2xl">
                <div className="absolute -right-20 -top-20 w-96 h-96 bg-brand-pink rounded-full opacity-10 blur-[100px]" />
                <div className="absolute -left-10 -bottom-10 w-64 h-64 bg-brand-cyan rounded-full opacity-10 blur-[80px]" />
                <div className="relative z-10">

                  {/* Hlavička */}
                  <div className="flex items-start justify-between mb-4 flex-wrap gap-4">
                    <div>
                      <p className="text-sm font-black text-brand-pink uppercase tracking-[0.4em] mb-1">Phantom Option Plan</p>
                      <p className="text-5xl md:text-6xl font-black tracking-tighter text-white italic leading-none">
                        {fmt(totalPopGain)}
                      </p>
                      <p className="text-white/30 text-sm font-bold mt-2">CZK · Brutto · celkem všechny POP plány</p>
                    </div>
                    <span className="text-sm font-black bg-brand-pink/20 text-brand-pink px-4 py-2 rounded-full uppercase tracking-widest border border-brand-pink/30">
                      Průběžná projekce
                    </span>
                  </div>
                  {/* Vysvětlení */}
                  <div className="mb-8 p-4 bg-white/5 border border-white/10 rounded-2xl text-xs text-white/40 leading-relaxed">
                    POP odměňuje za <span className="text-white/70 font-black">nárůst hodnoty firmy</span> od tvého vstupu do plánu.
                    Zobrazená čísla jsou <span className="text-white/70 font-black">průběžná projekce</span> — skutečný nárok vzniká až po uplynutí vestingové doby.
                    Pokud není splněna podmínka minimálního růstu (hurdle rate), nárok je <span className="text-brand-pink font-black">0</span>.
                  </div>

                  {/* Per-plán */}
                  {popCalcs.map(({ assignment: a, pop, schedule }) => pop && (
                    <div key={a.id} className="mt-6 pt-6 border-t border-white/10">
                      {(() => {
                        const grantDate    = new Date(a.grantDate)
                        const vestingEnd   = new Date(grantDate)
                        vestingEnd.setFullYear(vestingEnd.getFullYear() + a.popPlan.vestingYears)
                        const now          = new Date()
                        const isVested     = now >= vestingEnd
                        const daysToVest   = Math.ceil((vestingEnd.getTime() - now.getTime()) / 86400000)
                        return (
                          <>
                            {/* Status řádek */}
                            <div className="flex flex-wrap gap-2 mb-4">
                              {isVested ? (
                                <span className="text-xs font-black bg-brand-green/20 text-brand-green border border-brand-green/30 px-3 py-1 rounded-full uppercase tracking-widest">
                                  Nárok vestingován
                                </span>
                              ) : (
                                <span className="text-xs font-black bg-white/10 text-white/50 border border-white/15 px-3 py-1 rounded-full uppercase tracking-widest">
                                  Projekce · nárok za {daysToVest} dní ({vestingEnd.toLocaleDateString("cs-CZ")})
                                </span>
                              )}
                              {a.popPlan.minGrowthPercent > 0 && (
                                <span className={`text-xs font-black px-3 py-1 rounded-full uppercase tracking-widest border ${
                                  pop.hurdleMet
                                    ? "bg-brand-green/20 text-brand-green border-brand-green/30"
                                    : "bg-brand-pink/20 text-brand-pink border-brand-pink/30"
                                }`}>
                                  {pop.hurdleMet ? "✓" : "✗"} Min. růst {a.popPlan.minGrowthPercent}% · aktuálně {Math.round(pop.growthPercent)}%
                                </span>
                              )}
                            </div>

                            <div className="flex flex-col md:flex-row justify-between items-start gap-6 mb-6">
                              <div>
                                <p className="text-xs font-black text-white/40 uppercase tracking-[0.3em] mb-2">{a.popPlan.name} · {a.sharePercent}% podíl · grant {grantDate.getFullYear()}</p>
                                <p className={`text-4xl font-black ${pop.hurdleMet ? "text-white" : "text-white/30"}`}>{fmt(pop.grossGain)}</p>
                                {!pop.hurdleMet && (
                                  <p className="text-xs text-brand-pink mt-1">Hurdle nesplněn — nárok je 0</p>
                                )}
                              </div>
                              <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-2 min-w-[240px]">
                                <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-3">Jak se počítá</p>
                                <PopRow label="Hodnota firmy dnes"   value={fmt(pop.currentFirmValue)} />
                                <p className="text-[9px] text-white/25 -mt-1 ml-1">= Aktuální EBITDA × koeficient</p>
                                <PopRow label="Hodnota při grantu"   value={fmt(pop.grantFirmValue)} />
                                <p className="text-[9px] text-white/25 -mt-1 ml-1">= Vstupní EBITDA × multiplikátor (při vstupu)</p>
                                <PopRow label="Vytvořená hodnota"    value={fmt(pop.createdValue)} accent />
                                <p className="text-[9px] text-white/25 -mt-1 ml-1">= Dnes − Grant (základ pro výpočet nároku)</p>
                                <div className="pt-2 border-t border-white/10">
                                  <PopRow label="Koeficient dnes"    value={`${pop.currentMultiplier.toFixed(1)}×`} />
                                  <p className="text-[9px] text-white/25 -mt-1 ml-1">= základ + splněné boostery</p>
                                  <PopRow label="z toho boostery"    value={`+${pop.boosterTotal.toFixed(1)}×`} />
                                  <PopRow label="Růst hodnoty"       value={`${Math.round(pop.growthPercent)}%`} />
                                  {a.popPlan.minGrowthPercent > 0 && (
                                    <p className="text-[9px] text-white/25 -mt-1 ml-1">min. požadováno: {a.popPlan.minGrowthPercent}%</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          </>
                        )
                      })()}

                      {/* Boostery */}
                      {a.popPlan.boosters.length > 0 && (
                        <div className="mb-5">
                          <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-2">Strategické boostery</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {a.popPlan.boosters.map((b: typeof a.popPlan.boosters[number], i: number) => (
                              <div key={i} className={`px-4 py-3 rounded-2xl border ${b.isAchieved ? "bg-brand-green/10 border-brand-green/30" : "bg-white/5 border-white/10"}`}>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={`text-sm font-black ${b.isAchieved ? "text-brand-green" : "text-white/30"}`}>
                                    {b.isAchieved ? "✓" : "○"} +{b.multiplierBoost}×
                                  </span>
                                  <span className={`text-xs font-black truncate ${b.isAchieved ? "text-white/80" : "text-white/30"}`}>{b.name}</span>
                                </div>
                                {b.description && <p className={`text-[10px] ${b.isAchieved ? "text-white/40" : "text-white/20"}`}>{b.description}</p>}
                                {b.isAchieved && b.achievedNote && (
                                  <p className="text-[10px] text-brand-green/70 mt-1 italic">"{b.achievedNote}"</p>
                                )}
                                {b.isAchieved && b.achievedAt && (
                                  <p className="text-[9px] text-white/20 mt-0.5">{new Date(b.achievedAt).toLocaleDateString('cs-CZ')}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Vesting splátky */}
                      {schedule.length > 0 && (
                        <div className="mt-2">
                          <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
                            <p className="text-xs font-black text-white/30 uppercase tracking-widest">Vesting splátky</p>
                            <p className="text-[10px] text-white/25 italic">Orientační přehled — skutečná výše každé splátky bude stanovena podle aktuální hodnoty firmy v době výplaty</p>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                            {schedule.map(v => {
                              const paid = a.payments.find(p => p.vestingYear === v.index)
                              return (
                                <div key={v.index} className={`px-4 py-3 rounded-2xl border text-sm ${
                                  paid?.isPaid
                                    ? "bg-brand-green/20 border-brand-green/30"
                                    : v.isCurrent
                                    ? "bg-brand-cyan/20 border-brand-cyan/30"
                                    : "bg-white/5 border-white/10"
                                }`}>
                                  <p className={`font-black text-sm ${paid?.isPaid ? "text-brand-green" : v.isCurrent ? "text-brand-cyan" : "text-white/40"}`}>
                                    {v.label} {paid?.isPaid && "✓"}
                                  </p>
                                  <p className={`font-black text-base mt-1 ${paid?.isPaid ? "text-brand-green" : v.isCurrent ? "text-white" : "text-white/30"}`}>
                                    {fmt(v.amount)}
                                  </p>
                                  <p className={`text-xs mt-0.5 ${paid?.isPaid ? "text-brand-green/70" : v.isCurrent ? "text-brand-cyan/70" : "text-white/20"}`}>
                                    {v.payDate}
                                  </p>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

          </>
        )}
      </main>
    </div>
  )
}

// ── Sub-komponenty ────────────────────────────────────────────────────────────

function PopRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs font-bold text-white/30 uppercase tracking-wider">{label}</span>
      <span className={`font-black text-sm ${accent ? "text-brand-pink" : "text-white"}`}>{value}</span>
    </div>
  )
}
