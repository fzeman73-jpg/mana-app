import { auth, signIn, signOut } from "@/auth"
import { prisma } from "@/lib/db"
import { updateCompensation, addStrategicMetric, toggleMetric } from "@/lib/actions"

export default async function Home() {
  const session = await auth()

  // 1. LOGIN SCREEN (Pokud není přihlášen email)
  if (!session?.user?.email) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-900 text-white p-6">
        <div className="text-center p-10 border border-slate-700 rounded-3xl bg-slate-800 shadow-2xl max-w-md w-full">
          <h1 className="text-4xl font-black mb-6 tracking-tight italic text-blue-500 text-center">MANA APP</h1>
          <p className="text-slate-400 mb-8 font-medium">Vstupte do svého manažerského cockpitů.</p>
          <form action={async () => { "use server"; await signIn("google") }}>
            <button className="w-full bg-white text-black font-bold py-4 px-8 rounded-full hover:bg-blue-500 hover:text-white transition-all shadow-lg active:scale-95">
              Přihlásit se přes Google
            </button>
          </form>
        </div>
      </main>
    )
  }

  const userEmail = session.user.email

  // 2. NAČTENÍ DAT PODLE EMAILU (Bezpečnější bez adaptéru)
  let comp = null
  let metrics = []

  try {
    // Hledáme compensation, která patří uživateli s tímto emailem
    comp = await prisma.compensation.findFirst({
      where: { user: { email: userEmail } }
    })

    metrics = await prisma.strategicMetric.findMany({
      where: { user: { email: userEmail } }
    })
  } catch (error) {
    console.error("Chyba při komunikaci s Neonem:", error)
  }

  // 3. VÝPOČETNÍ ENGINE
  const currentEbitda = 50000000 // Simulace: 50M
  const baseMultiplier = 6.0
  
  const bonusMultiplier = metrics
    .filter(m => m.isCompleted)
    .reduce((sum, m) => sum + m.multiplierImpact, 0)
    
  const effectiveMultiplier = baseMultiplier + bonusMultiplier
  
  const currentVal = currentEbitda * effectiveMultiplier
  const grantVal = (comp?.grantEbitda || 0) * (comp?.grantMultiplier || 0)
  const popPayout = Math.max(0, (currentVal - grantVal) * ((comp?.popUnits || 0) / 100))

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* NAVBAR */}
      <nav className="bg-white border-b px-8 py-4 flex justify-between items-center sticky top-0 z-20">
        <h1 className="text-xl font-black tracking-tighter italic">MANA<span className="text-blue-600">APP</span></h1>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block font-sans">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Manager</p>
            <p className="text-sm font-black text-slate-800 leading-none">{session.user?.name}</p>
          </div>
          {session.user?.image && (
            <img 
                src={session.user.image} 
                className="w-10 h-10 rounded-full border-2 border-blue-100 shadow-sm" 
                alt="Avatar" 
                referrerPolicy="no-referrer"
            />
          )}
          <form action={async () => { "use server"; await signOut() }}>
            <button className="p-2 text-slate-300 hover:text-red-500 transition-colors">✕</button>
          </form>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto py-10 px-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* LEVÝ PANEL: NASTAVENÍ */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
            <h2 className="font-black text-slate-800 text-lg mb-6 tracking-tight">Parametry Plánu</h2>
            <form action={updateCompensation} className="space-y-5">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Měsíční fix (CZK)</label>
                <input name="baseSalary" type="number" step="0.01" defaultValue={comp?.baseSalary || 0} className="w-full text-lg font-bold border-b-2 border-slate-100 focus:border-blue-500 outline-none transition-colors py-1" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Roční bonus cíl (CZK)</label>
                <input name="targetBonusAnnual" type="number" step="0.01" defaultValue={comp?.targetBonusAnnual || 0} className="w-full text-lg font-bold border-b-2 border-slate-100 focus:border-blue-500 outline-none transition-colors py-1" />
              </div>
              
              <div className="pt-6 border-t border-slate-50">
                <p className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] mb-4">Phantom Options (POP)</p>
                <div className="space-y-4">
                   <div className="flex justify-between items-end border-b-2 border-slate-100 py-1">
                    <label className="text-xs font-bold text-slate-400">Podíl (%)</label>
                    <input name="popUnits" type="number" step="0.01" defaultValue={comp?.popUnits || 0} className="text-right font-black w-20 outline-none bg-transparent" />
                  </div>
                  <div className="flex justify-between items-end border-b-2 border-slate-100 py-1">
                    <label className="text-xs font-bold text-slate-400">EBITDA start</label>
                    <input name="grantEbitda" type="number" step="0.01" defaultValue={comp?.grantEbitda || 0} className="text-right font-black w-32 outline-none bg-transparent" />
                  </div>
                  <div className="flex justify-between items-end border-b-2 border-slate-100 py-1">
                    <label className="text-xs font-bold text-slate-400">Multiplier start</label>
                    <input name="grantMultiplier" type="number" step="0.01" defaultValue={comp?.grantMultiplier || 0} className="text-right font-black w-16 outline-none bg-transparent" />
                  </div>
                </div>
              </div>

              <button type="submit" className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-blue-600 transition-all shadow-xl shadow-slate-200 active:scale-95">
                Uložit nastavení
              </button>
            </form>
          </div>
        </div>

        {/* PRAVÝ PANEL: DASHBOARD */}
        <div className="lg:col-span-2 space-y-8">
          
          <div className="bg-blue-600 rounded-[2.5rem] p-10 text-white shadow-2xl shadow-blue-200 relative overflow-hidden">
            <div className="relative z-10">
              <h3 className="text-blue-100 text-sm font-bold uppercase tracking-widest opacity-80">Aktuální hodnota POP</h3>
              <div className="text-5xl md:text-6xl font-black mt-4 tracking-tighter">
                {Intl.NumberFormat('cs-CZ').format(Math.round(popPayout))} <span className="text-2xl font-normal opacity-50">Kč</span>
              </div>
              <div className="mt-10 flex gap-8 border-t border-blue-500 pt-6">
                <div>
                  <p className="text-blue-200 text-[10px] font-bold uppercase mb-1">Firmy EBITDA</p>
                  <p className="font-black text-xl italic text-white">{(currentEbitda / 1000000).toFixed(0)}M</p>
                </div>
                <div>
                  <p className="text-blue-200 text-[10px] font-bold uppercase mb-1">Váš Multiplier</p>
                  <p className="font-black text-xl italic text-white">{effectiveMultiplier.toFixed(2)}x</p>
                </div>
              </div>
            </div>
            <div className="absolute -right-20 -top-20 w-80 h-80 bg-blue-400 rounded-full opacity-20 blur-3xl"></div>
          </div>

          {/* MILNÍKY */}
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
            <h2 className="font-black text-slate-800 text-lg italic tracking-tight mb-6">Strategické milníky</h2>
            
            <form action={addStrategicMetric} className="flex gap-2 mb-8 bg-slate-50 p-2 rounded-2xl">
              <input name="name" placeholder="Název milníku..." className="flex-1 bg-transparent px-4 py-2 outline-none font-bold text-sm" required />
              <input name="multiplierImpact" type="number" step="0.1" placeholder="+0.2" className="w-20 bg-white rounded-xl px-2 py-2 text-center font-black shadow-sm" required />
              <button type="submit" className="bg-slate-900 text-white px-6 py-2 rounded-xl font-bold hover:bg-blue-600 transition-colors uppercase text-xs tracking-widest">Přidat</button>
            </form>

            <div className="space-y-3 font-sans">
              {metrics.length === 0 ? (
                <p className="text-center text-slate-300 py-6 font-bold text-sm italic">Žádné milníky zatím nebyly definovány.</p>
              ) : (
                metrics.map((m) => (
                  <div key={m.id} className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${m.isCompleted ? 'bg-slate-50 border-transparent opacity-60' : 'bg-white border-slate-100 hover:border-blue-200 shadow-sm'}`}>
                    <div className="flex items-center gap-4">
                      <form action={toggleMetric.bind(null, m.id, m.isCompleted)}>
                        <button type="submit" className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all ${m.isCompleted ? 'bg-green-500 border-green-500 text-white' : 'border-slate-200 hover:border-blue-400'}`}>
                          {m.isCompleted && <span className="text-xs font-bold">✓</span>}
                        </button>
                      </form>
                      <div>
                        <p className={`font-bold text-sm ${m.isCompleted ? 'line-through text-slate-400 text-sm' : 'text-slate-800'}`}>{m.name}</p>
                        <p className="text-[10px] font-black text-blue-500 tracking-widest">IMPACT: +{m.multiplierImpact.toFixed(1)}x</p>
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