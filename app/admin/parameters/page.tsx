import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { updateCompanyParameters } from "@/lib/actions"
import Image from "next/image"
import { redirect } from "next/navigation"

const fmt = (n: number) => Intl.NumberFormat('cs-CZ').format(n)

export default async function ParametersPage() {
  const session = await auth()
  const caller = await prisma.user.findUnique({ where: { email: session?.user?.email || "" } })
  if (caller?.role !== "ADMIN") redirect("/")

  const p = await prisma.companyParameters.findUnique({ where: { id: "global" } })

  return (
    <div className="min-h-screen bg-brand-navy p-8 font-sans selection:bg-brand-cyan/20">
      <div className="max-w-4xl mx-auto space-y-10">

        {/* HLAVIČKA */}
        <header className="flex flex-col md:flex-row justify-between items-center bg-brand-navy-card p-10 rounded-[3rem] border border-brand-cyan/10 shadow-lg gap-6">
          <div className="flex items-center gap-6">
            <Image src="/algotech-logo.png" alt="Algotech" width={200} height={58} className="object-contain" />
            <div className="w-px h-10 bg-brand-cyan/20 hidden md:block" />
            <div>
              <h1 className="text-2xl font-black italic uppercase tracking-tighter text-white">
                Company <span className="text-brand-pink">Parameters</span>
              </h1>
              <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Aktuální hodnoty firemních metrik</p>
            </div>
          </div>
          <a href="/admin" className="bg-brand-cyan text-brand-navy px-8 py-4 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] hover:bg-brand-pink hover:text-white transition-all shadow-xl">
            ← User Control
          </a>
        </header>

        <form action={updateCompanyParameters} className="space-y-8">

          {/* EBITDA */}
          <section className="bg-brand-navy-card p-10 rounded-[3rem] border border-brand-cyan/10 shadow-lg relative overflow-hidden">
            <div className="absolute top-0 left-0 w-2 h-full bg-brand-cyan opacity-20" />
            <h2 className="text-brand-cyan text-[11px] font-black uppercase tracking-[0.4em] mb-2 italic">EBITDA</h2>
            <p className="text-white/30 text-xs mb-8">Výsledek hospodaření firmy před odpisy, úroky a daněmi.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-brand-cyan/60 uppercase tracking-widest block ml-1">Aktuální EBITDA (CZK)</label>
                <input name="currentEbitda" type="number" step="1" defaultValue={p?.currentEbitda ?? 0}
                  className="w-full bg-brand-navy rounded-2xl px-6 py-4 font-black border-2 border-brand-cyan/10 focus:border-brand-cyan outline-none transition-all text-white shadow-inner text-lg" />
                {p && <p className="text-[10px] text-white/20 ml-2">Nyní: {fmt(p.currentEbitda)} CZK</p>}
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-brand-cyan/60 uppercase tracking-widest block ml-1">Cílová EBITDA (CZK)</label>
                <input name="targetEbitda" type="number" step="1" defaultValue={p?.targetEbitda ?? 0}
                  className="w-full bg-brand-navy rounded-2xl px-6 py-4 font-black border-2 border-brand-cyan/10 focus:border-brand-cyan outline-none transition-all text-white shadow-inner text-lg" />
                {p && <p className="text-[10px] text-white/20 ml-2">Cíl: {fmt(p.targetEbitda)} CZK</p>}
              </div>
            </div>

            {p && p.targetEbitda > 0 && (
              <div className="mt-6">
                <div className="flex justify-between text-[10px] font-black text-white/30 mb-2">
                  <span>EBITDA plnění</span>
                  <span>{Math.round(Math.min(150, (p.currentEbitda / p.targetEbitda) * 100))}%</span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-cyan rounded-full" style={{ width: `${Math.min(100, (p.currentEbitda / p.targetEbitda) * 100)}%` }} />
                </div>
              </div>
            )}
          </section>

          {/* HORIZONT */}
          <section className="bg-brand-navy-card p-10 rounded-[3rem] border border-brand-pink/10 shadow-lg relative overflow-hidden">
            <div className="absolute top-0 left-0 w-2 h-full bg-brand-pink opacity-20" />
            <h2 className="text-brand-pink text-[11px] font-black uppercase tracking-[0.4em] mb-2 italic">HORIZONT</h2>
            <p className="text-white/30 text-xs mb-8">Parametrizovatelná firemní metrika — např. obrat, ARR, zákaznická báze nebo jiný strategický ukazatel.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-brand-pink/60 uppercase tracking-widest block ml-1">Aktuální HORIZONT</label>
                <input name="currentHorizont" type="number" step="0.01" defaultValue={p?.currentHorizont ?? 0}
                  className="w-full bg-brand-navy rounded-2xl px-6 py-4 font-black border-2 border-brand-pink/10 focus:border-brand-pink outline-none transition-all text-white shadow-inner text-lg" />
                {p && <p className="text-[10px] text-white/20 ml-2">Nyní: {fmt(p.currentHorizont)}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-brand-pink/60 uppercase tracking-widest block ml-1">Cílový HORIZONT</label>
                <input name="targetHorizont" type="number" step="0.01" defaultValue={p?.targetHorizont ?? 0}
                  className="w-full bg-brand-navy rounded-2xl px-6 py-4 font-black border-2 border-brand-pink/10 focus:border-brand-pink outline-none transition-all text-white shadow-inner text-lg" />
                {p && <p className="text-[10px] text-white/20 ml-2">Cíl: {fmt(p.targetHorizont)}</p>}
              </div>
            </div>

            {p && p.targetHorizont > 0 && (
              <div className="mt-6">
                <div className="flex justify-between text-[10px] font-black text-white/30 mb-2">
                  <span>HORIZONT plnění</span>
                  <span>{Math.round(Math.min(150, (p.currentHorizont / p.targetHorizont) * 100))}%</span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-pink rounded-full" style={{ width: `${Math.min(100, (p.currentHorizont / p.targetHorizont) * 100)}%` }} />
                </div>
              </div>
            )}
          </section>

          {/* POP MULTIPLIER */}
          <section className="bg-brand-navy-card p-10 rounded-[3rem] border border-brand-green/10 shadow-lg relative overflow-hidden">
            <div className="absolute top-0 left-0 w-2 h-full bg-brand-green opacity-20" />
            <h2 className="text-brand-green text-[11px] font-black uppercase tracking-[0.4em] mb-2 italic">POP Multiplier</h2>
            <p className="text-white/30 text-xs mb-8">Aktuální tržní multiplier pro výpočet hodnoty firmy (EBITDA × Multiplier). Mění se na základě strategických výsledků a tržního benchmarku.</p>

            <div className="max-w-xs space-y-2">
              <label className="text-[10px] font-black text-brand-green/60 uppercase tracking-widest block ml-1">Aktuální Multiplier</label>
              <input name="currentMultiplier" type="number" step="0.1" defaultValue={p?.currentMultiplier ?? 6.0}
                className="w-full bg-brand-navy rounded-2xl px-6 py-4 font-black border-2 border-brand-green/10 focus:border-brand-green outline-none transition-all text-brand-green shadow-inner text-2xl" />
              {p && (
                <p className="text-[10px] text-white/20 ml-2">
                  Implikovaná hodnota firmy: {Intl.NumberFormat('cs-CZ').format(Math.round((p.currentEbitda || 0) * p.currentMultiplier))} CZK
                </p>
              )}
            </div>
          </section>

          <button type="submit" className="w-full bg-brand-cyan text-brand-navy py-5 rounded-2xl font-black hover:bg-brand-pink hover:text-white transition-all shadow-2xl active:scale-95 uppercase tracking-[0.2em] text-sm">
            Uložit parametry
          </button>
        </form>
      </div>
    </div>
  )
}
