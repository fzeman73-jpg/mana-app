import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { calcBonus, calcPOP, calcVestingSchedule } from "@/lib/calculator"
import { markPopPaymentPaid, markPopPaymentUnpaid } from "@/lib/actions"
import Image from "next/image"
import { redirect } from "next/navigation"

const fmt = (n: number) => Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 }).format(Math.round(n))
const pct = (n: number) => `${Math.round(n)}%`

// ── Types for new POP system ──────────────────────────────────────────────────
type PopBooster    = { multiplierBoost: number; isAchieved: boolean }
type PopYearData   = { year: number; currentEbitda: number }
type PopPlanData   = {
  id: string; name: string
  baseMultiplier: number; grantEbitda: number
  vestingGranularity: string; vestingYears: number
  vestingPaymentDay: number; vestingPaymentMonth: number; vestingQuarters: number
  minGrowthPercent: number
  boosters: PopBooster[]
  yearData: PopYearData[]
}
type PopPaymentRec = { vestingYear: number; isPaid: boolean; paidAt: Date | null; amount: number | null }
type PopAssignRec  = {
  id: string; userId: string
  sharePercent: number; grantDate: Date; grantEbitda: number
  user: { name: string | null; email: string | null }
  popPlan: PopPlanData
  payments: PopPaymentRec[]
}

function castPrisma() {
  return prisma as unknown as {
    popAssignment: { findMany: (a: object) => Promise<unknown[]> }
    parameterWeight: { findMany: (a: object) => Promise<{ parameterId: string; weight: number }[]> }
  }
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ periodId?: string }>
}) {
  const session = await auth()
  const caller  = await prisma.user.findUnique({ where: { email: session?.user?.email || "" } })
  if (caller?.role !== "ADMIN") redirect("/")

  const { periodId } = await searchParams
  const now  = new Date()
  const curQ = Math.ceil((now.getMonth() + 1) / 3)
  const curY = now.getFullYear()

  const periods = await prisma.period.findMany({ orderBy: { startDate: "desc" } })
  const sel     = periods.find(p => p.id === periodId) ?? null

  // ── POP: global, not period-scoped ──────────────────────────────────────────
  const rawAssignments = await castPrisma().popAssignment.findMany({
    include: {
      user:    true,
      payments: true,
      popPlan: { include: { boosters: true, yearData: { orderBy: { year: "asc" } } } },
    },
    orderBy: { user: { name: "asc" } },
  })
  const popAssignments = rawAssignments as PopAssignRec[]

  const popCalcs = popAssignments.map(a => {
    const plan             = a.popPlan
    const latestYearData   = plan.yearData.at(-1)
    const effectiveGrantEbitda = a.grantEbitda > 0 ? a.grantEbitda : plan.grantEbitda
    const pop = latestYearData ? calcPOP({
      sharePercent:     a.sharePercent,
      grantEbitda:      effectiveGrantEbitda,
      grantMultiplier:  plan.baseMultiplier,
      currentEbitda:    latestYearData.currentEbitda,
      baseMultiplier:   plan.baseMultiplier,
      boosters:         plan.boosters,
      minGrowthPercent: plan.minGrowthPercent,
    }) : null
    const vestingYears    = plan.vestingYears
    const vestingSchedule = pop ? calcVestingSchedule({
      grossGain:           pop.grossGain,
      granularity:         "YEARLY",
      vestingYears,
      vestingPaymentDay:   plan.vestingPaymentDay,
      vestingPaymentMonth: plan.vestingPaymentMonth,
      vestingQuarters:     plan.vestingQuarters,
      grantYear:           new Date(a.grantDate).getFullYear(),
    }) : []
    return { a, plan, pop, vestingYears, vestingSchedule }
  })

  const totalPopLiability  = popCalcs.reduce((s, { pop }) => s + (pop?.grossGain ?? 0), 0)
  const totalAnnualVesting = popCalcs.reduce((s, { pop, vestingYears }) => s + (pop ? pop.grossGain / vestingYears : 0), 0)

  // ── Bonus: period-scoped ─────────────────────────────────────────────────────
  const [compensations, perfParams, snapshots] = sel ? await Promise.all([
    prisma.compensation.findMany({
      where:   { periodId: sel.id },
      include: { user: true },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.performanceParameter.findMany({
      where:   { periodId: sel.id },
      include: { results: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.quarterlySnapshot.findMany({
      where:   { periodId: sel.id },
      include: { user: true },
      orderBy: [{ year: "asc" }, { quarter: "asc" }],
    }),
  ]) : [[], [], []]

  const managerData = sel ? await Promise.all(
    compensations.map(async comp => {
      const kpiTasks  = await prisma.kpiTask.findMany({ where: { userId: comp.userId, periodId: sel.id } })
      const userDivId = comp.user.divisionId
      const weightRows = await castPrisma().parameterWeight.findMany({ where: { userId: comp.userId } })
      const weightMap  = new Map(weightRows.map((r: { parameterId: string; weight: number }) => [r.parameterId, r.weight]))
      const userPerfParams = perfParams.filter(p =>
        (p as unknown as { divisionId: string | null }).divisionId === null ||
        (p as unknown as { divisionId: string | null }).divisionId === userDivId
      )
      const params = userPerfParams.map(p => {
        const res = p.results.find(r => r.quarter === curQ && r.year === curY)
        return {
          id:           p.id,
          name:         p.name,
          weight:       weightMap.get(p.id) ?? p.weight,
          threshold:    p.threshold,
          gatesParamId: p.gatesParamId,
          actual:       res?.actual ?? 0,
          target:       res?.target ?? 0,
        }
      })
      const bonus = calcBonus(
        params,
        comp.targetBonusAnnual,
        kpiTasks.map(t => {
          const tt = t as unknown as { taskType: string; completionPct: number | null; targetAmount: number | null; actualAmount: number | null }
          let cp = t.isCompleted ? 1 : 0
          if (tt.taskType === "PERCENT") cp = Math.min(1, (tt.completionPct ?? 0) / 100)
          else if (tt.taskType === "AMOUNT" && (tt.targetAmount ?? 0) > 0) cp = Math.min(1, (tt.actualAmount ?? 0) / tt.targetAmount!)
          return { weight: t.weight, completionPct: cp }
        }),
        (comp as unknown as { kpiWeight: number }).kpiWeight ?? 0
      )
      return { comp, bonus }
    })
  ) : []

  const totalBonusBudget     = managerData.reduce((s, m) => s + m.comp.targetBonusAnnual, 0)
  const totalBonusCalculated = managerData.reduce((s, m) => s + m.bonus.total, 0)

  return (
    <div className="min-h-screen bg-gray-50 font-sans">

      {/* HLAVIČKA */}
      <header className="bg-white border-b border-gray-100 px-8 py-4 flex justify-between items-center sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-4">
          <a href="/"><Image src="/algotech-logo.png" alt="Algotech" width={130} height={38} className="object-contain" /></a>
          <div className="w-px h-7 bg-gray-200" />
          <div>
            <h1 className="text-sm font-black italic uppercase tracking-tight text-gray-900">
              <span className="text-brand-pink">Reporty</span>
            </h1>
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">POP závazek · Bonusy · Export</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <a href="/admin" className="bg-gray-100 text-gray-600 px-4 py-2 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-brand-pink hover:text-white transition-all">
            ← Uživatelé
          </a>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-8 space-y-6">

        {/* Výběr období */}
        <section className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[11px] font-black text-brand-cyan uppercase tracking-[0.3em] italic">Časové období — Bonusy</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            {periods.map(p => (
              <a
                key={p.id}
                href={`/admin/reports?periodId=${p.id}`}
                className={`px-4 py-3 rounded-2xl border font-black text-sm transition-all ${
                  sel?.id === p.id
                    ? "border-brand-cyan bg-brand-cyan/5 text-brand-navy ring-2 ring-brand-cyan/20"
                    : "border-gray-200 text-gray-600 hover:border-brand-cyan hover:text-brand-navy"
                }`}
              >
                {p.name}
                {p.isActive && <span className="ml-2 text-[8px] font-black bg-brand-green/20 text-brand-green px-1.5 py-0.5 rounded-full uppercase">Aktivní</span>}
              </a>
            ))}
            {periods.length === 0 && <p className="text-gray-400 text-sm italic">Žádná období.</p>}
          </div>
        </section>

        {sel && (
          <>
            {/* Souhrnné KPI karty — bonusy */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm">
                <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1">Bonus – cíl</p>
                <p className="text-2xl font-black text-gray-900">{fmt(totalBonusBudget)}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">cílová výše za období</p>
              </div>
              <div className={`p-5 rounded-[2rem] border shadow-sm ${totalBonusCalculated >= totalBonusBudget * 0.9 ? "bg-brand-green/5 border-brand-green/20" : "bg-white border-gray-100"}`}>
                <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1">Bonus – vypočtený</p>
                <p className={`text-2xl font-black ${totalBonusCalculated >= totalBonusBudget * 0.9 ? "text-brand-green" : "text-gray-900"}`}>{fmt(totalBonusCalculated)}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {totalBonusBudget > 0 ? `${pct(totalBonusCalculated / totalBonusBudget * 100)} z cíle` : "—"}
                </p>
              </div>
            </div>

            {/* Excel export */}
            <div className="flex justify-end">
              <a
                href={`/admin/reports/export?periodId=${sel.id}`}
                className="inline-flex items-center gap-2 bg-brand-navy text-white px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-brand-pink transition-all active:scale-95"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                Export Excel
              </a>
            </div>

            {/* Tabulka bonusů */}
            <section className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
              <h2 className="text-[11px] font-black text-brand-cyan uppercase tracking-[0.3em] italic mb-5">Bonusy — aktuální kvartál Q{curQ} {curY}</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-3 pr-4 text-[9px] font-black text-gray-400 uppercase tracking-widest">Manažer</th>
                      <th className="text-right py-3 px-4 text-[9px] font-black text-gray-400 uppercase tracking-widest">Cílový bonus</th>
                      <th className="text-right py-3 px-4 text-[9px] font-black text-gray-400 uppercase tracking-widest">Vypočtený bonus</th>
                      <th className="text-right py-3 px-4 text-[9px] font-black text-gray-400 uppercase tracking-widest">Plnění</th>
                      {perfParams.map(p => (
                        <th key={p.id} className="text-right py-3 px-4 text-[9px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">{p.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {managerData.map(({ comp, bonus }) => (
                      <tr key={comp.id} className="hover:bg-gray-50 transition-colors">
                        <td className="py-4 pr-4 font-black text-gray-900">{comp.user.name ?? comp.user.email}</td>
                        <td className="py-4 px-4 text-right text-gray-500">{fmt(comp.targetBonusAnnual)}</td>
                        <td className="py-4 px-4 text-right font-black text-gray-900">{fmt(bonus.total)}</td>
                        <td className="py-4 px-4 text-right">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                            comp.targetBonusAnnual > 0 && bonus.total / comp.targetBonusAnnual >= 0.9
                              ? "bg-brand-green/10 text-brand-green"
                              : "bg-brand-pink/10 text-brand-pink"
                          }`}>
                            {comp.targetBonusAnnual > 0 ? pct(bonus.total / comp.targetBonusAnnual * 100) : "—"}
                          </span>
                        </td>
                        {perfParams.map(p => {
                          const paramResult = bonus.parameters.find(r => r.id === p.id)
                          return (
                            <td key={p.id} className="py-4 px-4 text-right text-[11px]">
                              {paramResult ? (
                                <span className={!paramResult.thresholdMet || paramResult.gated ? "text-brand-pink" : "text-gray-700"}>
                                  {pct(paramResult.achievement * 100)}
                                  {!paramResult.thresholdMet && " ✗"}
                                  {paramResult.gated && " ⊘"}
                                </span>
                              ) : "—"}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Historie snapshots */}
            {snapshots.length > 0 && (
              <section className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
                <h2 className="text-[11px] font-black text-brand-cyan uppercase tracking-[0.3em] italic mb-5">Historie uzavřených kvartálů</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left py-3 pr-4 text-[9px] font-black text-gray-400 uppercase tracking-widest">Manažer</th>
                        <th className="text-right py-3 px-4 text-[9px] font-black text-gray-400 uppercase tracking-widest">Kvartál</th>
                        <th className="text-right py-3 px-4 text-[9px] font-black text-gray-400 uppercase tracking-widest">Bonus</th>
                        <th className="text-right py-3 pl-4 text-[9px] font-black text-gray-400 uppercase tracking-widest">POP hodnota</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {snapshots.map(s => (
                        <tr key={s.id} className="hover:bg-gray-50">
                          <td className="py-3 pr-4 font-bold text-gray-900">{s.user.name ?? s.user.email}</td>
                          <td className="py-3 px-4 text-right text-gray-500">Q{s.quarter} {s.year}</td>
                          <td className="py-3 px-4 text-right font-black text-gray-900">{fmt(s.bonusAmount)}</td>
                          <td className="py-3 pl-4 text-right text-brand-cyan font-black">{fmt(s.popValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}

        {!sel && periods.length > 0 && (
          <div className="bg-white p-12 rounded-[2rem] border border-gray-100 shadow-sm text-center">
            <p className="text-gray-400 text-sm">Vyberte časové období pro zobrazení bonusů.</p>
          </div>
        )}

        {/* ── POP SEKCE — vždy zobrazena, nezávislá na období ───────────────── */}
        <div className="flex items-center gap-4 pt-2">
          <div className="flex-1 h-px bg-gray-200" />
          <div className="flex items-center gap-2 px-4 py-2 bg-brand-navy rounded-full">
            <span className="text-[9px] font-black text-white/60 uppercase tracking-widest">Phantom Option Plan</span>
            <span className="text-[9px] font-black text-white/40">·</span>
            <span className="text-[9px] font-black text-brand-cyan uppercase tracking-widest">Dlouhodobý nástroj — nezávislý na zvoleném období</span>
          </div>
          <div className="flex-1 h-px bg-gray-200" />
        </div>
        <p className="text-xs text-gray-400 text-center -mt-2">
          POP odměňuje za nárůst hodnoty firmy od data grantu každého manažera. Níže uvedené hodnoty nejsou vázány na vybrané účetní období.
        </p>

        {/* Souhrnné KPI karty — POP */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-brand-navy text-white p-5 rounded-[2rem]">
            <p className="text-[9px] font-black text-white/50 uppercase tracking-widest mb-1">POP závazek celkem</p>
            <p className="text-2xl font-black">{fmt(totalPopLiability)}</p>
            <p className="text-[10px] text-white/50 mt-0.5">průběžná projekce · hrubý zisk všech manažerů</p>
          </div>
          <div className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm">
            <p className="text-[9px] font-black text-brand-cyan uppercase tracking-widest mb-1">Roční vesting splátky</p>
            <p className="text-2xl font-black text-gray-900">{fmt(totalAnnualVesting)}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">celkový objem ročních výplat</p>
          </div>
        </div>

        {/* Tabulka POP závazku */}
        <section className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
          <h2 className="text-[11px] font-black text-brand-cyan uppercase tracking-[0.3em] italic mb-5">POP závazek — přehled manažerů</h2>

          {popCalcs.length === 0 ? (
            <p className="text-sm text-gray-400 italic">Žádné POP plány nejsou nastaveny. Přiřaďte manažery v sekci <a href="/admin/pop" className="text-brand-cyan hover:underline">Nastavení Plánů → POP</a>.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-3 pr-4 text-[9px] font-black text-gray-400 uppercase tracking-widest">Manažer</th>
                    <th className="text-left py-3 px-4 text-[9px] font-black text-gray-400 uppercase tracking-widest">Plán</th>
                    <th className="text-right py-3 px-4 text-[9px] font-black text-gray-400 uppercase tracking-widest">Podíl</th>
                    <th className="text-right py-3 px-4 text-[9px] font-black text-gray-400 uppercase tracking-widest">Grant</th>
                    <th className="text-right py-3 px-4 text-[9px] font-black text-gray-400 uppercase tracking-widest">Akt. hodnota firmy</th>
                    <th className="text-right py-3 px-4 text-[9px] font-black text-gray-400 uppercase tracking-widest">Vytvořená hodnota</th>
                    <th className="text-right py-3 px-4 text-[9px] font-black text-gray-400 uppercase tracking-widest">Hrubý zisk POP</th>
                    <th className="text-right py-3 pl-4 text-[9px] font-black text-gray-400 uppercase tracking-widest">Roční vesting</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {popCalcs.map(({ a, plan, pop, vestingYears }) => (
                    <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-4 pr-4">
                        <p className="font-black text-gray-900">{a.user.name ?? a.user.email}</p>
                        <p className="text-[10px] text-gray-400">{a.user.email}</p>
                      </td>
                      <td className="py-4 px-4">
                        <span className="text-[10px] font-black text-brand-cyan">{plan.name}</span>
                      </td>
                      <td className="py-4 px-4 text-right font-black text-brand-cyan">{a.sharePercent}%</td>
                      <td className="py-4 px-4 text-right text-gray-500 text-[11px]">
                        <p>{new Date(a.grantDate).toLocaleDateString('cs-CZ')}</p>
                        <p className="text-gray-400">{plan.baseMultiplier}×</p>
                      </td>
                      <td className="py-4 px-4 text-right text-gray-900 font-bold text-[11px]">
                        {pop ? fmt(pop.currentFirmValue) : "—"}
                      </td>
                      <td className="py-4 px-4 text-right text-[11px]">
                        <span className={pop && pop.createdValue > 0 ? "text-brand-green font-black" : "text-gray-400"}>
                          {pop ? fmt(pop.createdValue) : "—"}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right">
                        {pop && !pop.hurdleMet && (
                          <span className="text-[9px] font-black text-brand-pink block">pod hurdle</span>
                        )}
                        <span className={`font-black text-base ${pop && pop.grossGain > 0 ? "text-brand-navy" : "text-gray-300"}`}>
                          {pop ? fmt(pop.grossGain) : "—"}
                        </span>
                      </td>
                      <td className="py-4 pl-4 text-right text-[11px]">
                        <span className="text-brand-cyan font-black">
                          {pop && pop.grossGain > 0 ? fmt(pop.grossGain / vestingYears) : "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200">
                    <td className="py-3 pr-4 text-[10px] font-black text-gray-500 uppercase" colSpan={2}>Celkem</td>
                    <td colSpan={4} />
                    <td className="py-3 px-4 text-right font-black text-brand-navy text-base">{fmt(totalPopLiability)}</td>
                    <td className="py-3 pl-4 text-right font-black text-brand-cyan">{fmt(totalAnnualVesting)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>

        {/* Vesting splátky */}
        <section className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
          <h2 className="text-[11px] font-black text-brand-cyan uppercase tracking-[0.3em] italic mb-2">Vesting POP — splátky</h2>
          <p className="text-[11px] text-gray-400 mb-5">
            Přehled ročních splátek z Phantom Option Planu. Splátky jsou orientační — skutečná výše výplaty se může lišit.
            Označte splátky jako vyplacené po provedení výplaty.
          </p>

          {popCalcs.some(c => c.vestingSchedule.length > 0) ? (
            <div className="space-y-4">
              {popCalcs.filter(c => c.vestingSchedule.length > 0).map(({ a, plan, pop, vestingSchedule }) => (
                <div key={a.id} className="border border-gray-200 rounded-2xl overflow-hidden">
                  <div className="px-5 py-3 bg-gray-50 flex items-center justify-between">
                    <div>
                      <p className="font-black text-gray-900 text-sm">{a.user.name ?? a.user.email}</p>
                      <p className="text-[10px] text-gray-400">
                        {plan.name} · {a.sharePercent}% · grant {new Date(a.grantDate).toLocaleDateString('cs-CZ')} · {plan.vestingYears} let
                      </p>
                    </div>
                    <span className={`text-[10px] font-black px-3 py-1 rounded-full ${pop && pop.grossGain > 0 ? "bg-brand-navy/10 text-brand-navy" : "bg-gray-100 text-gray-400"}`}>
                      Celkem: {pop ? fmt(pop.grossGain) : "0"}
                    </span>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {vestingSchedule.map(v => {
                      const payment = a.payments.find(p => p.vestingYear === v.index)
                      const isPaid  = payment?.isPaid ?? false
                      return (
                        <div key={v.index} className={`flex items-center gap-4 px-5 py-3 ${isPaid ? "bg-brand-green/3" : ""}`}>
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isPaid ? "bg-brand-green" : v.isCurrent ? "bg-brand-cyan" : "bg-gray-300"}`} />
                          <span className={`text-sm font-black w-20 ${v.isCurrent ? "text-brand-cyan" : "text-gray-500"}`}>
                            {v.label}
                          </span>
                          <span className="text-[10px] text-gray-400 w-16">{v.payDate}</span>
                          <span className="text-[10px] text-gray-400 w-8">{Math.round(v.percentage)}%</span>
                          <span className="font-black text-gray-900 flex-1">{fmt(v.amount)}</span>
                          {isPaid ? (
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] font-black text-brand-green">
                                ✓ Vyplaceno {payment?.paidAt ? new Date(payment.paidAt).toLocaleDateString('cs-CZ') : ""}
                                {payment?.amount ? ` · ${fmt(payment.amount)}` : ""}
                              </span>
                              <form action={markPopPaymentUnpaid.bind(null, a.id, v.index, plan.id)}>
                                <button className="text-[9px] font-black text-gray-400 hover:text-brand-pink transition-colors uppercase tracking-wider">
                                  Zrušit
                                </button>
                              </form>
                            </div>
                          ) : (
                            <form action={markPopPaymentPaid.bind(null, a.id, v.index)} className="flex items-center gap-2">
                              <div className="flex flex-col gap-0">
                                <input
                                  name="amount"
                                  type="number"
                                  step="1"
                                  placeholder={`${Math.round(v.amount)}`}
                                  className="w-28 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-bold text-gray-900 outline-none focus:border-brand-cyan"
                                />
                                <p className="text-[9px] text-gray-400 mt-0.5 ml-1">{fmt(v.amount)}</p>
                              </div>
                              <button
                                type="submit"
                                className="text-[9px] font-black px-3 py-1.5 rounded-xl border border-brand-green/30 text-brand-green hover:bg-brand-green hover:text-white transition-all uppercase tracking-wider"
                              >
                                Vyplaceno
                              </button>
                            </form>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-sm italic text-center py-6">
              Žádné vesting splátky. Přiřaďte manažery do POP plánu v sekci <a href="/admin/pop" className="text-brand-cyan hover:underline">Nastavení Plánů → POP</a>.
            </p>
          )}
        </section>

      </div>
    </div>
  )
}
