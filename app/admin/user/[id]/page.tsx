import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { adminSetCompensation, adminAddMetric, adminDeleteMetric } from "@/lib/actions"
import Image from "next/image"
import { redirect, notFound } from "next/navigation"

export default async function UserAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const { id } = await params

  // Kontrola role
  const caller = await prisma.user.findUnique({
    where: { email: session?.user?.email || "" }
  })
  if (caller?.role !== "ADMIN") redirect("/")

  // Načtení spravovaného uživatele
  const managed = await prisma.user.findUnique({
    where: { id },
    include: { compensation: true, metrics: { orderBy: { name: 'asc' } } }
  })
  if (!managed) notFound()

  const comp    = managed.compensation
  const metrics = managed.metrics

  return (
    <div className="min-h-screen bg-brand-navy p-8 font-sans selection:bg-brand-cyan/20">
      <div className="max-w-4xl mx-auto space-y-10">

        {/* HLAVIČKA */}
        <header className="flex flex-col md:flex-row justify-between items-center bg-brand-navy-card p-10 rounded-[3rem] shadow-lg border border-brand-cyan/10 gap-6">
          <div className="flex items-center gap-6">
            <Image src="/algotech-logo.png" alt="Algotech" width={200} height={58} className="object-contain" />
            <div className="w-px h-10 bg-brand-cyan/20 hidden md:block"></div>
            <div>
              <h1 className="text-2xl font-black italic uppercase tracking-tighter text-white">
                Manage <span className="text-brand-cyan">Compensation</span>
              </h1>
              <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mt-1">
                {managed.name || managed.email}
              </p>
            </div>
          </div>
          <a href="/admin" className="flex items-center gap-2 bg-brand-cyan text-brand-navy px-8 py-4 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] hover:bg-brand-pink hover:text-white transition-all shadow-xl">
            ← Back to Control
          </a>
        </header>

        {/* IDENTITA UŽIVATELE */}
        <section className="bg-brand-navy-deep p-8 rounded-[2.5rem] border border-brand-cyan/10 flex items-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-brand-navy-card flex items-center justify-center font-black text-brand-cyan text-2xl border border-brand-cyan/20">
            {managed.name?.charAt(0) || managed.email?.charAt(0)}
          </div>
          <div>
            <p className="font-black text-white text-xl italic uppercase tracking-tight">{managed.name || "—"}</p>
            <p className="text-brand-cyan/60 text-sm font-bold mt-1">{managed.email}</p>
          </div>
          <div className="ml-auto">
            <span className={`text-[9px] font-black px-4 py-2 rounded-full uppercase tracking-[0.2em] ${
              managed.role === 'ADMIN'
                ? 'bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/30'
                : 'bg-brand-navy text-white/30 border border-brand-cyan/10'
            }`}>
              {managed.role}
            </span>
          </div>
        </section>

        {/* ODMĚNA */}
        <section className="bg-brand-navy-card p-12 rounded-[3.5rem] border border-brand-cyan/10 shadow-lg relative overflow-hidden">
          <div className="absolute top-0 left-0 w-2 h-full bg-brand-cyan opacity-20"></div>
          <h2 className="text-brand-cyan text-[11px] font-black uppercase tracking-[0.4em] mb-8 italic">Compensation Parameters</h2>

          <form action={adminSetCompensation.bind(null, managed.id)} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-brand-cyan/60 uppercase tracking-widest block ml-1">Monthly Base (CZK)</label>
                <input name="baseSalary" type="number" step="0.01" defaultValue={comp?.baseSalary ?? 0} className="w-full bg-brand-navy rounded-2xl px-6 py-4 font-black border-2 border-brand-cyan/10 focus:border-brand-cyan outline-none transition-all text-white shadow-inner" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-brand-cyan/60 uppercase tracking-widest block ml-1">Annual Bonus Target (CZK)</label>
                <input name="targetBonusAnnual" type="number" step="0.01" defaultValue={comp?.targetBonusAnnual ?? 0} className="w-full bg-brand-navy rounded-2xl px-6 py-4 font-black border-2 border-brand-cyan/10 focus:border-brand-cyan outline-none transition-all text-white shadow-inner" />
              </div>
            </div>

            <div className="pt-6 border-t border-brand-cyan/10">
              <p className="text-[10px] font-black text-brand-cyan uppercase tracking-[0.3em] mb-6 italic">POP Configuration</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-brand-cyan/60 uppercase tracking-widest block ml-1">Share %</label>
                  <input name="popUnits" type="number" step="0.01" defaultValue={comp?.popUnits ?? 0} className="w-full bg-brand-navy-deep rounded-2xl px-6 py-4 font-black border-2 border-brand-cyan/10 focus:border-brand-cyan outline-none transition-all text-brand-cyan shadow-inner" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-brand-cyan/60 uppercase tracking-widest block ml-1">Grant EBITDA</label>
                  <input name="grantEbitda" type="number" step="0.01" defaultValue={comp?.grantEbitda ?? 0} className="w-full bg-brand-navy rounded-2xl px-6 py-4 font-black border-2 border-brand-cyan/10 focus:border-brand-cyan outline-none transition-all text-white shadow-inner" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-brand-cyan/60 uppercase tracking-widest block ml-1">Grant Multiplier</label>
                  <input name="grantMultiplier" type="number" step="0.01" defaultValue={comp?.grantMultiplier ?? 0} className="w-full bg-brand-navy rounded-2xl px-6 py-4 font-black border-2 border-brand-cyan/10 focus:border-brand-cyan outline-none transition-all text-white shadow-inner" />
                </div>
              </div>
            </div>

            <button type="submit" className="w-full bg-brand-cyan text-brand-navy py-5 rounded-2xl font-black hover:bg-brand-pink hover:text-white transition-all shadow-2xl active:scale-95 uppercase tracking-[0.2em] text-[10px]">
              Save Compensation
            </button>
          </form>
        </section>

        {/* STRATEGICKÉ BOOSTERY */}
        <section className="bg-brand-navy-card p-12 rounded-[3.5rem] border border-brand-cyan/10 shadow-lg relative overflow-hidden">
          <h2 className="text-brand-cyan text-[11px] font-black uppercase tracking-[0.4em] mb-8 italic">Strategic Boosters</h2>

          {/* Přidání nového metriku */}
          <form action={adminAddMetric.bind(null, managed.id)} className="flex flex-col sm:flex-row gap-4 mb-10 bg-brand-navy p-4 rounded-3xl border border-brand-cyan/10">
            <input name="name" placeholder="Název strategického cíle..." className="flex-1 bg-transparent px-6 py-3 outline-none font-bold text-sm text-white placeholder:text-white/20" required />
            <div className="flex gap-2">
              <input name="multiplierImpact" type="number" step="0.1" placeholder="+0.2" className="w-24 bg-brand-navy-card rounded-2xl px-4 py-3 text-center font-black shadow-sm text-brand-cyan outline-none border-2 border-brand-cyan/20 focus:border-brand-cyan transition-all" required />
              <button type="submit" className="bg-brand-cyan text-brand-navy px-8 py-3 rounded-2xl font-black hover:bg-brand-pink hover:text-white transition-all text-[10px] uppercase tracking-widest active:scale-95 shadow-xl">Add</button>
            </div>
          </form>

          {/* Seznam metrik */}
          <div className="space-y-3">
            {metrics.length === 0 ? (
              <div className="text-center text-white/20 py-12 font-bold text-sm italic border-4 border-dotted border-brand-cyan/10 rounded-[2rem]">
                Žádné strategické boostery zatím nebyly přidány.
              </div>
            ) : (
              metrics.map((m) => (
                <div key={m.id} className={`flex items-center justify-between p-5 rounded-[1.5rem] border transition-all ${m.isCompleted ? 'bg-brand-green/10 border-brand-green/20' : 'bg-brand-navy border-brand-cyan/10'}`}>
                  <div className="flex items-center gap-4">
                    <div className={`w-3 h-3 rounded-full ${m.isCompleted ? 'bg-brand-green' : 'bg-brand-cyan/20'}`}></div>
                    <div>
                      <p className={`font-black text-[13px] uppercase tracking-tight ${m.isCompleted ? 'text-brand-green italic' : 'text-white'}`}>{m.name}</p>
                      <p className="text-[9px] font-black text-brand-pink tracking-[0.2em] mt-1 opacity-70">+{m.multiplierImpact.toFixed(1)}x</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-[9px] font-black px-3 py-1 rounded-full uppercase ${m.isCompleted ? 'bg-brand-green/20 text-brand-green' : 'bg-brand-navy-card text-white/20'}`}>
                      {m.isCompleted ? 'Splněno' : 'Čeká'}
                    </span>
                    <form action={adminDeleteMetric.bind(null, m.id, managed.id)}>
                      <button className="bg-brand-navy hover:bg-brand-pink/10 text-white/20 hover:text-brand-pink p-2.5 rounded-xl transition-all border border-transparent hover:border-brand-pink/20">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                      </button>
                    </form>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-brand-green rounded-full opacity-5 blur-[100px]"></div>
        </section>

      </div>
    </div>
  )
}
