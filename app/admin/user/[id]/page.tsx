import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { adminSetCompensation, adminAddKpiTask, adminDeleteKpiTask } from "@/lib/actions"
import Image from "next/image"
import { redirect, notFound } from "next/navigation"

export default async function UserAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const { id } = await params

  const caller = await prisma.user.findUnique({
    where: { email: session?.user?.email || "" }
  })
  if (caller?.role !== "ADMIN") redirect("/")

  const managed = await prisma.user.findUnique({
    where: { id },
    include: { compensation: true, kpiTasks: { orderBy: { name: 'asc' } } }
  })
  if (!managed) notFound()

  const comp     = managed.compensation
  const kpiTasks = managed.kpiTasks

  return (
    <div className="min-h-screen bg-gray-50 p-8 font-sans selection:bg-brand-cyan/20">
      <div className="max-w-4xl mx-auto space-y-10">

        {/* HLAVIČKA */}
        <header className="flex flex-col md:flex-row justify-between items-center bg-white p-10 rounded-[3rem] shadow-sm border border-gray-100 gap-6">
          <div className="flex items-center gap-6">
            <a href="/"><Image src="/algotech-logo.png" alt="Algotech" width={200} height={58} className="object-contain" /></a>
            <div className="w-px h-10 bg-gray-200 hidden md:block" />
            <div>
              <h1 className="text-2xl font-black italic uppercase tracking-tighter text-gray-900">
                Nastavení <span className="text-brand-cyan">uživatele</span>
              </h1>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">
                {managed.name || managed.email}
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <a href="/admin/parameters" className="flex items-center gap-2 bg-brand-pink/10 text-brand-pink border border-brand-pink/30 px-6 py-4 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] hover:bg-brand-pink hover:text-white transition-all shadow-sm">
              Parametry
            </a>
            <a href="/admin" className="flex items-center gap-2 bg-brand-cyan text-brand-navy px-8 py-4 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] hover:bg-brand-pink hover:text-white transition-all shadow-sm">
              ← User Control
            </a>
          </div>
        </header>

        {/* IDENTITA UŽIVATELE */}
        <section className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex items-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center font-black text-brand-cyan text-2xl border border-gray-200">
            {managed.name?.charAt(0) || managed.email?.charAt(0)}
          </div>
          <div>
            <p className="font-black text-gray-900 text-xl italic uppercase tracking-tight">{managed.name || "—"}</p>
            <p className="text-brand-cyan/70 text-sm font-bold mt-1">{managed.email}</p>
          </div>
          <div className="ml-auto">
            <span className={`text-[9px] font-black px-4 py-2 rounded-full uppercase tracking-[0.2em] ${
              managed.role === 'ADMIN'
                ? 'bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/30'
                : 'bg-gray-100 text-gray-400 border border-gray-200'
            }`}>
              {managed.role}
            </span>
          </div>
        </section>

        {/* ODMĚNA */}
        <section className="bg-white p-12 rounded-[3.5rem] border border-gray-100 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-2 h-full bg-brand-cyan opacity-20" />
          <h2 className="text-brand-cyan text-[11px] font-black uppercase tracking-[0.4em] mb-8 italic">Compensation Parameters</h2>

          <form action={adminSetCompensation.bind(null, managed.id)} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-brand-cyan/60 uppercase tracking-widest block ml-1">Monthly Base (CZK)</label>
                <input name="baseSalary" type="number" step="0.01" defaultValue={comp?.baseSalary ?? 0} className="w-full bg-gray-50 rounded-2xl px-6 py-4 font-black border-2 border-gray-200 focus:border-brand-cyan outline-none transition-all text-gray-900 shadow-inner" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-brand-cyan/60 uppercase tracking-widest block ml-1">Annual Bonus Target (CZK)</label>
                <input name="targetBonusAnnual" type="number" step="0.01" defaultValue={comp?.targetBonusAnnual ?? 0} className="w-full bg-gray-50 rounded-2xl px-6 py-4 font-black border-2 border-gray-200 focus:border-brand-cyan outline-none transition-all text-gray-900 shadow-inner" />
              </div>
            </div>

            <div className="pt-6 border-t border-gray-100">
              <p className="text-[10px] font-black text-brand-cyan uppercase tracking-[0.3em] mb-6 italic">Váhy bonusu (%)</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-brand-cyan/60 uppercase tracking-widest block ml-1">Váha EBITDA</label>
                  <input name="bonusWeightEbitda" type="number" step="0.01" defaultValue={comp?.bonusWeightEbitda ?? 0} className="w-full bg-gray-50 rounded-2xl px-6 py-4 font-black border-2 border-gray-200 focus:border-brand-cyan outline-none transition-all text-gray-900 shadow-inner" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-brand-cyan/60 uppercase tracking-widest block ml-1">Váha HORIZONT</label>
                  <input name="bonusWeightHorizont" type="number" step="0.01" defaultValue={comp?.bonusWeightHorizont ?? 0} className="w-full bg-gray-50 rounded-2xl px-6 py-4 font-black border-2 border-gray-200 focus:border-brand-cyan outline-none transition-all text-gray-900 shadow-inner" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-brand-cyan/60 uppercase tracking-widest block ml-1">Váha KPI</label>
                  <input name="bonusWeightKpi" type="number" step="0.01" defaultValue={comp?.bonusWeightKpi ?? 0} className="w-full bg-gray-50 rounded-2xl px-6 py-4 font-black border-2 border-gray-200 focus:border-brand-cyan outline-none transition-all text-gray-900 shadow-inner" />
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-gray-100">
              <p className="text-[10px] font-black text-brand-cyan uppercase tracking-[0.3em] mb-6 italic">POP Configuration</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-brand-cyan/60 uppercase tracking-widest block ml-1">Share %</label>
                  <input name="sharePercent" type="number" step="0.01" defaultValue={comp?.sharePercent ?? 0} className="w-full bg-gray-50 rounded-2xl px-6 py-4 font-black border-2 border-gray-200 focus:border-brand-cyan outline-none transition-all text-brand-cyan shadow-inner" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-brand-cyan/60 uppercase tracking-widest block ml-1">Grant EBITDA</label>
                  <input name="grantEbitda" type="number" step="0.01" defaultValue={comp?.grantEbitda ?? 0} className="w-full bg-gray-50 rounded-2xl px-6 py-4 font-black border-2 border-gray-200 focus:border-brand-cyan outline-none transition-all text-gray-900 shadow-inner" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-brand-cyan/60 uppercase tracking-widest block ml-1">Grant Multiplier</label>
                  <input name="grantMultiplier" type="number" step="0.01" defaultValue={comp?.grantMultiplier ?? 0} className="w-full bg-gray-50 rounded-2xl px-6 py-4 font-black border-2 border-gray-200 focus:border-brand-cyan outline-none transition-all text-gray-900 shadow-inner" />
                </div>
              </div>
            </div>

            <button type="submit" className="w-full bg-brand-cyan text-brand-navy py-5 rounded-2xl font-black hover:bg-brand-pink hover:text-white transition-all shadow-sm active:scale-95 uppercase tracking-[0.2em] text-[10px]">
              Save Compensation
            </button>
          </form>
        </section>

        {/* KPI ÚKOLY */}
        <section className="bg-white p-12 rounded-[3.5rem] border border-gray-100 shadow-sm relative overflow-hidden">
          <h2 className="text-brand-cyan text-[11px] font-black uppercase tracking-[0.4em] mb-8 italic">KPI Úkoly</h2>

          <form action={adminAddKpiTask.bind(null, managed.id)} className="flex flex-col sm:flex-row gap-4 mb-10 bg-gray-50 p-4 rounded-3xl border border-gray-200">
            <input name="name" placeholder="Název KPI úkolu..." className="flex-1 bg-transparent px-6 py-3 outline-none font-bold text-sm text-gray-900 placeholder:text-gray-400" required />
            <div className="flex gap-2">
              <input name="multiplierImpact" type="number" step="1" min="0" max="100" placeholder="váha %" className="w-28 bg-white rounded-2xl px-4 py-3 text-center font-black shadow-sm text-brand-cyan outline-none border-2 border-gray-200 focus:border-brand-cyan transition-all" required />
              <button type="submit" className="bg-brand-cyan text-brand-navy px-8 py-3 rounded-2xl font-black hover:bg-brand-pink hover:text-white transition-all text-[10px] uppercase tracking-widest active:scale-95 shadow-sm">Add</button>
            </div>
          </form>

          <div className="space-y-3">
            {kpiTasks.length === 0 ? (
              <div className="text-center text-gray-400 py-12 font-bold text-sm italic border-4 border-dotted border-gray-200 rounded-[2rem]">
                Žádné KPI úkoly zatím nebyly přidány.
              </div>
            ) : (
              kpiTasks.map((m) => (
                <div key={m.id} className={`flex items-center justify-between p-5 rounded-[1.5rem] border transition-all ${m.isCompleted ? 'bg-brand-green/10 border-brand-green/20' : 'bg-gray-50 border-gray-200'}`}>
                  <div className="flex items-center gap-4">
                    <div className={`w-3 h-3 rounded-full ${m.isCompleted ? 'bg-brand-green' : 'bg-gray-300'}`} />
                    <div>
                      <p className={`font-black text-[13px] uppercase tracking-tight ${m.isCompleted ? 'text-brand-green italic' : 'text-gray-900'}`}>{m.name}</p>
                      <p className="text-[9px] font-black text-brand-pink tracking-[0.2em] mt-1 opacity-70">{m.weight}%</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-[9px] font-black px-3 py-1 rounded-full uppercase ${m.isCompleted ? 'bg-brand-green/20 text-brand-green' : 'bg-gray-100 text-gray-400'}`}>
                      {m.isCompleted ? 'Splněno' : 'Čeká'}
                    </span>
                    <form action={adminDeleteKpiTask.bind(null, m.id, managed.id)}>
                      <button className="bg-gray-100 hover:bg-brand-pink/10 text-gray-400 hover:text-brand-pink p-2.5 rounded-xl transition-all border border-transparent hover:border-brand-pink/20">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                      </button>
                    </form>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-brand-green rounded-full opacity-5 blur-[100px]" />
        </section>

      </div>
    </div>
  )
}
