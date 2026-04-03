import { auth, signIn, signOut } from "@/auth"
import { prisma } from "@/lib/db"
import { adminToggleKpiTask } from "@/lib/actions"
import { KpiTask, Compensation } from "@prisma/client"
import Image from "next/image"
import { calcBonus, calcPOP, type CompanyParams, type CompensationParams } from "@/lib/calculator"

const fmt = (n: number) => Intl.NumberFormat('cs-CZ').format(Math.round(n))
const pct = (n: number) => `${Math.round(n)}%`

export default async function Home() {
  const session = await auth()

  // LOGIN SCREEN
  if (!session?.user?.email) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 text-gray-900 p-6 relative overflow-hidden">
        <div className="absolute -left-40 -top-40 w-[600px] h-[600px] bg-brand-cyan rounded-full opacity-5 blur-[150px]" />
        <div className="absolute right-0 bottom-0 w-[400px] h-[400px] bg-brand-pink rounded-full opacity-5 blur-[120px]" />
        <div className="text-center p-12 border border-gray-200 rounded-[3rem] bg-white shadow-2xl max-w-md w-full border-b-4 border-b-brand-cyan relative z-10">
          <div className="flex justify-center mb-10 mt-4">
            <Image src="/algotech-logo.png" alt="Algotech Logo" width={280} height={84} priority className="opacity-90" />
          </div>
          <h1 className="text-3xl font-black mb-2 tracking-tighter italic uppercase text-gray-900">
            Performance <span className="text-brand-cyan">Cockpit</span>
          </h1>
          <p className="text-gray-400 mb-12 font-medium italic tracking-wide text-sm underline decoration-brand-cyan/40 underline-offset-8">
            Executive Incentives Tracking
          </p>
          <form action={async () => { "use server"; await signIn("google") }}>
            <button className="w-full bg-brand-cyan text-brand-navy font-black py-5 px-8 rounded-2xl hover:bg-brand-pink hover:text-white transition-all shadow-xl active:scale-95 uppercase tracking-[0.2em] text-xs">
              Vstoupit přes Google
            </button>
          </form>
        </div>
      </main>
    )
  }

  // DATA
  let comp: Compensation | null = null
  let kpiTasks: KpiTask[] = []
  let userRole = "MANAGER"
  let userId = ""

  try {
    const userData = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { compensation: true, kpiTasks: { orderBy: { name: "asc" } } },
    })
    if (userData) {
      comp     = userData.compensation
      kpiTasks = userData.kpiTasks
      userRole = userData.role
      userId   = userData.id
    }
  } catch (e) { console.error(e) }

  const params = await prisma.companyParameters.findUnique({ where: { id: "global" } })

  const company: CompanyParams = {
    currentEbitda:     params?.currentEbitda     ?? 0,
    targetEbitda:      params?.targetEbitda      ?? 0,
    currentHorizont:   params?.currentHorizont   ?? 0,
    targetHorizont:    params?.targetHorizont    ?? 0,
    currentMultiplier: params?.currentMultiplier ?? 6,
  }

  const compParams: CompensationParams = {
    targetBonusAnnual:   comp?.targetBonusAnnual   ?? 0,
    bonusWeightEbitda:   comp?.bonusWeightEbitda   ?? 0,
    bonusWeightHorizont: comp?.bonusWeightHorizont ?? 0,
    bonusWeightKpi:      comp?.bonusWeightKpi      ?? 0,
    sharePercent:        comp?.sharePercent        ?? 0,
    grantEbitda:         comp?.grantEbitda         ?? 0,
    grantMultiplier:     comp?.grantMultiplier     ?? 0,
  }

  const bonus    = calcBonus(company, compParams, kpiTasks)
  const popValue = calcPOP(company, compParams)

  const ebitdaAch  = company.targetEbitda  > 0 ? Math.min(1.5, company.currentEbitda  / company.targetEbitda)  : 0
  const horizontAch = company.targetHorizont > 0 ? Math.min(1.5, company.currentHorizont / company.targetHorizont) : 0
  const totalKpiW   = kpiTasks.reduce((s, t) => s + t.weight, 0)
  const doneKpiW    = kpiTasks.filter(t => t.isCompleted).reduce((s, t) => s + t.weight, 0)
  const kpiAch      = totalKpiW > 0 ? doneKpiW / totalKpiW : 0

  const isAdmin = userRole === "ADMIN"

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans selection:bg-brand-cyan/20">

      {/* NAVBAR */}
      <nav className="bg-white/90 backdrop-blur-md border-b border-gray-200 shadow-sm px-8 py-4 flex justify-between items-center sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <Image src="/algotech-logo.png" alt="Algotech" width={200} height={58} className="object-contain" />
          <span className="w-px h-6 bg-gray-200 ml-1" />
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest italic">Cockpit</span>
        </div>
        <div className="flex items-center gap-5">
          {isAdmin && (
            <>
              <a href="/admin/parameters" className="text-gray-400 hover:text-brand-cyan text-[10px] font-black uppercase tracking-widest transition-colors">
                Parameters
              </a>
              <a href="/admin" className="bg-brand-cyan/10 text-brand-cyan border border-brand-cyan/30 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-cyan hover:text-brand-navy transition-all flex items-center gap-2 group">
                <span className="w-1.5 h-1.5 bg-brand-cyan rounded-full animate-pulse group-hover:bg-brand-navy" />
                User Control
              </a>
            </>
          )}
          <div className="text-right hidden sm:block leading-none">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1.5">Executive Unit</p>
            <p className="text-sm font-black text-gray-900 italic">{session.user?.name}</p>
          </div>
          {session.user?.image && (
            <img src={session.user.image} className="w-10 h-10 rounded-full ring-4 ring-brand-cyan/20 border border-brand-cyan/20" referrerPolicy="no-referrer" alt="Profile" />
          )}
          <form action={async () => { "use server"; await signOut() }}>
            <button className="p-2 text-gray-400 hover:text-brand-pink transition-colors uppercase text-[10px] font-black tracking-widest">Exit</button>
          </form>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto py-12 px-6 grid grid-cols-1 lg:grid-cols-3 gap-10">

        {/* LEVÝ SLOUP */}
        <div className="lg:col-span-1 space-y-6">

          <section className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 w-2 h-full bg-brand-cyan opacity-20" />
            <h2 className="font-black text-gray-900 text-base mb-6 uppercase italic underline decoration-brand-cyan decoration-4 underline-offset-8">Compensation</h2>
            {comp ? (
              <div className="space-y-3">
                <Row label="Základní plat / měs." value={`${fmt(comp.baseSalary)} CZK`} />
                <Row label="Roční cílová odměna" value={`${fmt(comp.targetBonusAnnual)} CZK`} accent />
                <div className="pt-3 border-t border-gray-100">
                  <p className="text-[9px] font-black text-brand-cyan/70 uppercase tracking-widest mb-2">Váhy odměny</p>
                  <div className="space-y-1.5">
                    <WeightRow label="EBITDA" value={comp.bonusWeightEbitda} />
                    <WeightRow label="HORIZONT" value={comp.bonusWeightHorizont} />
                    <WeightRow label="KPI úkoly" value={comp.bonusWeightKpi} />
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState text="Odměna zatím nebyla nastavena." />
            )}
          </section>

          <section className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 w-2 h-full bg-brand-pink opacity-20" />
            <h2 className="font-black text-gray-900 text-base mb-6 uppercase italic underline decoration-brand-pink decoration-4 underline-offset-8">Phantom Option Plan</h2>
            {comp ? (
              <div className="space-y-3">
                <Row label="Podíl" value={`${comp.sharePercent}%`} accent />
                <Row label="Grant EBITDA" value={`${fmt(comp.grantEbitda)} CZK`} />
                <Row label="Grant Multiplier" value={`${comp.grantMultiplier}×`} />
                <Row label="Vesting" value={`${comp.vestingYears} roky`} />
                <Row label="Datum grantu" value={new Date(comp.grantDate).toLocaleDateString('cs-CZ')} />
              </div>
            ) : (
              <EmptyState text="POP nebyl nastaven." />
            )}
          </section>
        </div>

        {/* PRAVÝ SLOUP */}
        <div className="lg:col-span-2 space-y-10">

          {/* ROČNÍ BONUS */}
          <section className="bg-white rounded-[3rem] p-10 ring-1 ring-gray-100 shadow-sm relative overflow-hidden">
            <div className="relative z-10">
              <header className="flex justify-between items-start mb-8">
                <div>
                  <h3 className="text-brand-cyan text-[11px] font-black uppercase tracking-[0.4em] mb-1 italic">Roční cílová odměna</h3>
                  <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest">Projekce dle aktuálního plnění</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Celkem projected</p>
                  <p className="font-black text-3xl italic text-brand-cyan">{fmt(bonus.total)} <span className="text-sm opacity-40 not-italic">CZK</span></p>
                  <p className="text-[9px] text-gray-400 mt-1">z cílových {fmt(compParams.targetBonusAnnual)} CZK</p>
                </div>
              </header>

              <div className="space-y-5">
                <BonusBar
                  label="EBITDA složka"
                  achievement={ebitdaAch}
                  payout={bonus.ebitda}
                  current={fmt(company.currentEbitda)}
                  target={fmt(company.targetEbitda)}
                  unit="CZK"
                  color="cyan"
                />
                <BonusBar
                  label="HORIZONT složka"
                  achievement={horizontAch}
                  payout={bonus.horizont}
                  current={fmt(company.currentHorizont)}
                  target={fmt(company.targetHorizont)}
                  unit=""
                  color="pink"
                />
                <BonusBar
                  label="KPI složka"
                  achievement={kpiAch}
                  payout={bonus.kpi}
                  current={`${Math.round(doneKpiW)}%`}
                  target="100%"
                  unit=""
                  color="green"
                />
              </div>
            </div>
            <div className="absolute -right-20 -top-20 w-96 h-96 bg-brand-cyan rounded-full opacity-5 blur-[120px]" />
          </section>

          {/* POP VALUE */}
          <section className="bg-white rounded-[3rem] p-10 ring-1 ring-gray-100 shadow-sm relative overflow-hidden">
            <div className="relative z-10">
              <header className="flex justify-between items-start mb-8">
                <div>
                  <h3 className="text-brand-pink text-[11px] font-black uppercase tracking-[0.4em] mb-1 italic">Phantom Capital Gain</h3>
                  <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest">Aktuální hodnota (Brutto)</p>
                </div>
                <div className="flex items-center gap-2 bg-brand-pink/10 border border-brand-pink/30 rounded-full px-4 py-1.5">
                  <div className="w-2 h-2 bg-brand-pink rounded-full animate-ping" />
                  <span className="text-brand-pink text-[10px] font-black uppercase tracking-[0.2em]">Live</span>
                </div>
              </header>

              <p className="text-6xl md:text-7xl font-black tracking-tighter mb-10 italic text-transparent bg-clip-text bg-gradient-to-br from-brand-navy to-brand-pink">
                {fmt(popValue)} <span className="text-xl font-normal not-italic text-gray-300 ml-1">CZK</span>
              </p>

              <div className="grid grid-cols-3 gap-6 border-t border-gray-100 pt-8 text-sm">
                <div>
                  <p className="text-gray-400 text-[9px] font-black uppercase tracking-widest mb-1">Aktuální hodnota firmy</p>
                  <p className="font-black text-gray-900">{fmt(company.currentEbitda * company.currentMultiplier)}</p>
                  <p className="text-[9px] text-gray-400">{fmt(company.currentEbitda)} × {company.currentMultiplier}×</p>
                </div>
                <div>
                  <p className="text-gray-400 text-[9px] font-black uppercase tracking-widest mb-1">Hodnota při grantu</p>
                  <p className="font-black text-gray-900">{fmt(compParams.grantEbitda * compParams.grantMultiplier)}</p>
                  <p className="text-[9px] text-gray-400">{fmt(compParams.grantEbitda)} × {compParams.grantMultiplier}×</p>
                </div>
                <div>
                  <p className="text-brand-pink text-[9px] font-black uppercase tracking-widest mb-1">Vytvořená hodnota</p>
                  <p className="font-black text-brand-pink">{fmt(Math.max(0, company.currentEbitda * company.currentMultiplier - compParams.grantEbitda * compParams.grantMultiplier))}</p>
                  <p className="text-[9px] text-gray-400">× {compParams.sharePercent}%</p>
                </div>
              </div>
            </div>
            <div className="absolute -left-20 -bottom-20 w-80 h-80 bg-brand-pink rounded-full opacity-5 blur-[100px]" />
          </section>

          {/* KPI ÚKOLY */}
          <section className="bg-white rounded-[3rem] p-10 border border-gray-100 shadow-sm">
            <header className="flex justify-between items-center mb-8 border-b border-gray-100 pb-6">
              <h2 className="font-black text-gray-900 text-xl uppercase italic underline decoration-brand-green decoration-4 underline-offset-8">
                KPI <span className="text-brand-green">Úkoly</span>
              </h2>
              <div className="text-right">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Splněno</p>
                <p className="font-black text-brand-green text-lg">{pct(doneKpiW)} <span className="text-xs text-gray-300">/ {pct(totalKpiW)}</span></p>
              </div>
            </header>

            {kpiTasks.length === 0 ? (
              <EmptyState text="Žádné KPI úkoly zatím nebyly přiřazeny." />
            ) : (
              <div className="space-y-3">
                {kpiTasks.map(t => (
                  <div key={t.id} className={`flex items-center justify-between p-5 rounded-2xl border transition-all ${t.isCompleted ? 'bg-brand-green/10 border-brand-green/20' : 'bg-gray-50 border-gray-200'}`}>
                    <div className="flex items-center gap-4">
                      <div className={`w-3 h-3 rounded-full flex-shrink-0 ${t.isCompleted ? 'bg-brand-green' : 'bg-gray-300'}`} />
                      <p className={`font-black text-sm uppercase tracking-tight ${t.isCompleted ? 'text-brand-green italic' : 'text-gray-900'}`}>{t.name}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[9px] font-black text-brand-cyan bg-gray-100 px-3 py-1 rounded-full border border-gray-200">{t.weight}%</span>
                      {isAdmin && (
                        <form action={adminToggleKpiTask.bind(null, t.id, t.isCompleted, userId)}>
                          <button className={`text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-wider border transition-all ${t.isCompleted ? 'border-brand-green/30 text-brand-green hover:bg-brand-green/20' : 'border-gray-200 text-gray-400 hover:border-brand-cyan hover:text-brand-cyan'}`}>
                            {t.isCompleted ? 'Splněno' : 'Čeká'}
                          </button>
                        </form>
                      )}
                      {!isAdmin && (
                        <span className={`text-[9px] font-black px-3 py-1 rounded-full uppercase border ${t.isCompleted ? 'border-brand-green/30 text-brand-green' : 'border-gray-200 text-gray-400'}`}>
                          {t.isCompleted ? 'Splněno' : 'Čeká'}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}

// --- Sub-komponenty ---

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex justify-between items-center bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
      <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{label}</span>
      <span className={`font-black text-sm ${accent ? 'text-brand-cyan' : 'text-gray-900'}`}>{value}</span>
    </div>
  )
}

function WeightRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</span>
      <span className="text-[10px] font-black text-brand-cyan">{value}%</span>
    </div>
  )
}

function BonusBar({ label, achievement, payout, current, target, unit, color }: {
  label: string; achievement: number; payout: number
  current: string; target: string; unit: string; color: 'cyan' | 'pink' | 'green'
}) {
  const barPct = Math.min(100, achievement * 100)
  const colorMap = {
    cyan:  { bar: 'bg-brand-cyan',  text: 'text-brand-cyan',  border: 'border-brand-cyan/20'  },
    pink:  { bar: 'bg-brand-pink',  text: 'text-brand-pink',  border: 'border-brand-pink/20'  },
    green: { bar: 'bg-brand-green', text: 'text-brand-green', border: 'border-brand-green/20' },
  }
  const c = colorMap[color]
  return (
    <div className={`bg-gray-50 rounded-2xl p-5 border ${c.border}`}>
      <div className="flex justify-between items-center mb-3">
        <span className={`text-[10px] font-black uppercase tracking-widest ${c.text}`}>{label}</span>
        <span className="font-black text-gray-900 text-sm">{Intl.NumberFormat('cs-CZ').format(Math.round(payout))} CZK</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden mb-2">
        <div className={`h-full ${c.bar} rounded-full transition-all`} style={{ width: `${barPct}%` }} />
      </div>
      <div className="flex justify-between">
        <span className="text-[9px] text-gray-400 font-bold">{current} {unit}</span>
        <span className="text-[9px] text-gray-400 font-bold">Cíl: {target} {unit}</span>
      </div>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="py-10 text-center border-4 border-dotted border-gray-200 rounded-2xl">
      <p className="text-gray-400 font-black italic text-xs uppercase tracking-widest">{text}</p>
      <p className="text-gray-300 text-[10px] mt-1">Kontaktujte administrátora.</p>
    </div>
  )
}
