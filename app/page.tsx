import { auth, signIn, signOut } from "@/auth"
import { prisma } from "@/lib/db"
import { toggleMetric } from "@/lib/actions"
import { StrategicMetric, Compensation } from "@prisma/client"
import Image from "next/image"

export default async function Home() {
  const session = await auth()

  // 1. LOGIN SCREEN
  if (!session?.user?.email) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-brand-navy text-white p-6 relative overflow-hidden">
        <div className="absolute -left-40 -top-40 w-[600px] h-[600px] bg-brand-cyan rounded-full opacity-5 blur-[150px]"></div>
        <div className="absolute right-0 bottom-0 w-[400px] h-[400px] bg-brand-pink rounded-full opacity-5 blur-[120px]"></div>

        <div className="text-center p-12 border border-brand-cyan/20 rounded-[3rem] bg-brand-navy-card shadow-2xl max-w-md w-full border-b-4 border-b-brand-cyan relative z-10">

          <div className="flex justify-center mb-10 mt-4">
            <Image
              src="/algotech-logo.png"
              alt="Algotech Logo"
              width={280}
              height={84}
              priority
              className="opacity-90"
            />
          </div>

          <h1 className="text-3xl font-black mb-2 tracking-tighter italic uppercase text-white">Performance <span className="text-brand-cyan">Cockpit</span></h1>
          <p className="text-white/30 mb-12 font-medium italic tracking-wide text-sm underline decoration-brand-cyan/20 underline-offset-8">Executive Incentives Tracking</p>

          <form action={async () => { "use server"; await signIn("google") }}>
            <button className="w-full bg-brand-cyan text-brand-navy font-black py-5 px-8 rounded-2xl hover:bg-brand-pink hover:text-white transition-all shadow-xl active:scale-95 uppercase tracking-[0.2em] text-xs">
              Vstoupit přes Google
            </button>
          </form>
        </div>
      </main>
    )
  }

  const userEmail = session.user.email

  // 2. NAČTENÍ DAT
  let comp: Compensation | null = null
  let metrics: StrategicMetric[] = []
  let userRole = "MANAGER"

  try {
    const userData = await prisma.user.findUnique({
      where: { email: userEmail },
      include: { compensation: true, metrics: true }
    })
    if (userData) {
      comp     = userData.compensation
      metrics  = userData.metrics
      userRole = userData.role
    }
  } catch (error) {
    console.error("Database sync error:", error)
  }

  // 3. GLOBÁLNÍ NASTAVENÍ + VÝPOČETNÍ LOGIKA
  const globalSettings    = await prisma.globalSettings.findUnique({ where: { id: "global" } })
  const currentEbitda     = globalSettings?.currentEbitda  ?? 50000000
  const baseMultiplier    = globalSettings?.baseMultiplier ?? 6.0
  const bonusMultiplier   = metrics.filter(m => m.isCompleted).reduce((sum, m) => sum + m.multiplierImpact, 0)
  const effectiveMultiplier = baseMultiplier + bonusMultiplier
  const currentVal        = currentEbitda * effectiveMultiplier
  const grantVal          = (comp?.grantEbitda || 0) * (comp?.grantMultiplier || 0)
  const popPayout         = Math.max(0, (currentVal - grantVal) * ((comp?.popUnits || 0) / 100))

  return (
    <div className="min-h-screen bg-brand-navy text-white font-sans selection:bg-brand-cyan/20">

      {/* NAVBAR */}
      <nav className="bg-brand-navy/90 backdrop-blur-md border-b border-brand-cyan/10 px-8 py-4 flex justify-between items-center sticky top-0 z-30 shadow-lg">
        <div className="flex items-center gap-3">
          <Image
            src="/algotech-logo.png"
            alt="Algotech"
            width={200}
            height={58}
            className="object-contain"
          />
          <span className="w-px h-6 bg-brand-cyan/20 ml-1"></span>
          <span className="text-[10px] font-black text-brand-cyan/40 uppercase tracking-widest italic">Cockpit</span>
        </div>

        <div className="flex items-center gap-6">
          {userRole === "ADMIN" && (
            <a
              href="/admin"
              className="bg-brand-cyan/10 text-brand-cyan border border-brand-cyan/30 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-cyan hover:text-brand-navy transition-all flex items-center gap-2 group"
            >
              <span className="w-1.5 h-1.5 bg-brand-cyan rounded-full animate-pulse group-hover:bg-brand-navy"></span>
              User Control
            </a>
          )}

          <div className="text-right hidden sm:block leading-none">
            <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-1.5">Executive Unit</p>
            <p className="text-sm font-black text-white italic">{session.user?.name}</p>
          </div>

          {session.user?.image && (
            <img src={session.user.image} className="w-10 h-10 rounded-full ring-4 ring-brand-cyan/20 shadow-md border border-brand-cyan/20" referrerPolicy="no-referrer" alt="Profile" />
          )}

          <form action={async () => { "use server"; await signOut() }}>
            <button className="p-2 text-white/20 hover:text-brand-pink transition-colors uppercase text-[10px] font-black tracking-widest">
              Exit
            </button>
          </form>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto py-12 px-6 grid grid-cols-1 lg:grid-cols-3 gap-12">

        {/* LEVÝ SLOUP: PŘEHLED ODMĚNY (READ-ONLY) */}
        <div className="lg:col-span-1 space-y-8">
          <section className="bg-brand-navy-card p-8 rounded-[2.5rem] shadow-lg border border-brand-cyan/10 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-2 h-full bg-brand-cyan opacity-20"></div>
            <h2 className="font-black text-white text-xl mb-8 tracking-tight uppercase italic underline decoration-brand-cyan decoration-4 underline-offset-8">Compensation</h2>

            {comp ? (
              <div className="space-y-4">
                <div className="bg-brand-navy rounded-2xl px-6 py-4 border border-brand-cyan/10">
                  <p className="text-[10px] font-black text-brand-cyan/60 uppercase tracking-widest mb-1">Monthly Base (CZK)</p>
                  <p className="font-black text-white text-lg">{Intl.NumberFormat('cs-CZ').format(comp.baseSalary)}</p>
                </div>
                <div className="bg-brand-navy rounded-2xl px-6 py-4 border border-brand-cyan/10">
                  <p className="text-[10px] font-black text-brand-cyan/60 uppercase tracking-widest mb-1">Annual Bonus Target (CZK)</p>
                  <p className="font-black text-white text-lg">{Intl.NumberFormat('cs-CZ').format(comp.targetBonusAnnual)}</p>
                </div>

                <div className="pt-6 mt-6 border-t border-brand-cyan/10">
                  <p className="text-[10px] font-black text-brand-cyan uppercase tracking-[0.3em] mb-4 text-center italic">POP Configuration</p>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center bg-brand-navy-deep p-4 rounded-2xl border border-brand-cyan/10">
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Share %</span>
                      <span className="font-black text-brand-cyan text-lg">{comp.popUnits}%</span>
                    </div>
                    <div className="flex justify-between items-center bg-brand-navy p-4 rounded-2xl border border-brand-cyan/10">
                      <span className="text-[10px] font-bold text-white/40 uppercase">Grant EBITDA</span>
                      <span className="font-black text-white">{Intl.NumberFormat('cs-CZ').format(comp.grantEbitda)}</span>
                    </div>
                    <div className="flex justify-between items-center bg-brand-navy p-4 rounded-2xl border border-brand-cyan/10">
                      <span className="text-[10px] font-bold text-white/40 uppercase">Grant Multiplier</span>
                      <span className="font-black text-white">{comp.grantMultiplier}x</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center border-4 border-dotted border-brand-cyan/10 rounded-[2rem]">
                <p className="text-white/20 font-black italic text-sm uppercase tracking-widest">Odměna zatím nebyla nastavena.</p>
                <p className="text-white/10 text-xs mt-2">Kontaktujte administrátora.</p>
              </div>
            )}
          </section>
        </div>

        {/* PRAVÝ SLOUP: DASHBOARD */}
        <div className="lg:col-span-2 space-y-12">

          {/* PHANTOM CAPITAL GAIN */}
          <div className="bg-brand-navy-deep rounded-[3.5rem] p-12 text-white shadow-2xl relative overflow-hidden ring-1 ring-brand-cyan/10">
            <div className="relative z-10">
              <header className="flex justify-between items-start mb-12">
                <div>
                  <h3 className="text-brand-cyan text-[11px] font-black uppercase tracking-[0.4em] mb-2 italic">Phantom Capital Gain</h3>
                  <p className="text-white/30 text-[10px] font-bold uppercase tracking-widest leading-relaxed">Aktuální hodnota k dnešnímu dni (Brutto)</p>
                </div>
                <div className="flex items-center gap-2 bg-brand-cyan/10 border border-brand-cyan/30 rounded-full px-5 py-2">
                  <div className="w-2 h-2 bg-brand-cyan rounded-full animate-ping"></div>
                  <span className="text-brand-cyan text-[10px] font-black uppercase tracking-[0.2em]">Real-Time Value</span>
                </div>
              </header>

              <div className="text-6xl md:text-8xl font-black tracking-tighter mb-16 italic text-transparent bg-clip-text bg-gradient-to-br from-white to-brand-cyan/60">
                {Intl.NumberFormat('cs-CZ').format(Math.round(popPayout))} <span className="text-2xl font-normal not-italic opacity-20 ml-2 text-white">CZK</span>
              </div>

              <div className="grid grid-cols-2 gap-12 border-t border-brand-cyan/10 pt-12">
                <div className="group cursor-help">
                  <p className="text-white/30 text-[10px] font-black uppercase tracking-widest mb-3 group-hover:text-brand-cyan transition-colors">Market EBITDA</p>
                  <p className="font-black text-3xl italic text-white leading-none">{(currentEbitda / 1000000).toFixed(0)}M <span className="text-xs opacity-30 not-italic uppercase ml-1">Base</span></p>
                </div>
                <div className="group cursor-help">
                  <p className="text-brand-cyan text-[10px] font-black uppercase tracking-widest mb-3 text-right sm:text-left group-hover:text-white transition-colors underline decoration-brand-cyan/20 underline-offset-4">Performance Multiplier</p>
                  <p className="font-black text-3xl italic text-white leading-none text-right sm:text-left">{effectiveMultiplier.toFixed(2)}x <span className="text-xs opacity-30 not-italic uppercase ml-1">Eff.</span></p>
                </div>
              </div>
            </div>
            <div className="absolute -right-20 -top-20 w-[400px] h-[400px] bg-brand-cyan rounded-full opacity-5 blur-[120px]"></div>
            <div className="absolute -left-20 -bottom-20 w-[300px] h-[300px] bg-brand-pink rounded-full opacity-5 blur-[100px]"></div>
          </div>

          {/* STRATEGICKÉ BOOSTERY */}
          <div className="bg-brand-navy-card p-12 rounded-[3rem] border border-brand-cyan/10 shadow-lg relative overflow-hidden">
            <header className="flex justify-between items-center mb-12 border-b border-brand-cyan/10 pb-8">
              <h2 className="font-black text-white text-2xl tracking-tight uppercase italic underline decoration-brand-cyan decoration-4 underline-offset-8">Strategické <span className="text-brand-cyan font-black">Boostery</span></h2>
              <div className="text-[10px] font-black text-white/20 tracking-[0.3em] uppercase">Impact Board</div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {metrics.length === 0 ? (
                <div className="col-span-2 text-center text-white/20 py-16 font-bold text-sm italic border-4 border-dotted border-brand-cyan/10 rounded-[3rem]">Zatím nebyly definovány žádné strategické cíle.</div>
              ) : (
                metrics.map((m) => (
                  <div key={m.id} className={`flex items-center justify-between p-6 rounded-[2rem] border-2 transition-all ${m.isCompleted ? 'bg-brand-green/10 border-brand-green/20' : 'bg-brand-navy border-brand-cyan/10 hover:border-brand-cyan/30 group'}`}>
                    <div className="flex items-center gap-5">
                      <form action={toggleMetric.bind(null, m.id, m.isCompleted)}>
                        <button type="submit" className={`w-10 h-10 rounded-2xl border-2 flex items-center justify-center transition-all ${m.isCompleted ? 'bg-brand-green border-brand-green text-brand-navy shadow-lg rotate-12' : 'bg-brand-navy-card border-brand-cyan/20 group-hover:border-brand-cyan group-hover:rotate-6'}`}>
                          {m.isCompleted ? <span className="text-xs font-black italic uppercase">On</span> : <span className="text-xs font-black text-white/20 uppercase">Off</span>}
                        </button>
                      </form>
                      <div>
                        <p className={`font-black text-[13px] uppercase tracking-tight ${m.isCompleted ? 'text-brand-green italic' : 'text-white'}`}>{m.name}</p>
                        <p className="text-[9px] font-black text-brand-pink tracking-[0.2em] mt-1.5 opacity-70">Multiplier Impact: +{m.multiplierImpact.toFixed(1)}x</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
