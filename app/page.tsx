import { auth, signIn, signOut } from "@/auth"
import { prisma } from "@/lib/db"
import { updateCompensation, addStrategicMetric, toggleMetric } from "@/lib/actions"
// Importujeme typy pro TypeScript
import { StrategicMetric, Compensation } from "@prisma/client"
// Importujeme Next.js Image pro optimalizaci obrázků
import Image from "next/image"

export default async function Home() {
  const session = await auth()

  // 1. LOGIN SCREEN - S LOGEM ALGOTECHU
  if (!session?.user?.email) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white p-6 relative overflow-hidden">
        {/* Dekorativní pozadí */}
        <div className="absolute -left-40 -top-40 w-[600px] h-[600px] bg-blue-900 rounded-full opacity-10 blur-[150px]"></div>
        
        <div className="text-center p-12 border border-slate-800 rounded-[3rem] bg-slate-900 shadow-2xl max-w-md w-full border-b-4 border-b-blue-600 relative z-10">
          
          {/* LOGO ALGOTECHU NA LOGINU */}
          <div className="flex justify-center mb-10 mt-4">
             <Image 
                src="/algotech-logo.png" // Cesta k tvému logu ve složce public
                alt="Algotech Logo"
                width={200} // Uprav šířku podle potřeby
                height={60} // Uprav výšku podle potřeby
                priority // Načte se přednostně
                className="opacity-90"
             />
          </div>

          <h1 className="text-3xl font-black mb-2 tracking-tighter italic uppercase text-white">Performance <span className="text-blue-500">Cockpit</span></h1>
          <p className="text-slate-500 mb-12 font-medium italic tracking-wide text-sm underline decoration-blue-900 underline-offset-8">Executive Incentives Tracking</p>
          
          <form action={async () => { "use server"; await signIn("google") }}>
            <button className="w-full bg-white text-black font-black py-5 px-8 rounded-2xl hover:bg-blue-600 hover:text-white transition-all shadow-xl active:scale-95 uppercase tracking-[0.2em] text-xs">
              Vstoupit přes Google
            </button>
          </form>
        </div>
      </main>
    )
  }

  const userEmail = session.user.email

  // 2. NAČTENÍ DAT PODLE EMAILU
  let comp: Compensation | null = null
  let metrics: StrategicMetric[] = []

  try {
    const userData = await prisma.user.findUnique({
      where: { email: userEmail },
      include: { 
        compensation: true,
        metrics: true 
      }
    })

    if (userData) {
      comp = userData.compensation
      metrics = userData.metrics
    }
  } catch (error) {
    console.error("Database sync error:", error)
  }

  // 3. VÝPOČETNÍ LOGIKA
  const currentEbitda = 50000000 
  const baseMultiplier = 6.0
  const bonusMultiplier = metrics.filter(m => m.isCompleted).reduce((sum, m) => sum + m.multiplierImpact, 0)
  const effectiveMultiplier = baseMultiplier + bonusMultiplier
  const currentVal = currentEbitda * effectiveMultiplier
  const grantVal = (comp?.grantEbitda || 0) * (comp?.grantMultiplier || 0)
  const popPayout = Math.max(0, (currentVal - grantVal) * ((comp?.popUnits || 0) / 100))

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-blue-100">
      
      {/* NAVBAR - S LOGEM ALGOTECHU */}
      <nav className="bg-white/80 backdrop-blur-md border-b px-8 py-4 flex justify-between items-center sticky top-0 z-30 shadow-sm border-slate-100">
        
        {/* LOGO ALGOTECHU V NAVBARU (Náhrada za MANAAPP) */}
        <div className="flex items-center gap-2">
            <Image 
                src="/algotech-logo.png" // Stejný soubor
                alt="Algotech"
                width={120} // Menší šířka pro navbar
                height={35}
                className="object-contain" // Zajistí, že se logo nedeformuje
            />
            <span className="w-px h-6 bg-slate-200 ml-2"></span>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic opacity-60">Cockpit</span>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right hidden sm:block leading-none">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1.5">Executive Unit</p>
            <p className="text-sm font-black text-slate-900 italic">{session.user?.name}</p>
          </div>
          {session.user?.image && (
            <img src={session.user.image} className="w-10 h-10 rounded-full ring-4 ring-blue-50 shadow-md border border-white" referrerPolicy="no-referrer" />
          )}
          <form action={async () => { "use server"; await signOut() }}>
            <button className="group relative p-2">
                <span className="text-[10px] font-black text-slate-300 group-hover:text-red-500 transition-colors uppercase tracking-widest">Exit</span>
            </button>
          </form>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto py-12 px-6 grid grid-cols-1 lg:grid-cols-3 gap-12">
        {/* LEVÝ SLOUP: PARAMETRY */}
        <div className="lg:col-span-1 space-y-8">
          <section className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-2 h-full bg-blue-600 opacity-10"></div>
            <h2 className="font-black text-slate-900 text-xl mb-8 tracking-tight uppercase italic underline decoration-blue-500 decoration-4 underline-offset-8">Data Entry</h2>
            
            <form action={updateCompensation} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">Monthly Base (CZK)</label>
                <input name="baseSalary" type="number" step="0.01" defaultValue={comp?.baseSalary || 0} className="w-full bg-slate-50 rounded-2xl px-6 py-4 font-black border-2 border-transparent focus:border-blue-600 focus:bg-white outline-none transition-all text-slate-800 shadow-inner" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">Annual Bonus Target (CZK)</label>
                <input name="targetBonusAnnual" type="number" step="0.01" defaultValue={comp?.targetBonusAnnual || 0} className="w-full bg-slate-50 rounded-2xl px-6 py-4 font-black border-2 border-transparent focus:border-blue-600 focus:bg-white outline-none transition-all text-slate-800 shadow-inner" />
              </div>
              
              <div className="pt-8 mt-8 border-t-2 border-slate-50">
                <p className="text-[10px] font-black text-blue-600 uppercase tracking-[0.3em] mb-6 text-center italic">POP Configuration</p>
                <div className="space-y-3">
                   <div className="flex justify-between items-center bg-slate-900 p-4 rounded-2xl text-white shadow-xl">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Share %</label>
                    <input name="popUnits" type="number" step="0.01" defaultValue={comp?.popUnits || 0} className="font-black w-16 text-right bg-transparent outline-none text-blue-400 text-lg" />
                  </div>
                  <div className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Grant EBITDA</label>
                    <input name="grantEbitda" type="number" step="0.01" defaultValue={comp?.grantEbitda || 0} className="font-black w-28 text-right bg-transparent outline-none text-slate-900" />
                  </div>
                  <div className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Grant Multiplier</label>
                    <input name="grantMultiplier" type="number" step="0.01" defaultValue={comp?.grantMultiplier || 0} className="font-black w-16 text-right bg-transparent outline-none text-slate-900" />
                  </div>
                </div>
              </div>

              <button type="submit" className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black hover:bg-blue-600 transition-all shadow-2xl active:scale-95 uppercase tracking-[0.2em] text-[10px] mt-6">
                Update Model
              </button>
            </form>
          </section>
        </div>

        {/* PRAVÝ SLOUP: DASHBOARD */}
        <div className="lg:col-span-2 space-y-12">
          
          <div className="bg-slate-900 rounded-[3.5rem] p-12 text-white shadow-2xl relative overflow-hidden ring-1 ring-white/10">
            <div className="relative z-10">
              <header className="flex justify-between items-start mb-12">
                <div>
                    <h3 className="text-blue-500 text-[11px] font-black uppercase tracking-[0.4em] mb-2 italic">Phantom Capital Gain</h3>
                    <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest leading-relaxed">Aktuální hodnota k dnešnímu dni (Brutto)</p>
                </div>
                <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 rounded-full px-5 py-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-ping"></div>
                    <span className="text-blue-400 text-[10px] font-black uppercase tracking-[0.2em]">Real-Time Value</span>
                </div>
              </header>
              
              <div className="text-6xl md:text-8xl font-black tracking-tighter mb-16 italic text-transparent bg-clip-text bg-gradient-to-br from-white to-slate-500">
                {Intl.NumberFormat('cs-CZ').format(Math.round(popPayout))} <span className="text-2xl font-normal not-italic opacity-20 ml-2 text-white">CZK</span>
              </div>

              <div className="grid grid-cols-2 gap-12 border-t border-slate-800/50 pt-12">
                <div className="group cursor-help">
                  <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-3 transition-colors group-hover:text-blue-500">Market EBITDA</p>
                  <p className="font-black text-3xl italic text-white leading-none">{(currentEbitda / 1000000).toFixed(0)}M <span className="text-xs opacity-30 not-italic uppercase ml-1">Base</span></p>
                </div>
                <div className="group cursor-help">
                  <p className="text-blue-500 text-[10px] font-black uppercase tracking-widest mb-3 text-right sm:text-left transition-colors group-hover:text-white underline decoration-blue-900 underline-offset-4">Performance Multiplier</p>
                  <p className="font-black text-3xl italic text-white leading-none text-right sm:text-left">{effectiveMultiplier.toFixed(2)}x <span className="text-xs opacity-30 not-italic uppercase ml-1">Eff.</span></p>
                </div>
              </div>
            </div>
            <div className="absolute -right-20 -top-20 w-[400px] h-[400px] bg-blue-600 rounded-full opacity-10 blur-[120px]"></div>
          </div>

          {/* MILNÍKY */}
          <div className="bg-white p-12 rounded-[3rem] border border-slate-100 shadow-sm relative overflow-hidden">
            <header className="flex justify-between items-center mb-12 border-b border-slate-50 pb-8">
               <h2 className="font-black text-slate-900 text-2xl tracking-tight uppercase italic italic underline decoration-blue-500 decoration-4 underline-offset-8">Strategické <span className="text-blue-600">Boostery</span></h2>
               <div className="text-[10px] font-black text-slate-400 tracking-[0.3em] uppercase opacity-50">Impact Board</div>
            </header>
            
            <form action={addStrategicMetric} className="flex flex-col sm:flex-row gap-4 mb-12 bg-slate-50 p-4 rounded-3xl border border-slate-100 shadow-inner">
              <input name="name" placeholder="Pojmenujte strategický cíl (např. Expanze EU)..." className="flex-1 bg-transparent px-6 py-3 outline-none font-bold text-sm text-slate-800 placeholder:text-slate-300" required />
              <div className="flex gap-2">
                <input name="multiplierImpact" type="number" step="0.1" placeholder="+0.2" className="w-24 bg-white rounded-2xl px-4 py-3 text-center font-black shadow-sm text-blue-600 outline-none border-2 border-transparent focus:border-blue-500 transition-all" required />
                <button type="submit" className="bg-slate-900 text-white px-8 py-3 rounded-2xl font-black hover:bg-blue-600 transition-all text-[10px] uppercase tracking-widest active:scale-95 shadow-xl">Boost</button>
              </div>
            </form>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {metrics.length === 0 ? (
                <div className="col-span-2 text-center text-slate-300 py-16 font-bold text-sm italic border-4 border-dotted border-slate-50 rounded-[3rem]">Zatím nebyly definovány žádné multiplikační úkoly.</div>
              ) : (
                metrics.map((m) => (
                  <div key={m.id} className={`flex items-center justify-between p-6 rounded-[2rem] border-2 transition-all ${m.isCompleted ? 'bg-blue-50/50 border-transparent' : 'bg-white border-slate-50 hover:border-blue-100 shadow-sm group'}`}>
                    <div className="flex items-center gap-5">
                      <form action={toggleMetric.bind(null, m.id, m.isCompleted)}>
                        <button type="submit" className={`w-10 h-10 rounded-2xl border-2 flex items-center justify-center transition-all ${m.isCompleted ? 'bg-blue-600 border-blue-600 text-white shadow-lg rotate-12' : 'bg-white border-slate-200 group-hover:border-blue-400 group-hover:rotate-6'}`}>
                          {m.isCompleted ? <span className="text-xs font-black italic uppercase">On</span> : <span className="text-xs font-black text-slate-200 uppercase">Off</span>}
                        </button>
                      </form>
                      <div>
                        <p className={`font-black text-[13px] uppercase tracking-tight ${m.isCompleted ? 'text-blue-900 italic' : 'text-slate-700'}`}>{m.name}</p>
                        <p className="text-[9px] font-black text-blue-500 tracking-[0.2em] mt-1.5 opacity-70">Multiplier Impact: +{m.multiplierImpact.toFixed(1)}x</p>
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