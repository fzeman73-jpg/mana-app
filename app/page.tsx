import { auth, signIn, signOut } from "@/auth"
import { prisma } from "@/lib/db"
import { loginWithCredentials, adminToggleKpiTask } from "@/lib/actions"
import { calcBonus, calcPOP, calcVestingSchedule, yearsSinceDate, currentQuarter } from "@/lib/calculator"
import Image from "next/image"

const fmt = (n: number) => Intl.NumberFormat('cs-CZ').format(Math.round(n))
const pct = (n: number) => `${Math.round(n * 100)}%`

export default async function Home() {
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
          <h1 className="text-3xl font-black mb-2 tracking-tighter italic uppercase text-gray-900">
            Performance <span className="text-brand-cyan">Cockpit</span>
          </h1>
          <p className="text-gray-400 mb-10 font-medium italic tracking-wide text-sm underline decoration-brand-cyan/40 underline-offset-8">
            Sledování výkonnostních pobídek
          </p>
          <form action={loginWithCredentials} className="space-y-3 mb-6">
            <input name="email" type="email" placeholder="Email" required
              className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-4 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all placeholder:text-gray-400 text-gray-900" />
            <input name="password" type="password" placeholder="Heslo" required
              className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-4 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all placeholder:text-gray-400 text-gray-900" />
            <button type="submit" className="w-full bg-brand-navy text-white font-black py-4 px-8 rounded-2xl hover:bg-brand-cyan hover:text-brand-navy transition-all shadow-sm active:scale-95 uppercase tracking-[0.2em] text-xs">
              Přihlásit se
            </button>
          </form>
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">nebo</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
          <form action={async () => { "use server"; await signIn("google") }}>
            <button className="w-full bg-brand-cyan text-brand-navy font-black py-4 px-8 rounded-2xl hover:bg-brand-pink hover:text-white transition-all shadow-sm active:scale-95 uppercase tracking-[0.2em] text-xs">
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

  // Aktivní období
  const period = await prisma.period.findFirst({ where: { isActive: true } })

  // Data pro aktivní období
  const [compensation, kpiTasks, perfParams, vestingBase, boosters, snapshots] = period
    ? await Promise.all([
        prisma.compensation.findUnique({ where: { userId_periodId: { userId: dbUser.id, periodId: period.id } } }),
        prisma.kpiTask.findMany({ where: { userId: dbUser.id, periodId: period.id }, orderBy: { name: "asc" } }),
        prisma.performanceParameter.findMany({
          where:   { periodId: period.id },
          include: { results: { orderBy: [{ year: "asc" }, { quarter: "asc" }] } },
          orderBy: { sortOrder: "asc" },
        }),
        prisma.vestingBase.findUnique({ where: { periodId: period.id } }),
        prisma.strategicBooster.findMany({ where: { periodId: period.id }, orderBy: { name: "asc" } }),
        prisma.quarterlySnapshot.findMany({
          where: { userId: dbUser.id },
          orderBy: [{ year: "asc" }, { quarter: "asc" }],
          take: 12,
        }),
      ])
    : [null, [], [], null, [], []]

  const { quarter: curQ, year: curY } = currentQuarter()

  // ── VÝPOČTY ───────────────────────────────────────────────────────────────

  // Bonus z výkonnostních parametrů
  const paramInputs = perfParams.map(p => {
    const res = p.results.find(r => r.quarter === curQ && r.year === curY)
    return {
      id:           p.id,
      name:         p.name,
      weight:       p.weight,
      threshold:    p.threshold,
      gatesParamId: p.gatesParamId,
      actual:       res?.actual ?? 0,
      target:       res?.target ?? 0,
    }
  })

  const bonusBreakdown = calcBonus(
    paramInputs,
    compensation?.targetBonusAnnual ?? 0,
    kpiTasks.map(t => ({ weight: t.weight, isCompleted: t.isCompleted })),
    0 // KPI váha je součástí targetBonusAnnual přes individuální úkoly
  )

  // KPI plnění
  const totalKpiW = kpiTasks.reduce((s, t) => s + t.weight, 0)
  const doneKpiW  = kpiTasks.filter(t => t.isCompleted).reduce((s, t) => s + t.weight, 0)
  const kpiAch    = totalKpiW > 0 ? doneKpiW / totalKpiW : 0

  // POP
  const popResult = vestingBase && compensation ? calcPOP({
    sharePercent:    compensation.sharePercent,
    grantEbitda:     compensation.grantEbitda,
    grantMultiplier: compensation.grantMultiplier,
    currentEbitda:   vestingBase.currentEbitda,
    baseMultiplier:  vestingBase.baseMultiplier,
    boosters:        boosters.map(b => ({ multiplierBoost: b.multiplierBoost, isAchieved: b.isAchieved })),
  }) : null

  // Vesting
  const vestingSchedule = (popResult && compensation) ? calcVestingSchedule({
    grossGain:       popResult.grossGain,
    vestingYears:    compensation.vestingYears,
    vestingPercent:  compensation.vestingPercent,
    yearsSinceGrant: yearsSinceDate(compensation.grantDate),
  }) : []

  const noData = !period || !compensation

  return (
    <div className="min-h-screen bg-gray-50 font-sans selection:bg-brand-cyan/20">

      {/* NAVBAR */}
      <nav className="bg-white border-b border-gray-200 px-8 py-4 flex justify-between items-center sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-3">
          <a href="/"><Image src="/algotech-logo.png" alt="Algotech" width={150} height={44} className="object-contain" /></a>
          <span className="w-px h-6 bg-gray-200" />
          {period
            ? <span className="text-[10px] font-black text-brand-cyan/70 uppercase tracking-widest">{period.name}</span>
            : <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Žádné aktivní období</span>
          }
        </div>
        <div className="flex items-center gap-4">
          {(isAdmin || isManager) && (
            <a href="/admin/parameters" className="text-gray-400 hover:text-brand-cyan text-[10px] font-black uppercase tracking-widest transition-colors">
              Parametry
            </a>
          )}
          {isAdmin && (
            <a href="/admin/reports" className="text-gray-400 hover:text-brand-cyan text-[10px] font-black uppercase tracking-widest transition-colors">
              Reporty
            </a>
          )}
          {isAdmin && (
            <a href="/admin" className="bg-brand-cyan/10 text-brand-cyan border border-brand-cyan/30 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-cyan hover:text-brand-navy transition-all">
              Uživatelé
            </a>
          )}
          <div className="hidden sm:flex items-center gap-3">
            {session.user?.image && (
              <img src={session.user.image} className="w-9 h-9 rounded-full ring-2 ring-brand-cyan/20" referrerPolicy="no-referrer" alt="" />
            )}
            <div className="leading-none text-right">
              <p className="text-xs font-black text-gray-900">{session.user?.name}</p>
              <p className="text-[9px] text-gray-400 uppercase tracking-wider">{dbUser.role === "ADMIN" ? "Admin" : dbUser.role === "MANAGER" ? "Manažer" : "Viewer"}</p>
            </div>
          </div>
          <a href="/settings" className="text-gray-400 hover:text-brand-cyan transition-colors text-[10px] font-black uppercase tracking-widest">
            Nastavení
          </a>
          <form action={async () => { "use server"; await signOut() }}>
            <button className="text-gray-400 hover:text-brand-pink transition-colors text-[10px] font-black uppercase tracking-widest">Odhlásit</button>
          </form>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto py-10 px-6 space-y-8">

        {noData ? (
          <div className="bg-white rounded-[3rem] border border-gray-100 shadow-sm p-16 text-center">
            <p className="text-5xl mb-4">⚙️</p>
            <p className="font-black text-gray-400 text-sm uppercase tracking-widest">
              {!period ? "Není aktivní žádné období." : "Vaše odměna zatím není nastavena."}
            </p>
            {isAdmin && <a href="/admin/parameters" className="inline-block mt-6 bg-brand-cyan text-brand-navy px-8 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-brand-pink hover:text-white transition-all">Nastavit parametry →</a>}
          </div>
        ) : (
          <>

            {/* ── HERO: POP Capital Gain ──────────────────────────────────── */}
            <section className="bg-brand-navy rounded-[3rem] p-10 relative overflow-hidden shadow-2xl">
              <div className="absolute -right-20 -top-20 w-96 h-96 bg-brand-pink rounded-full opacity-10 blur-[100px]" />
              <div className="absolute -left-10 -bottom-10 w-64 h-64 bg-brand-cyan rounded-full opacity-10 blur-[80px]" />
              <div className="relative z-10">
                <div className="flex flex-col md:flex-row justify-between items-start gap-8">
                  <div>
                    <p className="text-[10px] font-black text-brand-pink uppercase tracking-[0.4em] mb-2">Phantom Capital Gain</p>
                    <p className="text-7xl md:text-8xl font-black tracking-tighter text-white italic leading-none">
                      {fmt(popResult?.grossGain ?? 0)}
                    </p>
                    <p className="text-white/30 text-sm font-bold mt-2">CZK · Brutto · {period?.name}</p>
                  </div>
                  <div className="flex flex-col gap-4 min-w-[220px]">
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2">
                      <Row label="Hodnota firmy dnes" value={`${fmt(popResult?.currentFirmValue ?? 0)} CZK`} light />
                      <Row label="Hodnota při grantu" value={`${fmt(popResult?.grantFirmValue ?? 0)} CZK`} light />
                      <Row label="Vytvořená hodnota" value={`${fmt(popResult?.createdValue ?? 0)} CZK`} accent />
                      <div className="pt-2 border-t border-white/10">
                        <Row label="Koeficient" value={`${popResult?.currentMultiplier.toFixed(1)}×`} light />
                        <Row label="z toho boostery" value={`+${popResult?.boosterTotal.toFixed(1)}×`} light />
                        <Row label="Podíl" value={`${compensation?.sharePercent}%`} light />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Boostery */}
                {boosters.length > 0 && (
                  <div className="mt-8 pt-6 border-t border-white/10">
                    <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.3em] mb-3">Strategické boostery</p>
                    <div className="flex flex-wrap gap-2">
                      {boosters.map(b => (
                        <div key={b.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black border ${b.isAchieved ? "bg-brand-green/20 border-brand-green/30 text-brand-green" : "bg-white/5 border-white/10 text-white/30"}`}>
                          <span>{b.isAchieved ? "✓" : "○"}</span>
                          <span>{b.name}</span>
                          <span className="opacity-60">+{b.multiplierBoost}×</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* ── GRID: Bonus + Vesting + KPI + Smluvní podmínky ──────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* LEVÝ SLOUP */}
              <div className="space-y-6">

                {/* Smluvní podmínky */}
                <section className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
                  <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] mb-4">Smluvní podmínky</h2>
                  <div className="space-y-2">
                    <InfoRow label="Základní plat" value={`${fmt(compensation?.baseSalary ?? 0)} CZK / měs.`} />
                    <InfoRow label="Roční cílový bonus" value={`${fmt(compensation?.targetBonusAnnual ?? 0)} CZK`} highlight />
                    <InfoRow label="Podíl POP" value={`${compensation?.sharePercent}%`} />
                  </div>
                </section>

                {/* Vesting schedule */}
                {vestingSchedule.length > 0 && (
                  <section className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
                    <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] mb-4">Vesting POP</h2>
                    <p className="text-[10px] text-gray-400 mb-4">
                      {compensation?.vestingPercent}% ročně · {compensation?.vestingYears} let ·
                      Grant: {compensation?.grantDate ? new Date(compensation.grantDate).toLocaleDateString('cs-CZ') : "—"}
                    </p>
                    <div className="space-y-2">
                      {vestingSchedule.map(v => (
                        <div key={v.year} className={`flex justify-between items-center px-3 py-2 rounded-xl ${v.isCurrent ? "bg-brand-cyan/10 border border-brand-cyan/20" : "bg-gray-50"}`}>
                          <span className={`text-[10px] font-black uppercase tracking-wider ${v.isCurrent ? "text-brand-cyan" : "text-gray-500"}`}>
                            Rok {v.year} {v.isCurrent && "← nyní"}
                          </span>
                          <span className={`font-black text-sm ${v.isCurrent ? "text-brand-cyan" : "text-gray-700"}`}>
                            {fmt(v.amount)} CZK
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-3 text-right">
                      Celkem: {fmt(vestingSchedule.reduce((s, v) => s + v.amount, 0))} CZK
                    </p>
                  </section>
                )}
              </div>

              {/* PRAVÝ SLOUP */}
              <div className="lg:col-span-2 space-y-6">

                {/* Výkonnostní parametry – aktuální kvartál */}
                <section className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
                  <div className="flex justify-between items-center mb-5">
                    <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em]">
                      Bonus – Q{curQ} {curY}
                    </h2>
                    <div className="text-right">
                      <p className="text-[9px] text-gray-400 uppercase tracking-wider">Projekce celkem</p>
                      <p className="font-black text-xl text-brand-cyan">{fmt(bonusBreakdown.total)} CZK</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {paramInputs.map(p => {
                      const r = bonusBreakdown.parameters.find(r => r.id === p.id)
                      if (!r) return null
                      const achPct = Math.round(r.achievement * 100)
                      const barW   = Math.min(100, achPct)
                      return (
                        <div key={p.id} className={`p-4 rounded-2xl border ${!r.thresholdMet ? "bg-brand-pink/5 border-brand-pink/20" : r.gated ? "bg-gray-50 border-gray-200 opacity-60" : "bg-gray-50 border-gray-200"}`}>
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <span className="font-black text-gray-900 text-sm">{p.name}</span>
                              <div className="flex gap-2 mt-1 flex-wrap">
                                <span className="text-[9px] font-black bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">váha {p.weight}%</span>
                                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${!r.thresholdMet ? "bg-brand-pink/20 text-brand-pink" : "bg-gray-100 text-gray-400"}`}>
                                  bariéra {p.threshold}% {!r.thresholdMet ? "✗ nesplněna" : "✓"}
                                </span>
                                {r.gated && <span className="text-[9px] font-black bg-brand-pink/10 text-brand-pink px-2 py-0.5 rounded-full">nulováno (gating)</span>}
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-black text-base text-gray-900">{fmt(r.bonusAmount)} <span className="text-xs text-gray-400 font-normal">CZK</span></p>
                              <p className="text-[10px] text-gray-400">{achPct}% plnění</p>
                            </div>
                          </div>
                          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${!r.thresholdMet || r.gated ? "bg-brand-pink/50" : "bg-brand-cyan"}`}
                              style={{ width: `${barW}%` }} />
                          </div>
                          {p.actual > 0 || p.target > 0 ? (
                            <div className="flex justify-between mt-1.5">
                              <span className="text-[9px] text-gray-400">Skutečnost: {fmt(p.actual)}</span>
                              <span className="text-[9px] text-gray-400">Cíl: {fmt(p.target)}</span>
                            </div>
                          ) : (
                            <p className="text-[9px] text-gray-300 mt-1.5">Výsledky za Q{curQ} zatím nejsou zadány.</p>
                          )}
                        </div>
                      )
                    })}
                    {paramInputs.length === 0 && (
                      <p className="text-gray-400 text-sm italic text-center py-4">Parametry nejsou definovány.</p>
                    )}
                  </div>
                </section>

                {/* KPI úkoly */}
                {kpiTasks.length > 0 && (
                  <section className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
                    <div className="flex justify-between items-center mb-5">
                      <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em]">Individuální KPI</h2>
                      <div className="text-right">
                        <p className="text-[9px] text-gray-400 uppercase tracking-wider">Splněno</p>
                        <p className="font-black text-lg text-brand-green">{pct(kpiAch)}</p>
                      </div>
                    </div>

                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-5">
                      <div className="h-full bg-brand-green rounded-full transition-all" style={{ width: `${Math.round(kpiAch * 100)}%` }} />
                    </div>

                    <div className="space-y-2">
                      {kpiTasks.map(t => (
                        <div key={t.id} className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${t.isCompleted ? "bg-brand-green/5 border-brand-green/20" : "bg-gray-50 border-gray-200"}`}>
                          <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${t.isCompleted ? "bg-brand-green" : "bg-gray-300"}`} />
                          <div className="flex-1 min-w-0">
                            <p className={`font-black text-sm ${t.isCompleted ? "text-brand-green italic" : "text-gray-900"}`}>{t.name}</p>
                            {t.description && <p className="text-[10px] text-gray-400 mt-0.5">{t.description}</p>}
                          </div>
                          <span className="text-[9px] font-black text-brand-cyan bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200 flex-shrink-0">{t.weight}%</span>
                          {canEdit && (
                            <form action={adminToggleKpiTask.bind(null, t.id, t.isCompleted)}>
                              <button className={`text-[9px] font-black px-3 py-1.5 rounded-xl border transition-all flex-shrink-0 ${t.isCompleted ? "border-brand-green/30 text-brand-green hover:bg-brand-green/10" : "border-gray-200 text-gray-400 hover:border-brand-cyan hover:text-brand-cyan"}`}>
                                {t.isCompleted ? "Splněno" : "Čeká"}
                              </button>
                            </form>
                          )}
                          {!canEdit && (
                            <span className={`text-[9px] font-black px-3 py-1.5 rounded-xl border flex-shrink-0 ${t.isCompleted ? "border-brand-green/30 text-brand-green" : "border-gray-200 text-gray-400"}`}>
                              {t.isCompleted ? "Splněno" : "Čeká"}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Historie snapshots */}
                {snapshots.length > 0 && (
                  <section className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
                    <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] mb-5">Historie odměn</h2>
                    <div className="space-y-2">
                      {snapshots.map(s => (
                        <div key={s.id} className="flex justify-between items-center px-4 py-3 bg-gray-50 rounded-xl border border-gray-200">
                          <span className="text-sm font-black text-gray-700">Q{s.quarter} {s.year}</span>
                          <div className="text-right">
                            <p className="font-black text-gray-900 text-sm">{fmt(s.bonusAmount)} CZK <span className="text-gray-400 font-normal text-xs">bonus</span></p>
                            <p className="text-[10px] text-gray-400">POP: {fmt(s.popValue)} CZK</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

// ── Sub-komponenty ────────────────────────────────────────────────────────────

function Row({ label, value, light, accent }: { label: string; value: string; light?: boolean; accent?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-[10px] font-bold text-white/30 uppercase tracking-wider">{label}</span>
      <span className={`font-black text-sm ${accent ? "text-brand-pink" : light ? "text-white" : "text-brand-cyan"}`}>{value}</span>
    </div>
  )
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-100">
      <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{label}</span>
      <span className={`font-black text-sm ${highlight ? "text-brand-cyan" : "text-gray-900"}`}>{value}</span>
    </div>
  )
}
