import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import {
  createPeriod, deletePeriod, setActivePeriod,
  updateCompanyParameters, adminSetCompensation,
  adminAddKpiTask, adminDeleteKpiTask,
} from "@/lib/actions"
import Image from "next/image"
import { redirect } from "next/navigation"

const fmt = (n: number) => Intl.NumberFormat('cs-CZ').format(Math.round(n))

export default async function ParametersPage({
  searchParams,
}: {
  searchParams: Promise<{ periodId?: string; userId?: string }>
}) {
  const session = await auth()
  const caller = await prisma.user.findUnique({ where: { email: session?.user?.email || "" } })
  if (caller?.role !== "ADMIN" && caller?.role !== "MANAGER") redirect("/")
  const isAdmin = caller?.role === "ADMIN"

  const { periodId, userId } = await searchParams

  const [periods, users] = await Promise.all([
    prisma.period.findMany({ orderBy: { startDate: "desc" } }),
    prisma.user.findMany({ where: { isAllowed: true }, orderBy: { name: "asc" } }),
  ])

  const selectedPeriod = periods.find(p => p.id === periodId) ?? null
  const selectedUser   = users.find(u => u.id === userId) ?? null

  // Načtení dat pro vybrané období
  const [companyParams, allCompensations] = await Promise.all([
    selectedPeriod
      ? prisma.companyParameters.findUnique({ where: { periodId: selectedPeriod.id } })
      : null,
    selectedPeriod
      ? prisma.compensation.findMany({ where: { periodId: selectedPeriod.id } })
      : [],
  ])

  const compensation = selectedPeriod && selectedUser
    ? allCompensations.find(c => c.userId === selectedUser.id) ?? null
    : null

  const kpiTasks = selectedPeriod && selectedUser
    ? await prisma.kpiTask.findMany({
        where: { userId: selectedUser.id, periodId: selectedPeriod.id },
        orderBy: { name: "asc" },
      })
    : []

  const periodUrl = (pid: string) => `/admin/parameters?periodId=${pid}${userId ? `&userId=${userId}` : ''}`
  const userUrl   = (uid: string) => `/admin/parameters?periodId=${periodId}&userId=${uid}`

  return (
    <div className="min-h-screen bg-gray-50 font-sans selection:bg-brand-cyan/20">

      {/* HLAVIČKA */}
      <header className="bg-white border-b border-gray-100 px-8 py-5 flex justify-between items-center sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-5">
          <a href="/"><Image src="/algotech-logo.png" alt="Algotech" width={140} height={40} className="object-contain" /></a>
          <div className="w-px h-8 bg-gray-200" />
          <div>
            <h1 className="text-base font-black italic uppercase tracking-tight text-gray-900">
              <span className="text-brand-pink">Parametry</span>
            </h1>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Firemní metriky a odměny manažerů</p>
          </div>
        </div>
        {isAdmin && (
          <a href="/admin" className="bg-brand-cyan text-brand-navy px-5 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-brand-pink hover:text-white transition-all">
            ← Správa uživatelů
          </a>
        )}
      </header>

      <div className="max-w-6xl mx-auto p-8 space-y-8">

        {/* OBDOBÍ */}
        <section className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-[11px] font-black text-brand-cyan uppercase tracking-[0.3em] italic">Časové období</h2>
            {selectedPeriod && (
              <span className="text-[10px] font-black text-brand-cyan bg-brand-cyan/10 px-3 py-1 rounded-full border border-brand-cyan/20">
                Vybráno: {selectedPeriod.name}
              </span>
            )}
          </div>

          {periods.length > 0 ? (
            <div className="flex flex-wrap gap-3 mb-6">
              {periods.map(p => (
                <a key={p.id} href={periodUrl(p.id)}
                  className={`flex items-center gap-3 px-5 py-3 rounded-2xl border transition-all ${
                    selectedPeriod?.id === p.id
                      ? 'border-brand-cyan bg-brand-cyan/5 ring-2 ring-brand-cyan/20'
                      : 'border-gray-200 hover:border-brand-cyan/40'
                  }`}>
                  <div>
                    <p className="font-black text-gray-900 text-sm">{p.name}</p>
                    <p className="text-[10px] text-gray-400">
                      {new Date(p.startDate).toLocaleDateString('cs-CZ')} – {new Date(p.endDate).toLocaleDateString('cs-CZ')}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1 items-end">
                    {p.isActive && <span className="text-[8px] font-black bg-brand-green/20 text-brand-green px-2 py-0.5 rounded-full uppercase tracking-widest">Aktivní</span>}
                    <div className="flex gap-2">
                      {!p.isActive && (
                        <form action={setActivePeriod.bind(null, p.id)} onClick={e => e.stopPropagation()}>
                          <button type="submit" className="text-[9px] font-black text-gray-400 hover:text-brand-green transition-colors">aktivovat</button>
                        </form>
                      )}
                      {isAdmin && (
                        <form action={deletePeriod.bind(null, p.id)} onClick={e => e.stopPropagation()}>
                          <button type="submit" className="text-[9px] font-black text-gray-300 hover:text-brand-pink transition-colors">smazat</button>
                        </form>
                      )}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-sm italic mb-6">Zatím žádná období — vytvořte první.</p>
          )}

          {isAdmin && (
            <form action={createPeriod} className="flex flex-col sm:flex-row gap-3 pt-5 border-t border-gray-100">
              <input name="name" placeholder="Název (např. Rok 2025)" required
                className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all placeholder:text-gray-400 text-gray-900" />
              <input name="startDate" type="date" required
                className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all text-gray-900" />
              <input name="endDate" type="date" required
                className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all text-gray-900" />
              <button type="submit" className="bg-brand-cyan text-brand-navy px-6 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-brand-pink hover:text-white transition-all active:scale-95">
                + Přidat
              </button>
            </form>
          )}
        </section>

        {selectedPeriod && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

            {/* LEVÝ SLOUP: Seznam uživatelů */}
            <div className="lg:col-span-1 space-y-4">

              {/* Firemní parametry (kompaktní) */}
              <section className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
                <h3 className="text-[11px] font-black text-brand-cyan uppercase tracking-[0.3em] italic mb-4">Firemní parametry</h3>
                <form action={updateCompanyParameters.bind(null, selectedPeriod.id)} className="space-y-3">
                  <MiniField label="Aktuální EBITDA (CZK)" name="currentEbitda" defaultValue={companyParams?.currentEbitda ?? 0} />
                  <MiniField label="Cílová EBITDA (CZK)" name="targetEbitda" defaultValue={companyParams?.targetEbitda ?? 0} />
                  <MiniField label="Aktuální HORIZONT" name="currentHorizont" defaultValue={companyParams?.currentHorizont ?? 0} step="0.01" />
                  <MiniField label="Cílový HORIZONT" name="targetHorizont" defaultValue={companyParams?.targetHorizont ?? 0} step="0.01" />
                  <MiniField label="POP Multiplier" name="currentMultiplier" defaultValue={companyParams?.currentMultiplier ?? 6.0} step="0.1" />
                  {companyParams && (
                    <p className="text-[10px] text-gray-400">
                      Hodnota firmy: {fmt(companyParams.currentEbitda * companyParams.currentMultiplier)} CZK
                    </p>
                  )}
                  <button type="submit" className="w-full bg-brand-cyan text-brand-navy py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-brand-pink hover:text-white transition-all active:scale-95">
                    Uložit
                  </button>
                </form>
              </section>

              {/* Seznam uživatelů */}
              <section className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h3 className="text-[11px] font-black text-brand-cyan uppercase tracking-[0.3em] italic">Manažeři</h3>
                </div>
                <div className="divide-y divide-gray-100">
                  {users.map(u => {
                    const hasComp = allCompensations.some(c => c.userId === u.id)
                    const isSelected = selectedUser?.id === u.id
                    return (
                      <a key={u.id} href={userUrl(u.id)}
                        className={`flex items-center gap-3 px-5 py-4 transition-all ${isSelected ? 'bg-brand-cyan/5 border-l-4 border-brand-cyan' : 'hover:bg-gray-50 border-l-4 border-transparent'}`}>
                        <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center font-black text-brand-cyan text-sm border border-gray-200 flex-shrink-0">
                          {u.name?.charAt(0) || u.email?.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-black text-gray-900 text-sm truncate">{u.name || u.email}</p>
                          <p className="text-[10px] text-gray-400 truncate">{u.email}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${
                            u.role === "ADMIN"   ? "bg-brand-cyan/10 text-brand-cyan" :
                            u.role === "MANAGER" ? "bg-brand-pink/10 text-brand-pink" :
                                                    "bg-gray-100 text-gray-400"
                          }`}>{u.role === "ADMIN" ? "Admin" : u.role === "MANAGER" ? "Manažer" : "User"}</span>
                          <span className={`text-[8px] font-black px-2 py-0.5 rounded-full ${hasComp ? 'text-brand-green bg-brand-green/10' : 'text-gray-300 bg-gray-100'}`}>
                            {hasComp ? '✓ odměna' : 'nenastaveno'}
                          </span>
                        </div>
                      </a>
                    )
                  })}
                </div>
              </section>
            </div>

            {/* PRAVÝ SLOUP: Detail uživatele */}
            <div className="lg:col-span-2">
              {!selectedUser ? (
                <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm flex items-center justify-center h-64">
                  <div className="text-center">
                    <p className="text-4xl mb-3">👈</p>
                    <p className="font-black text-gray-400 text-sm uppercase tracking-widest">Vyberte manažera ze seznamu</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">

                  {/* Identita */}
                  <div className="bg-white px-6 py-4 rounded-[2rem] border border-gray-100 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center font-black text-brand-cyan text-lg border border-gray-200">
                      {selectedUser.name?.charAt(0) || selectedUser.email?.charAt(0)}
                    </div>
                    <div>
                      <p className="font-black text-gray-900 text-base italic uppercase tracking-tight">{selectedUser.name || "—"}</p>
                      <p className="text-[11px] text-gray-400 font-bold">{selectedUser.email} · {selectedPeriod.name}</p>
                    </div>
                  </div>

                  {/* ODMĚNA */}
                  <section className="bg-white p-7 rounded-[2rem] border border-gray-100 shadow-sm">
                    <h3 className="text-[11px] font-black text-brand-cyan uppercase tracking-[0.3em] italic mb-5">Odměna</h3>
                    <form action={adminSetCompensation.bind(null, selectedUser.id, selectedPeriod.id)} className="space-y-5">

                      <div className="grid grid-cols-2 gap-4">
                        <Field label="Základní plat / měs. (CZK)" name="baseSalary" defaultValue={compensation?.baseSalary ?? 0} />
                        <Field label="Roční cílová odměna (CZK)" name="targetBonusAnnual" defaultValue={compensation?.targetBonusAnnual ?? 0} />
                      </div>

                      <div className="pt-4 border-t border-gray-100">
                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">Váhy bonusu (%)</p>
                        <div className="grid grid-cols-3 gap-3">
                          <Field label="EBITDA %" name="bonusWeightEbitda" defaultValue={compensation?.bonusWeightEbitda ?? 33} step="0.1" />
                          <Field label="HORIZONT %" name="bonusWeightHorizont" defaultValue={compensation?.bonusWeightHorizont ?? 33} step="0.1" />
                          <Field label="KPI %" name="bonusWeightKpi" defaultValue={compensation?.bonusWeightKpi ?? 34} step="0.1" />
                        </div>
                      </div>

                      <div className="pt-4 border-t border-gray-100">
                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">Phantom Option Plan</p>
                        <div className="grid grid-cols-3 gap-3">
                          <Field label="Share %" name="sharePercent" defaultValue={compensation?.sharePercent ?? 0} step="0.01" />
                          <Field label="Grant EBITDA (CZK)" name="grantEbitda" defaultValue={compensation?.grantEbitda ?? 0} />
                          <Field label="Grant Multiplier" name="grantMultiplier" defaultValue={compensation?.grantMultiplier ?? 0} step="0.1" />
                        </div>
                        <div className="grid grid-cols-2 gap-3 mt-3">
                          <Field label="Vesting (roky)" name="vestingYears" defaultValue={compensation?.vestingYears ?? 3} step="1" />
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">Datum grantu</label>
                            <input name="grantDate" type="date"
                              defaultValue={compensation?.grantDate ? new Date(compensation.grantDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]}
                              className="w-full bg-gray-50 rounded-xl px-4 py-3 font-bold border-2 border-gray-200 focus:border-brand-cyan outline-none transition-all text-gray-900 text-sm" />
                          </div>
                        </div>
                      </div>

                      <button type="submit" className="w-full bg-brand-cyan text-brand-navy py-3.5 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-brand-pink hover:text-white transition-all active:scale-95">
                        Uložit odměnu
                      </button>
                    </form>
                  </section>

                  {/* KPI ÚKOLY */}
                  <section className="bg-white p-7 rounded-[2rem] border border-gray-100 shadow-sm">
                    <h3 className="text-[11px] font-black text-brand-cyan uppercase tracking-[0.3em] italic mb-5">KPI úkoly</h3>

                    <form action={adminAddKpiTask.bind(null, selectedUser.id, selectedPeriod.id)} className="flex gap-3 mb-5 bg-gray-50 p-3 rounded-xl border border-gray-200">
                      <input name="name" placeholder="Název úkolu..." required
                        className="flex-1 bg-transparent px-3 py-2 outline-none font-bold text-sm text-gray-900 placeholder:text-gray-400" />
                      <input name="weight" type="number" step="1" min="0" max="100" placeholder="%" required
                        className="w-20 bg-white rounded-lg px-3 py-2 text-center font-black text-brand-cyan border-2 border-gray-200 focus:border-brand-cyan outline-none text-sm" />
                      <button type="submit" className="bg-brand-cyan text-brand-navy px-4 py-2 rounded-lg font-black uppercase text-[10px] tracking-widest hover:bg-brand-pink hover:text-white transition-all active:scale-95">
                        + Přidat
                      </button>
                    </form>

                    {kpiTasks.length === 0 ? (
                      <p className="text-center text-gray-300 py-8 text-sm italic border-2 border-dashed border-gray-100 rounded-xl">
                        Žádné KPI úkoly pro toto období.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {kpiTasks.map(t => (
                          <div key={t.id} className={`flex items-center justify-between px-4 py-3 rounded-xl border ${t.isCompleted ? 'bg-brand-green/5 border-brand-green/20' : 'bg-gray-50 border-gray-200'}`}>
                            <div className="flex items-center gap-3">
                              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${t.isCompleted ? 'bg-brand-green' : 'bg-gray-300'}`} />
                              <p className={`font-bold text-sm ${t.isCompleted ? 'text-brand-green italic' : 'text-gray-900'}`}>{t.name}</p>
                              <span className="text-[9px] font-black text-brand-cyan bg-white px-2 py-0.5 rounded-full border border-gray-200">{t.weight}%</span>
                            </div>
                            <form action={adminDeleteKpiTask.bind(null, t.id)}>
                              <button className="text-gray-300 hover:text-brand-pink p-1 rounded transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                              </button>
                            </form>
                          </div>
                        ))}
                        <p className={`text-[10px] text-right pt-1 ${kpiTasks.reduce((s, t) => s + t.weight, 0) === 100 ? 'text-brand-green font-black' : 'text-gray-400'}`}>
                          Celková váha: {kpiTasks.reduce((s, t) => s + t.weight, 0)}%
                          {kpiTasks.reduce((s, t) => s + t.weight, 0) !== 100 && <span className="text-brand-pink ml-1">(doporučeno 100%)</span>}
                        </p>
                      </div>
                    )}
                  </section>

                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

function Field({ label, name, defaultValue, step = "1" }: {
  label: string; name: string; defaultValue: number; step?: string
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">{label}</label>
      <input name={name} type="number" step={step} defaultValue={defaultValue}
        className="w-full bg-gray-50 rounded-xl px-4 py-3 font-black border-2 border-gray-200 focus:border-brand-cyan outline-none transition-all text-gray-900 text-sm" />
    </div>
  )
}

function MiniField({ label, name, defaultValue, step = "1" }: {
  label: string; name: string; defaultValue: number; step?: string
}) {
  return (
    <div className="space-y-1">
      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">{label}</label>
      <input name={name} type="number" step={step} defaultValue={defaultValue}
        className="w-full bg-gray-50 rounded-lg px-3 py-2 font-black border border-gray-200 focus:border-brand-cyan outline-none transition-all text-gray-900 text-sm" />
    </div>
  )
}
