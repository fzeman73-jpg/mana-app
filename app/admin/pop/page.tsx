import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { redirect } from "next/navigation"
import Image from "next/image"
import { createPopPlan, deletePopPlan } from "@/lib/actions"

type PopPlanRow = {
  id: string
  name: string
  description: string | null
  baseMultiplier: number
  vestingYears: number
  vestingGranularity: string
  _count?: { assignments: number; boosters: number }
}

export default async function PopAdminPage() {
  const session = await auth()
  const caller = await prisma.user.findUnique({ where: { email: session?.user?.email || "" } })
  if (caller?.role !== "ADMIN") redirect("/")

  const pp = prisma as unknown as {
    popPlan: {
      findMany: (a: object) => Promise<PopPlanRow[]>
    }
  }

  const plans = await pp.popPlan.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { assignments: true, boosters: true } } },
  })

  return (
    <div className="min-h-screen bg-gray-50 p-8 font-sans selection:bg-brand-cyan/20">
      <div className="max-w-3xl mx-auto space-y-8">

        {/* HLAVIČKA */}
        <header className="flex flex-col md:flex-row justify-between items-center bg-white p-10 rounded-[3rem] shadow-sm border border-gray-100 gap-6">
          <div className="flex items-center gap-6">
            <a href="/"><Image src="/algotech-logo.png" alt="Algotech" width={160} height={46} className="object-contain" /></a>
            <div className="w-px h-10 bg-gray-200 hidden md:block" />
            <div>
              <h1 className="text-xl font-black italic uppercase tracking-tighter text-gray-900">
                Správa <span className="text-brand-cyan">POP plánů</span>
              </h1>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-0.5">Phantom Option Plan</p>
            </div>
          </div>
          <a href="/admin" className="bg-brand-cyan text-brand-navy px-6 py-3 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] hover:bg-brand-pink hover:text-white transition-all shadow-sm">
            ← Admin
          </a>
        </header>

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
                  <span className="text-[10px] font-bold text-gray-500">Základ ×{plan.baseMultiplier}</span>
                  <span className="text-[10px] font-bold text-gray-500">Vesting {plan.vestingYears}r</span>
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
            <div className="grid grid-cols-3 gap-3">
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
