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

  const [companyParams, compensation, kpiTasks] = await Promise.all([
    selectedPeriod
      ? prisma.companyParameters.findUnique({ where: { periodId: selectedPeriod.id } })
      : null,
    selectedPeriod && selectedUser
      ? prisma.compensation.findUnique({ where: { userId_periodId: { userId: selectedUser.id, periodId: selectedPeriod.id } } })
      : null,
    selectedPeriod && selectedUser
      ? prisma.kpiTask.findMany({ where: { userId: selectedUser.id, periodId: selectedPeriod.id }, orderBy: { name: "asc" } })
      : [],
  ])

  const baseUrl = `/admin/parameters`
  const periodUrl = (pid: string) => `${baseUrl}?periodId=${pid}${userId ? `&userId=${userId}` : ''}`
  const userUrl   = (uid: string) => `${baseUrl}?periodId=${periodId}&userId=${uid}`

  return (
    <div className="min-h-screen bg-gray-50 p-8 font-sans selection:bg-brand-cyan/20">
      <div className="max-w-5xl mx-auto space-y-8">

        {/* HLAVIČKA */}
        <header className="flex flex-col md:flex-row justify-between items-center bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm gap-6">
          <div className="flex items-center gap-5">
            <a href="/"><Image src="/algotech-logo.png" alt="Algotech" width={160} height={46} className="object-contain" /></a>
            <div className="w-px h-10 bg-gray-200 hidden md:block" />
            <div>
              <h1 className="text-xl font-black italic uppercase tracking-tighter text-gray-900">
                <span className="text-brand-pink">Parametry</span>
              </h1>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Firemní metriky a odměny</p>
            </div>
          </div>
          {isAdmin && (
            <a href="/admin" className="bg-brand-cyan text-brand-navy px-6 py-3 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] hover:bg-brand-pink hover:text-white transition-all shadow-sm">
              ← Správa uživatelů
            </a>
          )}
        </header>

        {/* OBDOBÍ */}
        <section className="bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm">
          <h2 className="text-[11px] font-black text-brand-cyan uppercase tracking-[0.3em] italic mb-6">Časové období</h2>

          {periods.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
              {periods.map(p => (
                <div key={p.id} className={`rounded-2xl border p-4 transition-all ${selectedPeriod?.id === p.id ? 'border-brand-cyan bg-brand-cyan/5 ring-2 ring-brand-cyan/20' : 'border-gray-200 hover:border-gray-300'}`}>
                  <div className="flex justify-between items-start mb-3">
                    <a href={periodUrl(p.id)} className="flex-1">
                      <p className="font-black text-gray-900 text-sm">{p.name}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {new Date(p.startDate).toLocaleDateString('cs-CZ')} – {new Date(p.endDate).toLocaleDateString('cs-CZ')}
                      </p>
                    </a>
                    {p.isActive && (
                      <span className="text-[8px] font-black bg-brand-green/20 text-brand-green px-2 py-1 rounded-full uppercase tracking-widest ml-2 flex-shrink-0">Aktivní</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {!p.isActive && (
                      <form action={setActivePeriod.bind(null, p.id)}>
                        <button type="submit" className="text-[9px] font-black text-gray-400 hover:text-brand-green uppercase tracking-widest transition-colors">
                          Aktivovat
                        </button>
                      </form>
                    )}
                    {isAdmin && (
                      <form action={deletePeriod.bind(null, p.id)} className="ml-auto">
                        <button type="submit" className="text-[9px] font-black text-gray-300 hover:text-brand-pink uppercase tracking-widest transition-colors">
                          Smazat
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-sm italic mb-6">Zatím žádná období. Vytvořte první.</p>
          )}

          {isAdmin && (
            <form action={createPeriod} className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-gray-100">
              <input name="name" placeholder="Název (např. Rok 2025)" required
                className="flex-1 bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all placeholder:text-gray-400 text-gray-900" />
              <input name="startDate" type="date" required
                className="bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all text-gray-900" />
              <input name="endDate" type="date" required
                className="bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all text-gray-900" />
              <button type="submit" className="bg-brand-cyan text-brand-navy px-6 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-brand-pink hover:text-white transition-all shadow-sm active:scale-95">
                Vytvořit
              </button>
            </form>
          )}
        </section>

        {selectedPeriod && (<>

          {/* FIREMNÍ PARAMETRY */}
          <section className="bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm">
            <h2 className="text-[11px] font-black text-brand-cyan uppercase tracking-[0.3em] italic mb-6">Firemní parametry — {selectedPeriod.name}</h2>

            <form action={updateCompanyParameters.bind(null, selectedPeriod.id)} className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <Field label="Aktuální EBITDA (CZK)" name="currentEbitda" defaultValue={companyParams?.currentEbitda ?? 0} hint={companyParams ? `Nyní: ${fmt(companyParams.currentEbitda)} CZK` : undefined} color="cyan" />
                <Field label="Cílová EBITDA (CZK)" name="targetEbitda" defaultValue={companyParams?.targetEbitda ?? 0} hint={companyParams ? `Cíl: ${fmt(companyParams.targetEbitda)} CZK` : undefined} color="cyan" />
                <Field label="Aktuální HORIZONT" name="currentHorizont" defaultValue={companyParams?.currentHorizont ?? 0} step="0.01" color="pink" />
                <Field label="Cílový HORIZONT" name="targetHorizont" defaultValue={companyParams?.targetHorizont ?? 0} step="0.01" color="pink" />
              </div>
              <div className="flex gap-5 items-end">
                <div className="flex-1 max-w-xs">
                  <Field label="POP Multiplier" name="currentMultiplier" defaultValue={companyParams?.currentMultiplier ?? 6.0} step="0.1" color="green" />
                  {companyParams && (
                    <p className="text-[10px] text-gray-400 mt-1 ml-1">
                      Hodnota firmy: {fmt((companyParams.currentEbitda || 0) * companyParams.currentMultiplier)} CZK
                    </p>
                  )}
                </div>
                <button type="submit" className="bg-brand-cyan text-brand-navy px-8 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-brand-pink hover:text-white transition-all shadow-sm active:scale-95 mb-0.5">
                  Uložit
                </button>
              </div>
            </form>
          </section>

          {/* VÝBĚR UŽIVATELE */}
          <section className="bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm">
            <h2 className="text-[11px] font-black text-brand-cyan uppercase tracking-[0.3em] italic mb-6">Vyberte uživatele</h2>
            <div className="flex flex-wrap gap-3">
              {users.map(u => (
                <a key={u.id} href={userUrl(u.id)}
                  className={`px-5 py-3 rounded-2xl border font-black text-sm transition-all ${
                    selectedUser?.id === u.id
                      ? 'border-brand-cyan bg-brand-cyan/10 text-brand-cyan ring-2 ring-brand-cyan/20'
                      : 'border-gray-200 text-gray-700 hover:border-brand-cyan/40 hover:text-brand-cyan'
                  }`}>
                  {u.name || u.email}
                </a>
              ))}
            </div>
          </section>

        </>)}

        {selectedPeriod && selectedUser && (<>

          {/* ODMĚNA */}
          <section className="bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm">
            <h2 className="text-[11px] font-black text-brand-cyan uppercase tracking-[0.3em] italic mb-1">Odměna — {selectedUser.name || selectedUser.email}</h2>
            <p className="text-[10px] text-gray-400 mb-6">{selectedPeriod.name}</p>

            <form action={adminSetCompensation.bind(null, selectedUser.id, selectedPeriod.id)} className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <Field label="Základní plat / měs. (CZK)" name="baseSalary" defaultValue={compensation?.baseSalary ?? 0} color="cyan" />
                <Field label="Roční cílová odměna (CZK)" name="targetBonusAnnual" defaultValue={compensation?.targetBonusAnnual ?? 0} color="cyan" />
              </div>

              <div className="pt-4 border-t border-gray-100">
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4">Váhy bonusu (%)</p>
                <div className="grid grid-cols-3 gap-4">
                  <Field label="EBITDA %" name="bonusWeightEbitda" defaultValue={compensation?.bonusWeightEbitda ?? 33} step="0.1" color="cyan" />
                  <Field label="HORIZONT %" name="bonusWeightHorizont" defaultValue={compensation?.bonusWeightHorizont ?? 33} step="0.1" color="pink" />
                  <Field label="KPI %" name="bonusWeightKpi" defaultValue={compensation?.bonusWeightKpi ?? 34} step="0.1" color="green" />
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100">
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4">Phantom Option Plan</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Field label="Share %" name="sharePercent" defaultValue={compensation?.sharePercent ?? 0} step="0.01" color="pink" />
                  <Field label="Grant EBITDA (CZK)" name="grantEbitda" defaultValue={compensation?.grantEbitda ?? 0} color="pink" />
                  <Field label="Grant Multiplier" name="grantMultiplier" defaultValue={compensation?.grantMultiplier ?? 0} step="0.1" color="pink" />
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">Vesting (roky)</label>
                    <input name="vestingYears" type="number" step="1" defaultValue={compensation?.vestingYears ?? 3}
                      className="w-full bg-gray-50 rounded-2xl px-5 py-3.5 font-black border-2 border-gray-200 focus:border-brand-cyan outline-none transition-all text-gray-900" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">Datum grantu</label>
                    <input name="grantDate" type="date"
                      defaultValue={compensation?.grantDate ? new Date(compensation.grantDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]}
                      className="w-full bg-gray-50 rounded-2xl px-5 py-3.5 font-black border-2 border-gray-200 focus:border-brand-cyan outline-none transition-all text-gray-900" />
                  </div>
                </div>
              </div>

              <button type="submit" className="w-full bg-brand-cyan text-brand-navy py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-brand-pink hover:text-white transition-all shadow-sm active:scale-95">
                Uložit odměnu
              </button>
            </form>
          </section>

          {/* KPI ÚKOLY */}
          <section className="bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm">
            <h2 className="text-[11px] font-black text-brand-cyan uppercase tracking-[0.3em] italic mb-1">KPI úkoly — {selectedUser.name || selectedUser.email}</h2>
            <p className="text-[10px] text-gray-400 mb-6">{selectedPeriod.name}</p>

            <form action={adminAddKpiTask.bind(null, selectedUser.id, selectedPeriod.id)} className="flex gap-3 mb-6 bg-gray-50 p-4 rounded-2xl border border-gray-200">
              <input name="name" placeholder="Název KPI úkolu..." required
                className="flex-1 bg-transparent px-3 py-2 outline-none font-bold text-sm text-gray-900 placeholder:text-gray-400" />
              <input name="weight" type="number" step="1" min="0" max="100" placeholder="váha %" required
                className="w-24 bg-white rounded-xl px-3 py-2 text-center font-black text-brand-cyan border-2 border-gray-200 focus:border-brand-cyan outline-none transition-all text-sm" />
              <button type="submit" className="bg-brand-cyan text-brand-navy px-5 py-2 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-brand-pink hover:text-white transition-all active:scale-95">
                Přidat
              </button>
            </form>

            {kpiTasks.length === 0 ? (
              <p className="text-center text-gray-400 py-8 text-sm italic border-2 border-dashed border-gray-200 rounded-2xl">Žádné KPI úkoly pro toto období.</p>
            ) : (
              <div className="space-y-2">
                {kpiTasks.map(t => (
                  <div key={t.id} className={`flex items-center justify-between p-4 rounded-2xl border ${t.isCompleted ? 'bg-brand-green/5 border-brand-green/20' : 'bg-gray-50 border-gray-200'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${t.isCompleted ? 'bg-brand-green' : 'bg-gray-300'}`} />
                      <p className={`font-black text-sm ${t.isCompleted ? 'text-brand-green italic' : 'text-gray-900'}`}>{t.name}</p>
                      <span className="text-[9px] font-black text-brand-cyan bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200">{t.weight}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-black px-2.5 py-1 rounded-full uppercase ${t.isCompleted ? 'bg-brand-green/20 text-brand-green' : 'bg-gray-100 text-gray-400'}`}>
                        {t.isCompleted ? 'Splněno' : 'Čeká'}
                      </span>
                      <form action={adminDeleteKpiTask.bind(null, t.id)}>
                        <button className="text-gray-300 hover:text-brand-pink p-1.5 rounded-lg transition-colors">
                          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                        </button>
                      </form>
                    </div>
                  </div>
                ))}
                <p className="text-[10px] text-gray-400 text-right pt-1">
                  Celková váha: {kpiTasks.reduce((s, t) => s + t.weight, 0)}%
                  {kpiTasks.reduce((s, t) => s + t.weight, 0) !== 100 && <span className="text-brand-pink ml-1">(doporučeno 100%)</span>}
                </p>
              </div>
            )}
          </section>

        </>)}

      </div>
    </div>
  )
}

function Field({ label, name, defaultValue, step = "1", hint, color = "cyan" }: {
  label: string; name: string; defaultValue: number; step?: string; hint?: string
  color?: "cyan" | "pink" | "green"
}) {
  const borderFocus = color === "cyan" ? "focus:border-brand-cyan" : color === "pink" ? "focus:border-brand-pink" : "focus:border-brand-green"
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">{label}</label>
      <input name={name} type="number" step={step} defaultValue={defaultValue}
        className={`w-full bg-gray-50 rounded-2xl px-5 py-3.5 font-black border-2 border-gray-200 ${borderFocus} outline-none transition-all text-gray-900`} />
      {hint && <p className="text-[10px] text-gray-400 ml-1">{hint}</p>}
    </div>
  )
}
