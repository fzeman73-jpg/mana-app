import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { redirect, notFound } from "next/navigation"
import Image from "next/image"
import {
  updatePopPlan, deletePopPlan,
  createPopBooster, evaluatePopBooster, revokePopBooster, deletePopBooster,
  upsertPopYearData, deletePopYearData,
  upsertPopAssignment, deletePopAssignment,
  markPopPaymentPaid, markPopPaymentUnpaid,
} from "@/lib/actions"
import { calcPOP, calcVestingSchedule } from "@/lib/calculator"

const fmt = (n: number) => Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(Math.round(n))

type PopBooster    = { id: string; name: string; description: string | null; multiplierBoost: number; isAchieved: boolean; achievedAt: Date | null; achievedNote: string | null }
type PopYearData   = { id: string; year: number; currentEbitda: number }
type PopPaymentRow = { id: string; vestingYear: number; isPaid: boolean; paidAt: Date | null; amount: number | null }
type PopAssign     = {
  id: string; userId: string; sharePercent: number; grantDate: Date; grantEbitda: number  // per-assignment override; falls back to plan.grantEbitda
  payments: PopPaymentRow[]
  user: { id: string; name: string | null; email: string | null; divisionId: string | null }
}
type PopPlanFull   = {
  id: string; name: string; description: string | null
  baseMultiplier: number; grantEbitda: number
  vestingGranularity: string; vestingYears: number
  vestingPaymentDay: number; vestingPaymentMonth: number; vestingQuarters: number
  minGrowthPercent: number
  boosters:    PopBooster[]
  yearData:    PopYearData[]
  assignments: PopAssign[]
}

export default async function PopPlanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const caller  = await prisma.user.findUnique({ where: { email: session?.user?.email || "" } })
  if (caller?.role !== "ADMIN") redirect("/")

  const { id } = await params

  const plan = await prisma.popPlan.findUnique({
    where:   { id },
    include: {
      boosters:    { orderBy: { name: "asc" } },
      yearData:    { orderBy: { year: "asc" } },
      assignments: {
        include: {
          user:     { select: { id: true, name: true, email: true, divisionId: true } },
          payments: { orderBy: { vestingYear: "asc" } },
        },
        orderBy: { grantDate: "asc" },
      },
    },
  })

  if (!plan) notFound()

  // Users not yet assigned for the add-assignment form
  const allUsers = await prisma.user.findMany({
    where:   { isAllowed: true },
    orderBy: { name: "asc" },
    select:  { id: true, name: true, email: true },
  })
  const assignedUserIds = new Set(plan.assignments.map(a => a.userId))
  const unassignedUsers = allUsers.filter(u => !assignedUserIds.has(u.id))

  const curYear = new Date().getFullYear()

  // Latest EBITDA for POP calculation
  const latestYearData = plan.yearData.at(-1)

  return (
    <div className="min-h-screen bg-gray-50 font-sans selection:bg-brand-cyan/20">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
        <div className="px-4 sm:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <a href="/"><Image src="/algotech-logo.png" alt="Algotech" width={130} height={38} className="object-contain" /></a>
            <div className="w-px h-6 bg-gray-200 hidden sm:block" />
            <div className="hidden sm:block">
              <p className="text-sm font-black text-brand-cyan uppercase tracking-tight">{plan.name}</p>
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">POP plán</p>
            </div>
          </div>
          <div className="flex items-center gap-4 sm:gap-6">
            <a href="/admin/parameters?tab=manageri" className="text-gray-400 hover:text-brand-cyan text-xs font-black uppercase tracking-widest transition-all px-2 py-1 rounded-lg hover:ring-2 hover:ring-brand-cyan hidden sm:block">Plány</a>
            <a href="/admin/reports" className="text-gray-400 hover:text-brand-cyan text-xs font-black uppercase tracking-widest transition-all px-2 py-1 rounded-lg hover:ring-2 hover:ring-brand-cyan hidden sm:block">Reporty</a>
            <a href="/admin/pop" className="bg-brand-cyan/10 text-brand-cyan border border-brand-cyan/30 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest">← POP</a>
            <a href="/admin" className="text-gray-400 hover:text-brand-cyan text-xs font-black uppercase tracking-widest transition-all px-2 py-1 rounded-lg hover:ring-2 hover:ring-brand-cyan hidden sm:block">Uživatelé</a>
            <a href="/" className="text-gray-400 hover:text-brand-cyan text-xs font-black uppercase tracking-widest transition-all px-2 py-1 rounded-lg hover:ring-2 hover:ring-brand-cyan">← Cockpit</a>
          </div>
        </div>
      </nav>
      <div className="max-w-3xl mx-auto p-8 space-y-8">

        {/* NASTAVENÍ PLÁNU */}
        <section className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
          <h2 className="text-[11px] font-black text-brand-cyan uppercase tracking-[0.3em] italic mb-2">Nastavení plánu</h2>
          <p className="text-xs text-gray-400 mb-6">
            POP (Phantom Option Plan) odměňuje manažera za <span className="font-black text-gray-600">nárůst hodnoty firmy</span> od okamžiku vstupu do plánu.
            Nárok na výplatu vzniká až po uplynutí vestingové doby — do té doby jsou všechna čísla pouze <span className="font-black text-gray-600">průběžnou projekcí</span>.
          </p>

          {/* Přehledová legenda */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6 p-4 bg-gray-50 border border-gray-200 rounded-2xl text-[11px] text-gray-500 leading-relaxed">
            <div>
              <p className="font-black text-gray-700 mb-1">Hodnota firmy při grantu</p>
              <p>= Vstupní EBITDA × Základní multiplikátor</p>
              <p className="text-brand-cyan font-black mt-1">
                {plan.grantEbitda > 0 ? `${fmt(plan.grantEbitda)} × ${plan.baseMultiplier} = ${fmt(plan.grantEbitda * plan.baseMultiplier)}` : "—"}
              </p>
            </div>
            <div>
              <p className="font-black text-gray-700 mb-1">Aktuální hodnota firmy</p>
              <p>= Aktuální EBITDA (z Ročních dat) × (Základní multiplikátor + Boostery)</p>
              <p className="text-brand-cyan font-black mt-1">viz sekce Roční EBITDA níže</p>
            </div>
            <div>
              <p className="font-black text-gray-700 mb-1">Hrubý zisk manažera</p>
              <p>= (Aktuální − Grant) × Podíl %, ale pouze pokud je splněna podmínka min. růstu a uplynula vestingová doba</p>
            </div>
          </div>

          <form action={updatePopPlan.bind(null, plan.id)} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5 ml-1">Název plánu</label>
                <input
                  name="name" required defaultValue={plan.name}
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3.5 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all text-gray-900"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5 ml-1">Popis (volitelné)</label>
                <input
                  name="description" placeholder="Krátký popis plánu" defaultValue={plan.description ?? ""}
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3.5 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all placeholder:text-gray-400 text-gray-900"
                />
              </div>
            </div>

            {/* Řádek 1: Hodnota firmy při grantu */}
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5 ml-1">Vstupní EBITDA (CZK)</label>
                <input
                  name="grantEbitda" type="number" step="0.01" defaultValue={plan.grantEbitda} required
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3.5 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all text-gray-900"
                />
                <p className="text-[10px] text-gray-400 mt-1 ml-1">{fmt(plan.grantEbitda)}</p>
                <p className="text-[9px] text-gray-400 mt-0.5 ml-1">EBITDA firmy v době vzniku plánu — základ pro výpočet hodnoty firmy při grantu</p>
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5 ml-1">Základní multiplikátor</label>
                <input
                  name="baseMultiplier" type="number" step="0.1" defaultValue={plan.baseMultiplier} required
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3.5 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all text-gray-900"
                />
                <p className="text-[9px] text-gray-400 mt-0.5 ml-1">Tržní násobek EBITDA pro ocenění firmy (např. 6× = firma se oceňuje na 6× EBITDA)</p>
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5 ml-1">Min. růst hodnoty (%)</label>
                <input
                  name="minGrowthPercent" type="number" step="0.1" min="0" defaultValue={plan.minGrowthPercent}
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3.5 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all text-gray-900"
                />
                <p className="text-[9px] text-gray-400 mt-0.5 ml-1">
                  Hurdle rate — pokud hodnota firmy nevzrostla alespoň o toto % oproti grantu, nárok je 0. Zadej 0 pro žádnou podmínku.
                </p>
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5 ml-1">Frekvence vyplácení</label>
                <select
                  name="vestingGranularity" defaultValue={plan.vestingGranularity}
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3.5 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all text-gray-900"
                >
                  <option value="YEARLY">Ročně</option>
                  <option value="QUARTERLY">Čtvrtletně</option>
                </select>
                <p className="text-[9px] text-gray-400 mt-0.5 ml-1">Jak často se vyplácejí jednotlivé splátky po uplynutí vestingové doby</p>
              </div>
            </div>

            {/* Řádek 2: Vestingová doba */}
            {plan.vestingGranularity === "QUARTERLY" ? (
              <div className="grid grid-cols-2 gap-3 p-4 bg-brand-cyan/5 border border-brand-cyan/20 rounded-2xl">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5 ml-1">Počet kvartálů</label>
                  <input
                    name="vestingQuarters" type="number" min="1" max="40" defaultValue={plan.vestingQuarters} required
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all text-gray-900"
                  />
                </div>
                <div className="flex items-end pb-0.5">
                  <p className="text-[10px] text-gray-500 leading-relaxed">
                    Splátky 15. den měsíce po konci každého kvartálu<br />
                    (Q1→15.4., Q2→15.7., Q3→15.10., Q4→15.1.)<br />
                    <span className="text-brand-cyan font-black">Každá splátka: {plan.vestingQuarters > 0 ? Math.round(100 / plan.vestingQuarters * 10) / 10 : 0}% · Celkem: 100%</span>
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-brand-cyan/5 border border-brand-cyan/20 rounded-2xl space-y-3">
                <p className="text-[10px] font-black text-brand-cyan uppercase tracking-widest">Vestingová doba a termíny vyplácení</p>
                <p className="text-[11px] text-gray-500">
                  Manažer získá nárok na výplatu až po uplynutí vestingové doby od data svého grantu (viz Přiřazení níže).
                  Hrubý zisk se dělí rovnoměrně na roční splátky — každá splátka se vyplácí v zadaný den a měsíc roku po uplynutí příslušného roku vestingu.
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5 ml-1">Délka vestingu (roky)</label>
                    <input
                      name="vestingYears" type="number" min="1" max="10" defaultValue={plan.vestingYears} required
                      className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all text-gray-900"
                    />
                    <p className="text-[9px] text-gray-400 mt-0.5 ml-1">Počet let od grantu, po které je výplata rozložena. Každý rok = 1 splátka ({plan.vestingYears > 0 ? Math.round(100/plan.vestingYears) : 0}% z celku)</p>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5 ml-1">Den vyplacení</label>
                    <input
                      name="vestingPaymentDay" type="number" min="1" max="28" defaultValue={plan.vestingPaymentDay} required
                      className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all text-gray-900"
                    />
                    <p className="text-[9px] text-gray-400 mt-0.5 ml-1">Den v měsíci výplaty každé roční splátky</p>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5 ml-1">Měsíc vyplacení</label>
                    <select
                      name="vestingPaymentMonth" defaultValue={plan.vestingPaymentMonth}
                      className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all text-gray-900"
                    >
                      {["Leden","Únor","Březen","Duben","Květen","Červen","Červenec","Srpen","Září","Říjen","Listopad","Prosinec"].map((m, i) => (
                        <option key={i+1} value={i+1}>{m}</option>
                      ))}
                    </select>
                    <p className="text-[9px] text-gray-400 mt-0.5 ml-1">Měsíc výplaty každé roční splátky (např. Květen = výplata 1.5. každého roku)</p>
                  </div>
                </div>
              </div>
            )}
            <button type="submit" className="bg-brand-cyan text-brand-navy px-6 py-3.5 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-brand-pink hover:text-white transition-all shadow-sm active:scale-95">
              Uložit
            </button>
          </form>
        </section>

        {/* ROČNÍ EBITDA */}
        <section className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
          <h2 className="text-[11px] font-black text-brand-cyan uppercase tracking-[0.3em] italic mb-6">Roční EBITDA</h2>
          <p className="text-[10px] text-gray-400 mb-4 ml-1">Admin každý rok aktualizuje aktuální EBITDA pro výpočet hodnoty firmy v daném roce.</p>

          {plan.yearData.length > 0 && (
            <div className="space-y-2 mb-4">
              {plan.yearData.map(yd => (
                <div key={yd.id} className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3">
                  <span className="font-black text-brand-cyan text-sm w-16">{yd.year}</span>
                  <span className="flex-1 font-bold text-gray-900 text-sm">{fmt(yd.currentEbitda)}</span>
                  <form action={deletePopYearData.bind(null, yd.id, plan.id)}>
                    <button type="submit" className="text-[9px] font-black text-gray-400 hover:text-brand-pink transition-colors uppercase tracking-widest px-2 py-1">
                      Smazat
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}

          <form action={upsertPopYearData.bind(null, plan.id)} className="flex gap-3">
            <input
              name="year" type="number" placeholder="Rok" defaultValue={curYear} required
              className="w-24 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all text-gray-900"
            />
            <input
              name="currentEbitda" type="number" step="0.01" placeholder="EBITDA (CZK)" required
              className="flex-1 bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3.5 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all placeholder:text-gray-400 text-gray-900"
            />
            <button type="submit" className="bg-brand-cyan text-brand-navy px-6 py-3.5 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-brand-pink hover:text-white transition-all shadow-sm active:scale-95">
              Uložit
            </button>
          </form>
        </section>

        {/* STRATEGICKÉ BOOSTERY */}
        <section className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
          <h2 className="text-[11px] font-black text-brand-cyan uppercase tracking-[0.3em] italic mb-6">Strategické boostery</h2>
          <p className="text-[10px] text-gray-400 mb-4 ml-1">Boostery navyšují multiplikátor firmy při splnění podmínek.</p>

          {plan.boosters.length === 0 && (
            <p className="text-sm text-gray-400 italic mb-4">Zatím nejsou přidány žádné boostery.</p>
          )}

          <div className="space-y-3 mb-4">
            {plan.boosters.map(b => (
              <div key={b.id} className={`rounded-2xl border overflow-hidden ${b.isAchieved ? "border-brand-green/30 bg-brand-green/5" : "border-gray-200 bg-gray-50"}`}>
                {/* Hlavička boosteru */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-black text-gray-900 text-sm">{b.name}</p>
                      {b.isAchieved && b.achievedAt && (
                        <span className="text-[9px] font-black text-brand-green bg-brand-green/10 px-2 py-0.5 rounded-full">
                          Splněn {new Date(b.achievedAt).toLocaleDateString("cs-CZ")}
                        </span>
                      )}
                    </div>
                    {b.description && <p className="text-[10px] text-gray-400 mt-0.5">{b.description}</p>}
                    {b.isAchieved && b.achievedNote && (
                      <p className="text-[10px] text-brand-green font-bold mt-1 italic">„{b.achievedNote}"</p>
                    )}
                  </div>
                  <span className="text-[10px] font-black text-brand-pink flex-shrink-0">+{b.multiplierBoost}×</span>
                  {b.isAchieved && (
                    <form action={revokePopBooster.bind(null, b.id, plan.id)}>
                      <button type="submit" className="px-3 py-1.5 rounded-xl font-black uppercase text-[8px] tracking-widest border bg-gray-100 text-gray-400 border-gray-200 hover:border-brand-pink hover:text-brand-pink transition-all active:scale-95 flex-shrink-0">
                        Odvolat
                      </button>
                    </form>
                  )}
                  <form action={deletePopBooster.bind(null, b.id, plan.id)}>
                    <button type="submit" className="text-[9px] font-black text-gray-400 hover:text-brand-pink transition-colors px-2 py-1 flex-shrink-0">×</button>
                  </form>
                </div>
                {/* Formulář vyhodnocení — jen pokud nesplněn */}
                {!b.isAchieved && (
                  <form action={evaluatePopBooster.bind(null, b.id, plan.id)} className="flex items-center gap-2 px-4 pb-3 flex-wrap">
                    <input
                      name="achievedAt" type="date"
                      defaultValue={new Date().toISOString().slice(0, 10)}
                      className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-900 outline-none focus:ring-2 ring-brand-cyan"
                    />
                    <input
                      name="achievedNote" placeholder="Poznámka k vyhodnocení (volitelné)"
                      className="flex-1 min-w-[180px] bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-900 outline-none focus:ring-2 ring-brand-cyan placeholder:text-gray-400"
                    />
                    <button type="submit" className="px-4 py-2 rounded-xl font-black uppercase text-[8px] tracking-widest bg-brand-green/10 text-brand-green border border-brand-green/30 hover:bg-brand-green hover:text-white transition-all active:scale-95 flex-shrink-0">
                      Označit jako splněn
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>

          <form action={createPopBooster.bind(null, plan.id)} className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              name="name" required placeholder="Název boosteru"
              className="bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3.5 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all placeholder:text-gray-400 text-gray-900"
            />
            <input
              name="description" placeholder="Podmínka (volitelné)"
              className="bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3.5 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all placeholder:text-gray-400 text-gray-900"
            />
            <div className="flex gap-2">
              <input
                name="multiplierBoost" type="number" step="0.1" min="0" placeholder="+× boost" required
                className="flex-1 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all placeholder:text-gray-400 text-gray-900"
              />
              <button type="submit" className="bg-brand-cyan text-brand-navy px-4 py-3.5 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-brand-pink hover:text-white transition-all shadow-sm active:scale-95">
                +
              </button>
            </div>
          </form>
        </section>

        {/* PŘIŘAZENÍ UŽIVATELŮ */}
        <section className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
          <h2 className="text-[11px] font-black text-brand-cyan uppercase tracking-[0.3em] italic mb-6">Přiřazení manažeři</h2>

          {plan.assignments.map(a => {
            const effectiveGrantEbitda = a.grantEbitda > 0 ? a.grantEbitda : plan.grantEbitda
            const pop = latestYearData ? calcPOP({
              sharePercent:     a.sharePercent,
              grantEbitda:      effectiveGrantEbitda,
              grantMultiplier:  plan.baseMultiplier,
              currentEbitda:    latestYearData.currentEbitda,
              baseMultiplier:   plan.baseMultiplier,
              boosters:         plan.boosters.map(b => ({ multiplierBoost: b.multiplierBoost, isAchieved: b.isAchieved })),
              minGrowthPercent: plan.minGrowthPercent,
            }) : null

            const schedule = pop ? calcVestingSchedule({
              grossGain:           pop.grossGain,
              granularity:         plan.vestingGranularity as "YEARLY" | "QUARTERLY",
              vestingYears:        plan.vestingYears,
              vestingPaymentDay:   plan.vestingPaymentDay,
              vestingPaymentMonth: plan.vestingPaymentMonth,
              vestingQuarters:     plan.vestingQuarters,
              grantYear:           new Date(a.grantDate).getFullYear(),
            }) : []

            return (
              <div key={a.id} className="mb-6 bg-gray-50 border border-gray-200 rounded-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200">
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-gray-900 text-sm italic uppercase truncate">
                      {a.user.name ?? a.user.email ?? "—"}
                    </p>
                    <p className="text-[10px] text-brand-cyan font-bold mt-0.5">
                      {a.sharePercent}% podíl · grant {new Date(a.grantDate).getFullYear()}
                      {a.grantEbitda > 0 && ` · EBITDA při grantu ${fmt(a.grantEbitda)}`}
                    </p>
                  </div>
                  {pop && (
                    <div className="text-right flex-shrink-0">
                      <p className="text-[10px] text-gray-400 uppercase tracking-widest font-black">Aktuální hodnota POP</p>
                      <p className="font-black text-brand-cyan text-base">{fmt(pop.grossGain)}</p>
                    </div>
                  )}
                </div>

                {/* Edit form */}
                <div className="px-5 py-4 border-b border-gray-200">
                  <form action={upsertPopAssignment.bind(null, plan.id)} className="grid grid-cols-3 gap-3 items-end">
                    <input type="hidden" name="userId" value={a.userId} />
                    <input type="hidden" name="grantEbitda" value={plan.grantEbitda} />
                    <div>
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1 ml-1">Podíl %</label>
                      <input
                        name="sharePercent" type="number" step="0.01" defaultValue={a.sharePercent}
                        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all text-gray-900"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1 ml-1">Datum grantu</label>
                      <input
                        name="grantDate" type="date" defaultValue={new Date(a.grantDate).toISOString().split("T")[0]}
                        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all text-gray-900"
                      />
                    </div>
                    <div className="flex gap-2 items-end">
                      <button type="submit" className="flex-1 bg-brand-cyan text-brand-navy px-4 py-2.5 rounded-xl font-black uppercase text-[9px] tracking-widest hover:bg-brand-pink hover:text-white transition-all shadow-sm active:scale-95">
                        Uložit
                      </button>
                    </div>
                  </form>
                  <form action={deletePopAssignment.bind(null, a.id, plan.id)} className="mt-2">
                    <button type="submit" className="text-[9px] font-black text-gray-400 hover:text-brand-pink transition-colors uppercase tracking-widest px-1 py-1">
                      Odebrat přiřazení
                    </button>
                  </form>
                </div>

                {/* Vesting schedule */}
                {schedule.length > 0 && (
                  <div className="px-5 py-4">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Vesting splátky</p>
                    <div className="space-y-2">
                      {schedule.map(s => {
                        const payment = a.payments.find(p => p.vestingYear === s.index)
                        return (
                          <div key={s.index} className="flex items-center gap-3 text-sm">
                            <div className="min-w-0 flex-1">
                              <span className="font-black text-brand-cyan text-[10px]">{s.label}</span>
                              <span className="text-[9px] text-gray-400 ml-2">{s.payDate}</span>
                              <span className="font-bold text-gray-700 ml-3">{fmt(s.amount)}</span>
                            </div>
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest flex-shrink-0 ${
                              payment?.isPaid ? "bg-brand-green/10 text-brand-green" : "bg-gray-100 text-gray-400"
                            }`}>
                              {payment?.isPaid ? `Vyplaceno ${payment.paidAt ? new Date(payment.paidAt).toLocaleDateString("cs-CZ") : ""}` : "Nevyplaceno"}
                            </span>
                            {payment?.isPaid ? (
                              <form action={markPopPaymentUnpaid.bind(null, a.id, s.index, plan.id)}>
                                <button type="submit" className="text-[9px] font-black text-gray-400 hover:text-brand-pink transition-colors uppercase tracking-widest px-2 py-0.5">
                                  Zrušit
                                </button>
                              </form>
                            ) : (
                              <form action={markPopPaymentPaid.bind(null, a.id, s.index)} className="flex gap-1.5 items-center">
                                <input
                                  name="amount" type="number" step="0.01" placeholder="Částka"
                                  className="w-28 bg-white border border-gray-200 rounded-lg px-3 py-1.5 font-bold text-xs outline-none focus:ring-1 ring-brand-cyan transition-all placeholder:text-gray-400 text-gray-900"
                                />
                                <button type="submit" className="bg-brand-green/10 text-brand-green border border-brand-green/30 px-2 py-1.5 rounded-lg font-black uppercase text-[8px] tracking-widest hover:bg-brand-green hover:text-brand-navy transition-all active:scale-95">
                                  Zaplatit
                                </button>
                              </form>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {unassignedUsers.length > 0 && (
            <form action={upsertPopAssignment.bind(null, plan.id)} className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-4 items-end">
              <input type="hidden" name="grantEbitda" value={plan.grantEbitda} />
              <div className="md:col-span-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5 ml-1">Manažer</label>
                <select
                  name="userId" required
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3.5 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all text-gray-900"
                >
                  <option value="">— Vyberte —</option>
                  {unassignedUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.name ?? u.email ?? "?"}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5 ml-1">Podíl %</label>
                <input
                  name="sharePercent" type="number" step="0.01" min="0" max="100" placeholder="0"
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all placeholder:text-gray-400 text-gray-900"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5 ml-1">Datum grantu</label>
                <input
                  name="grantDate" type="date" defaultValue={new Date().toISOString().split("T")[0]}
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all text-gray-900"
                />
              </div>
              <div className="flex items-end">
                <button type="submit" className="w-full bg-brand-cyan text-brand-navy px-6 py-3.5 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-brand-pink hover:text-white transition-all shadow-sm active:scale-95">
                  Přiřadit
                </button>
              </div>
            </form>
          )}
        </section>

        {/* NEBEZPEČNÁ ZÓNA */}
        <section className="bg-white p-8 rounded-[2.5rem] border border-brand-pink/20 shadow-sm">
          <h2 className="text-[11px] font-black text-brand-pink uppercase tracking-[0.3em] italic mb-6">Nebezpečná zóna</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-black text-gray-900 text-sm">Smazat POP plán</p>
              <p className="text-[11px] text-gray-400 mt-1">Trvale odstraní plán včetně boosterů, ročních dat a přiřazení.</p>
            </div>
            <form action={deletePopPlan.bind(null, plan.id)}>
              <button type="submit" className="bg-brand-pink/10 text-brand-pink border border-brand-pink/30 px-6 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-brand-pink hover:text-white transition-all active:scale-95">
                Smazat
              </button>
            </form>
          </div>
        </section>

      </div>
    </div>
  )
}
