import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import Image from "next/image"
import { redirect } from "next/navigation"

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  INVITE_USER:           { label: "Přidán uživatel",     color: "bg-brand-cyan/10 text-brand-cyan" },
  ACTIVATE_USER:         { label: "Aktivace účtu",        color: "bg-brand-green/10 text-brand-green" },
  DEACTIVATE_USER:       { label: "Deaktivace účtu",      color: "bg-gray-100 text-gray-400" },
  DELETE_USER:           { label: "Smazán uživatel",      color: "bg-brand-pink/10 text-brand-pink" },
  SET_ROLE:              { label: "Změna role",            color: "bg-brand-cyan/10 text-brand-cyan" },
  SET_PASSWORD:          { label: "Nastavení hesla",       color: "bg-gray-100 text-gray-500" },
  CHANGE_OWN_PASSWORD:   { label: "Změna hesla",           color: "bg-gray-100 text-gray-500" },
  SET_DIVISION:          { label: "Přiřazení divize",      color: "bg-brand-cyan/10 text-brand-cyan" },
  CREATE_DIVISION:       { label: "Nová divize",           color: "bg-brand-cyan/10 text-brand-cyan" },
  DELETE_DIVISION:       { label: "Smazána divize",        color: "bg-brand-pink/10 text-brand-pink" },
  CREATE_PERIOD:         { label: "Nové období",           color: "bg-brand-green/10 text-brand-green" },
  SET_ACTIVE_PERIOD:     { label: "Aktivace období",       color: "bg-brand-green/10 text-brand-green" },
  DELETE_PERIOD:         { label: "Smazáno období",        color: "bg-brand-pink/10 text-brand-pink" },
  CREATE_PARAMETER:      { label: "Nový parametr",         color: "bg-brand-cyan/10 text-brand-cyan" },
  UPDATE_PARAMETER:      { label: "Upraven parametr",      color: "bg-gray-100 text-gray-500" },
  DELETE_PARAMETER:      { label: "Smazán parametr",       color: "bg-brand-pink/10 text-brand-pink" },
  UPDATE_QUARTERLY_RESULT: { label: "Výsledek kvartálu",  color: "bg-gray-100 text-gray-500" },
  LOCK_QUARTER:          { label: "Uzamčen kvartál",       color: "bg-brand-navy/10 text-brand-navy" },
  CLOSE_QUARTER:         { label: "Uzavřen kvartál",       color: "bg-brand-navy/10 text-brand-navy" },
  UPDATE_VESTING_BASE:   { label: "Valuační základ",       color: "bg-gray-100 text-gray-500" },
  CREATE_BOOSTER:        { label: "Nový booster",          color: "bg-brand-green/10 text-brand-green" },
  TOGGLE_BOOSTER:        { label: "Booster toggled",       color: "bg-brand-green/10 text-brand-green" },
  DELETE_BOOSTER:        { label: "Smazán booster",        color: "bg-brand-pink/10 text-brand-pink" },
  SET_COMPENSATION:      { label: "Odměna manažera",       color: "bg-brand-cyan/10 text-brand-cyan" },
  ADD_KPI_TASK:          { label: "Nový KPI úkol",         color: "bg-brand-cyan/10 text-brand-cyan" },
  DELETE_KPI_TASK:       { label: "Smazán KPI úkol",       color: "bg-brand-pink/10 text-brand-pink" },
  TOGGLE_KPI_TASK:       { label: "KPI toggled",           color: "bg-brand-green/10 text-brand-green" },
  MARK_VESTING_PAID:     { label: "Vesting vyplacen",      color: "bg-brand-green/10 text-brand-green" },
  MARK_VESTING_UNPAID:   { label: "Vesting zrušen",        color: "bg-brand-pink/10 text-brand-pink" },
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; action?: string; email?: string }>
}) {
  const session = await auth()
  const caller  = await prisma.user.findUnique({ where: { email: session?.user?.email || "" } })
  if (caller?.role !== "ADMIN") redirect("/")

  const { page = "1", action = "", email = "" } = await searchParams
  const pageNum  = Math.max(1, parseInt(page))
  const pageSize = 50
  const skip     = (pageNum - 1) * pageSize

  const where = {
    ...(action ? { action }              : {}),
    ...(email  ? { userEmail: { contains: email, mode: "insensitive" as const } } : {}),
  }

  const [logs, total, actors] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      select: { userEmail: true },
      distinct: ["userEmail"],
      orderBy: { userEmail: "asc" },
    }),
  ])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const actionKeys = Object.keys(ACTION_LABELS).sort()

  const href = (params: Record<string, string>) => {
    const base: Record<string, string> = {}
    if (action) base.action = action
    if (email)  base.email  = email
    if (page !== "1") base.page = page
    Object.assign(base, params)
    return `/admin/audit?${new URLSearchParams(Object.fromEntries(Object.entries(base).filter(([, v]) => v))).toString()}`
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <header className="bg-white border-b border-gray-100 px-8 py-4 flex justify-between items-center sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-4">
          <a href="/"><Image src="/algotech-logo.png" alt="Algotech" width={130} height={38} className="object-contain" /></a>
          <div className="w-px h-7 bg-gray-200" />
          <div>
            <h1 className="text-sm font-black italic uppercase tracking-tight text-gray-900">
              <span className="text-brand-pink">Audit</span> Log
            </h1>
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Historie změn · {total} záznamů</p>
          </div>
        </div>
        <a href="/admin" className="bg-gray-100 text-gray-600 px-4 py-2 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-brand-pink hover:text-white transition-all">
          ← Uživatelé
        </a>
      </header>

      <div className="max-w-6xl mx-auto p-8 space-y-6">

        {/* Filtry */}
        <section className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Akce</p>
              <div className="flex flex-wrap gap-1.5">
                <a href={href({ action: "", page: "1" })}
                  className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all border ${!action ? "bg-brand-navy text-white border-brand-navy" : "border-gray-200 text-gray-400 hover:border-brand-navy hover:text-brand-navy"}`}>
                  Vše
                </a>
                {actionKeys.map(a => {
                  const meta = ACTION_LABELS[a]
                  return (
                    <a key={a} href={href({ action: a, page: "1" })}
                      className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all border ${action === a ? "bg-brand-navy text-white border-brand-navy" : "border-gray-200 text-gray-400 hover:border-gray-400 hover:text-gray-700"}`}>
                      {meta.label}
                    </a>
                  )
                })}
              </div>
            </div>
            <div className="ml-auto">
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Uživatel</p>
              <div className="flex gap-1.5 flex-wrap">
                <a href={href({ email: "", page: "1" })}
                  className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all border ${!email ? "bg-brand-cyan text-brand-navy border-brand-cyan" : "border-gray-200 text-gray-400 hover:border-brand-cyan"}`}>
                  Všichni
                </a>
                {actors.map(a => (
                  <a key={a.userEmail} href={href({ email: a.userEmail, page: "1" })}
                    className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all border ${email === a.userEmail ? "bg-brand-cyan text-brand-navy border-brand-cyan" : "border-gray-200 text-gray-400 hover:border-brand-cyan"}`}>
                    {a.userEmail.split("@")[0]}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Tabulka */}
        <section className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
          {logs.length === 0 ? (
            <div className="p-16 text-center">
              <p className="text-gray-400 font-black italic text-sm uppercase tracking-widest">Žádné záznamy.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-6 py-4 text-[9px] font-black text-gray-400 uppercase tracking-widest">Čas</th>
                    <th className="text-left px-6 py-4 text-[9px] font-black text-gray-400 uppercase tracking-widest">Kdo</th>
                    <th className="text-left px-6 py-4 text-[9px] font-black text-gray-400 uppercase tracking-widest">Akce</th>
                    <th className="text-left px-6 py-4 text-[9px] font-black text-gray-400 uppercase tracking-widest">Cíl</th>
                    <th className="text-left px-6 py-4 text-[9px] font-black text-gray-400 uppercase tracking-widest">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {logs.map(log => {
                    const meta = ACTION_LABELS[log.action]
                    let detail = ""
                    try {
                      const nv = log.newValue ? JSON.parse(log.newValue) : null
                      if (nv) {
                        if (nv.role)       detail = `role → ${nv.role}`
                        else if (nv.name)  detail = nv.name
                        else if (nv.quarter !== undefined) detail = `Q${nv.quarter} ${nv.year}`
                        else               detail = JSON.stringify(nv).slice(0, 60)
                      }
                    } catch { /* noop */ }

                    return (
                      <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 text-[10px] text-gray-400 whitespace-nowrap">
                          <p className="font-bold text-gray-700">{new Date(log.createdAt).toLocaleDateString('cs-CZ')}</p>
                          <p>{new Date(log.createdAt).toLocaleTimeString('cs-CZ', { hour: "2-digit", minute: "2-digit" })}</p>
                        </td>
                        <td className="px-6 py-4 text-[11px] font-bold text-gray-600 whitespace-nowrap">
                          {log.userEmail.split("@")[0]}
                          <span className="text-gray-300">@{log.userEmail.split("@")[1]}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`text-[9px] font-black px-2 py-1 rounded-full uppercase tracking-wider ${meta?.color ?? "bg-gray-100 text-gray-400"}`}>
                            {meta?.label ?? log.action}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-[10px] text-gray-400 font-mono max-w-[200px] truncate">
                          {log.target ?? "—"}
                        </td>
                        <td className="px-6 py-4 text-[10px] text-gray-500 max-w-[220px] truncate">
                          {detail || "—"}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Paginace */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2">
            {pageNum > 1 && (
              <a href={href({ page: String(pageNum - 1) })}
                className="px-4 py-2 rounded-xl border border-gray-200 text-[10px] font-black text-gray-400 hover:border-brand-cyan hover:text-brand-cyan transition-all">
                ← Předchozí
              </a>
            )}
            <span className="px-4 py-2 text-[10px] font-black text-gray-500 uppercase tracking-widest">
              {pageNum} / {totalPages}
            </span>
            {pageNum < totalPages && (
              <a href={href({ page: String(pageNum + 1) })}
                className="px-4 py-2 rounded-xl border border-gray-200 text-[10px] font-black text-gray-400 hover:border-brand-cyan hover:text-brand-cyan transition-all">
                Další →
              </a>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
