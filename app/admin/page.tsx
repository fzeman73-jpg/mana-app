import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { inviteUser, removeUser, createDivision, deleteDivision } from "@/lib/actions"
import Image from "next/image"
import { redirect } from "next/navigation"
import { headers } from "next/headers"

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ invited?: string }>
}) {
  const session = await auth()
  const caller = await prisma.user.findUnique({ where: { email: session?.user?.email || "" } })
  if (caller?.role !== "ADMIN") redirect("/")

  const { invited } = await searchParams

  const [allowedUsers, divisions] = await Promise.all([
    prisma.user.findMany({
      where:   { isAllowed: true },
      include: { division: true },
      orderBy: { email: "asc" },
    }),
    prisma.division.findMany({
      include: { _count: { select: { users: true } } },
      orderBy: { name: "asc" },
    }),
  ])

  // Invite link for just-created user
  let inviteLink: string | null = null
  let invitedName: string | null = null
  if (invited) {
    const hdrs  = await headers()
    const host  = hdrs.get("host") ?? "localhost:3000"
    const proto = hdrs.get("x-forwarded-proto") ?? "http"
    const invitedUser = await prisma.user.findUnique({ where: { id: invited }, select: { name: true, inviteToken: true } })
    if (invitedUser?.inviteToken) {
      inviteLink  = `${proto}://${host}/invite/${invitedUser.inviteToken}`
      invitedName = invitedUser.name
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans selection:bg-brand-cyan/20">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
        <div className="px-4 sm:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <a href="/"><Image src="/algotech-logo.png" alt="Algotech" width={130} height={38} className="object-contain" /></a>
            <div className="w-px h-6 bg-gray-200 hidden sm:block" />
            <span className="text-sm font-black text-brand-cyan uppercase tracking-tight hidden sm:block">Uživatelé</span>
          </div>
          <div className="flex items-center gap-4 sm:gap-6">
            <a href="/admin/parameters?tab=manageri" className="text-gray-400 hover:text-brand-cyan text-xs font-black uppercase tracking-widest transition-colors hidden sm:block">Plány</a>
            <a href="/admin/reports" className="text-gray-400 hover:text-brand-cyan text-xs font-black uppercase tracking-widest transition-colors hidden sm:block">Reporty</a>
            <a href="/admin/pop" className="text-gray-400 hover:text-brand-cyan text-xs font-black uppercase tracking-widest transition-colors hidden sm:block">POP</a>
            <a href="/admin" className="bg-brand-cyan/10 text-brand-cyan border border-brand-cyan/30 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all">Uživatelé</a>
            <a href="/admin/audit" className="text-gray-400 hover:text-brand-cyan text-xs font-black uppercase tracking-widest transition-colors hidden sm:block">Audit</a>
            <a href="/" className="text-gray-400 hover:text-brand-cyan text-xs font-black uppercase tracking-widest transition-colors">← Cockpit</a>
          </div>
        </div>
      </nav>
      <div className="max-w-5xl mx-auto p-8 space-y-8">

        {/* POZVÁNKA BANNER */}
        {inviteLink && (
          <div className="bg-brand-green/10 border border-brand-green/30 rounded-[2rem] p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1">
              <p className="text-[10px] font-black text-brand-green uppercase tracking-widest mb-1">
                ✓ Uživatel {invitedName ?? ""} byl přidán
              </p>
              <p className="text-xs text-gray-600 mb-2">Zkopírujte odkaz a pošlete ho uživateli — po kliknutí si nastaví heslo. Platí 7 dní.</p>
              <code className="text-[11px] font-bold text-brand-navy bg-white border border-gray-200 rounded-xl px-4 py-2 block break-all">
                {inviteLink}
              </code>
            </div>
            <a
              href="/admin"
              className="flex-shrink-0 bg-brand-green text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-brand-navy transition-all"
            >
              Zavřít
            </a>
          </div>
        )}

        {/* PŘIDAT UŽIVATELE */}
        <section className="bg-white p-12 rounded-[3.5rem] shadow-sm relative overflow-hidden ring-1 ring-gray-100">
          <div className="relative z-10">
            <h2 className="text-brand-cyan text-[11px] font-black uppercase tracking-[0.4em] mb-2 italic">Přidat nového uživatele</h2>
            <p className="text-xs text-gray-400 mb-6">Po přidání obdrží uživatel odkaz pro nastavení hesla. Může se přihlásit emailem i Google účtem.</p>
            <form action={inviteUser} className="flex flex-col lg:flex-row gap-4">
              <input
                name="name"
                placeholder="Celé jméno"
                className="flex-1 bg-gray-50 border border-gray-200 rounded-2xl px-6 py-4 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all placeholder:text-gray-400 text-gray-900"
                required
              />
              <input
                name="email"
                type="email"
                placeholder="Email"
                className="flex-[1.5] bg-gray-50 border border-gray-200 rounded-2xl px-6 py-4 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all placeholder:text-gray-400 text-gray-900"
                required
              />
              <button type="submit" className="bg-brand-cyan text-brand-navy hover:bg-brand-pink hover:text-white transition-all px-10 py-4 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-sm active:scale-95">
                Přidat
              </button>
            </form>
          </div>
          <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-brand-cyan rounded-full opacity-5 blur-[100px]" />
        </section>

        {/* TABULKA UŽIVATELŮ */}
        <section className="bg-white rounded-[3rem] shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-8 border-b border-gray-100 flex justify-between items-center">
            <h3 className="font-black text-gray-900 uppercase italic tracking-tight">Oprávnění uživatelé</h3>
            <span className="bg-gray-50 text-gray-400 text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest border border-gray-200">
              {allowedUsers.length} Users
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                  <th className="px-8 py-5">Uživatel</th>
                  <th className="px-8 py-5">Úroveň</th>
                  <th className="px-8 py-5">Divize</th>
                  <th className="px-8 py-5 text-right">Akce</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {allowedUsers.map(u => (
                  <tr key={u.id} className="group hover:bg-gray-50 transition-colors">
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center font-black text-brand-cyan text-xs border border-gray-200">
                          {u.name?.charAt(0) || u.email?.charAt(0)}
                        </div>
                        <div>
                          <p className="font-black text-gray-900 text-sm uppercase tracking-tight italic">{u.name || "Pending..."}</p>
                          <p className="text-[11px] font-bold text-gray-400 mt-0.5">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <span className={`text-[9px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest ${
                        u.role === "ADMIN"   ? "bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/30"   :
                        u.role === "MANAGER" ? "bg-brand-pink/10 text-brand-pink ring-1 ring-brand-pink/30"   :
                                               "bg-gray-100 text-gray-400 border border-gray-200"
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-8 py-6">
                      <span className="text-[10px] text-gray-500 font-bold">{u.division?.name ?? "—"}</span>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <div className="flex justify-end items-center gap-3">
                        <a href={`/admin/user/${u.id}`} className="bg-brand-cyan/10 text-brand-cyan border border-brand-cyan/20 hover:bg-brand-cyan hover:text-brand-navy transition-all px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest">
                          Nastavení
                        </a>
                        <a href={`/admin/parameters?userId=${u.id}`} className="bg-brand-pink/10 text-brand-pink border border-brand-pink/20 hover:bg-brand-pink hover:text-white transition-all px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest">
                          Plány
                        </a>
                        <form action={removeUser.bind(null, u.id)}>
                          <button className="bg-gray-100 hover:bg-brand-pink/10 text-gray-400 hover:text-brand-pink p-2.5 rounded-xl transition-all border border-transparent hover:border-brand-pink/20">
                            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {allowedUsers.length === 0 && (
            <div className="p-16 text-center">
              <p className="text-gray-400 font-black italic text-sm uppercase tracking-widest">Žádní uživatelé nejsou autorizováni.</p>
            </div>
          )}
        </section>

        {/* DIVIZE — méně časté nastavení */}
        <section className="bg-white p-8 rounded-[3rem] shadow-sm border border-gray-100">
          <h3 className="font-black text-gray-900 uppercase italic tracking-tight mb-1">Divize</h3>
          <p className="text-xs text-gray-400 mb-6">Organizační celky — přiřazují se uživatelům v nastavení.</p>

          {divisions.length > 0 && (
            <div className="flex flex-wrap gap-3 mb-6">
              {(divisions as { id: string; name: string; description: string | null; _count: { users: number } }[]).map(d => (
                <div key={d.id} className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-gray-200 bg-gray-50">
                  <div>
                    <p className="font-black text-gray-900 text-sm">{d.name}</p>
                    {d.description && <p className="text-[10px] text-gray-400">{d.description}</p>}
                    <p className="text-[9px] text-brand-cyan font-black uppercase tracking-wider mt-0.5">{d._count.users} uživatelů</p>
                  </div>
                  <form action={deleteDivision.bind(null, d.id)} className="ml-2">
                    <button className="text-gray-300 hover:text-brand-pink transition-colors p-1" title="Smazat divizi">
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}

          <form action={createDivision} className="flex flex-wrap gap-3">
            <input name="name" placeholder="Název divize" required
              className="flex-1 min-w-[160px] bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all placeholder:text-gray-400 text-gray-900" />
            <input name="description" placeholder="Popis (volitelný)"
              className="flex-[2] min-w-[200px] bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all placeholder:text-gray-400 text-gray-900" />
            <button type="submit" className="bg-brand-cyan text-brand-navy hover:bg-brand-pink hover:text-white transition-all px-8 py-3 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-sm active:scale-95 whitespace-nowrap">
              + Přidat divizi
            </button>
          </form>
        </section>

      </div>
    </div>
  )
}
