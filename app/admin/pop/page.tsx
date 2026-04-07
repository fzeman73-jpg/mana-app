import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { redirect } from "next/navigation"
import Image from "next/image"
import { createPopPlan } from "@/lib/actions"

const fmt = (n: number) => Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(Math.round(n))

type PopPlanRow = {
  id: string
  name: string
  description: string | null
  grantEbitda: number
  baseMultiplier: number
  vestingYears: number
  vestingGranularity: string
  _count?: { assignments: number; boosters: number }
}

export default async function PopAdminPage() {
  const session = await auth()
  const caller = await prisma.user.findUnique({ where: { email: session?.user?.email || "" } })
  if (caller?.role !== "ADMIN") redirect("/")

  const plans = await prisma.popPlan.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { assignments: true, boosters: true } } },
  })

  return (
    <div className="min-h-screen bg-gray-50 font-sans selection:bg-brand-cyan/20">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
        <div className="px-4 sm:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <a href="/"><Image src="/algotech-logo.png" alt="Algotech" width={130} height={38} className="object-contain" /></a>
            <div className="w-px h-6 bg-gray-200 hidden sm:block" />
            <span className="text-sm font-black text-brand-cyan uppercase tracking-tight hidden sm:block">POP plány</span>
          </div>
          <div className="flex items-center gap-4 sm:gap-6">
            <a href="/admin/parameters?tab=manageri" className="text-gray-400 hover:text-brand-cyan text-xs font-black uppercase tracking-widest transition-all px-2 py-1 rounded-lg hover:ring-2 hover:ring-brand-cyan hidden sm:block">Plány</a>
            <a href="/admin/reports" className="text-gray-400 hover:text-brand-cyan text-xs font-black uppercase tracking-widest transition-all px-2 py-1 rounded-lg hover:ring-2 hover:ring-brand-cyan hidden sm:block">Reporty</a>
            <a href="/admin/pop" className="bg-brand-cyan/10 text-brand-cyan border border-brand-cyan/30 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest">POP</a>
            <a href="/admin" className="text-gray-400 hover:text-brand-cyan text-xs font-black uppercase tracking-widest transition-all px-2 py-1 rounded-lg hover:ring-2 hover:ring-brand-cyan hidden sm:block">Uživatelé</a>
            <a href="/" className="text-gray-400 hover:text-brand-cyan text-xs font-black uppercase tracking-widest transition-all px-2 py-1 rounded-lg hover:ring-2 hover:ring-brand-cyan">← Cockpit</a>
          </div>
        </div>
      </nav>
      <div className="max-w-3xl mx-auto p-8 space-y-8">

        {/* SEZNAM PLÁNŮ */}
        <section className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-4">
          <h2 className="text-[11px] font-black text-brand-cyan uppercase tracking-[0.3em] italic mb-6">POP plány</h2>

          {plans.length === 0 && (
            <p className="text-sm text-gray-400 italic">Zatím nejsou vytvořeny žádné POP plány.</p>
          )}

          {plans.map(plan => (
            <div key={plan.id} className="flex items-center gap-4 bg-gray-50 border border-gray-200 rounded-2xl px-5 py-4">
              <div className="flex-1 min-w-0">
                <p className="font-black text-gray-900 text-sm italic uppercase truncate">{plan.name}</p>
                {plan.description && (
                  <p className="text-[11px] text-gray-400 mt-0.5 truncate">{plan.description}</p>
                )}
                <div className="flex gap-3 mt-1.5 flex-wrap">
                  {plan.grantEbitda > 0 && <span className="text-[10px] font-bold text-gray-500">EBITDA {fmt(plan.grantEbitda)}</span>}
                  <span className="text-[10px] font-bold text-gray-500">Základ ×{plan.baseMultiplier}</span>
                  <span className="text-[10px] font-bold text-gray-500">{plan.vestingGranularity === "YEARLY" ? `${plan.vestingYears} roků` : "kvartálně"}</span>
                  <span className="text-[10px] font-bold text-brand-cyan">{plan._count?.assignments ?? 0} lidí</span>
                  <span className="text-[10px] font-bold text-brand-pink">{plan._count?.boosters ?? 0} boosterů</span>
                </div>
              </div>
              <a
                href={`/admin/pop/${plan.id}`}
                className="bg-brand-cyan text-brand-navy px-4 py-2 rounded-xl font-black uppercase text-[9px] tracking-widest hover:bg-brand-pink hover:text-white transition-all shadow-sm flex-shrink-0"
              >
                Detail →
              </a>
            </div>
          ))}
        </section>

        {/* NOVÝ PLÁN */}
        <section className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
          <h2 className="text-[11px] font-black text-brand-cyan uppercase tracking-[0.3em] italic mb-6">Nový POP plán</h2>
          <form action={createPopPlan} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                name="name" required placeholder="Název (např. POP 2024)"
                className="bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3.5 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all placeholder:text-gray-400 text-gray-900"
              />
              <input
                name="description" placeholder="Popis (volitelné)"
                className="bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3.5 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all placeholder:text-gray-400 text-gray-900"
              />
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5 ml-1">Základní multiplikátor</label>
                <input
                  name="baseMultiplier" type="number" step="0.1" defaultValue="6" required
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3.5 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all text-gray-900"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5 ml-1">Délka vestingu (roky)</label>
                <input
                  name="vestingYears" type="number" min="1" max="10" defaultValue="4" required
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3.5 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all text-gray-900"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5 ml-1">Min. růst hodnoty (%)</label>
                <input
                  name="minGrowthPercent" type="number" step="0.1" min="0" defaultValue="0"
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3.5 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all text-gray-900"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5 ml-1">Frekvence vyplácení</label>
                <select
                  name="vestingGranularity" defaultValue="YEARLY"
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3.5 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all text-gray-900"
                >
                  <option value="YEARLY">Ročně</option>
                  <option value="QUARTERLY">Čtvrtletně</option>
                </select>
              </div>
            </div>
            <button
              type="submit"
              className="bg-brand-cyan text-brand-navy px-8 py-3.5 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-brand-pink hover:text-white transition-all shadow-sm active:scale-95"
            >
              Vytvořit POP plán
            </button>
          </form>
        </section>

      </div>
    </div>
  )
}
