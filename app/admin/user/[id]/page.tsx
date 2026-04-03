import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { setUserRole, setUserActive, deleteUser, setUserPassword } from "@/lib/actions"
import Image from "next/image"
import { redirect, notFound } from "next/navigation"

export default async function UserAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const { id } = await params

  const caller = await prisma.user.findUnique({ where: { email: session?.user?.email || "" } })
  if (caller?.role !== "ADMIN") redirect("/")

  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) notFound()

  return (
    <div className="min-h-screen bg-gray-50 p-8 font-sans selection:bg-brand-cyan/20">
      <div className="max-w-2xl mx-auto space-y-8">

        {/* HLAVIČKA */}
        <header className="flex flex-col md:flex-row justify-between items-center bg-white p-10 rounded-[3rem] shadow-sm border border-gray-100 gap-6">
          <div className="flex items-center gap-6">
            <a href="/"><Image src="/algotech-logo.png" alt="Algotech" width={160} height={46} className="object-contain" /></a>
            <div className="w-px h-10 bg-gray-200 hidden md:block" />
            <div>
              <h1 className="text-xl font-black italic uppercase tracking-tighter text-gray-900">
                Nastavení <span className="text-brand-cyan">uživatele</span>
              </h1>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-0.5">{user.email}</p>
            </div>
          </div>
          <a href="/admin" className="bg-brand-cyan text-brand-navy px-6 py-3 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] hover:bg-brand-pink hover:text-white transition-all shadow-sm">
            ← Správa uživatelů
          </a>
        </header>

        {/* IDENTITA */}
        <section className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex items-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center font-black text-brand-cyan text-xl border border-gray-200 flex-shrink-0">
            {user.name?.charAt(0) || user.email?.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-gray-900 text-lg italic uppercase tracking-tight truncate">{user.name || "—"}</p>
            <p className="text-brand-cyan/70 text-sm font-bold mt-0.5 truncate">{user.email}</p>
          </div>
          <span className={`text-[9px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest flex-shrink-0 ${
            user.role === "ADMIN"   ? "bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/30" :
            user.role === "MANAGER" ? "bg-brand-pink/10 text-brand-pink ring-1 ring-brand-pink/30" :
                                      "bg-gray-100 text-gray-400 border border-gray-200"
          }`}>{user.role}</span>
        </section>

        {/* ÚROVEŇ PŘÍSTUPU */}
        <section className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
          <h2 className="text-[11px] font-black text-brand-cyan uppercase tracking-[0.3em] italic mb-6">Úroveň přístupu</h2>
          <div className="grid grid-cols-3 gap-3">
            {(["USER", "MANAGER", "ADMIN"] as const).map(role => (
              <form key={role} action={setUserRole.bind(null, user.id)}>
                <input type="hidden" name="role" value={role} />
                <button
                  type="submit"
                  className={`w-full py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all border ${
                    user.role === role
                      ? role === "ADMIN"   ? "bg-brand-cyan text-brand-navy border-brand-cyan shadow-sm"
                      : role === "MANAGER" ? "bg-brand-pink text-white border-brand-pink shadow-sm"
                      :                      "bg-gray-900 text-white border-gray-900 shadow-sm"
                      : "bg-gray-50 text-gray-400 border-gray-200 hover:border-gray-400 hover:text-gray-700"
                  }`}
                >
                  {role === "USER" ? "Uživatel" : role === "MANAGER" ? "Manažer" : "Admin"}
                </button>
              </form>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 mt-4 ml-1">
            <span className="font-black text-gray-600">Uživatel</span> — jen zobrazení dat &nbsp;·&nbsp;
            <span className="font-black text-gray-600">Manažer</span> — úprava parametrů + KPI &nbsp;·&nbsp;
            <span className="font-black text-gray-600">Admin</span> — vše
          </p>
        </section>

        {/* HESLO */}
        <section className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
          <h2 className="text-[11px] font-black text-brand-cyan uppercase tracking-[0.3em] italic mb-6">Nastavit heslo</h2>
          <form action={setUserPassword.bind(null, user.id)} className="flex gap-3">
            <input
              name="password"
              type="password"
              placeholder="Nové heslo (min. 6 znaků)"
              className="flex-1 bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3.5 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all placeholder:text-gray-400 text-gray-900"
              required
              minLength={6}
            />
            <button type="submit" className="bg-brand-cyan text-brand-navy px-6 py-3.5 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-brand-pink hover:text-white transition-all shadow-sm active:scale-95">
              Uložit
            </button>
          </form>
          <p className="text-[10px] text-gray-400 mt-3 ml-1">Umožňuje uživateli přihlásit se emailem a heslem místo Google.</p>
        </section>

        {/* AKTIVACE / DEAKTIVACE */}
        <section className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
          <h2 className="text-[11px] font-black text-brand-cyan uppercase tracking-[0.3em] italic mb-6">Stav účtu</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-black text-gray-900 text-sm">
                {user.isAllowed ? "Účet je aktivní" : "Účet je deaktivován"}
              </p>
              <p className="text-[11px] text-gray-400 mt-1">
                {user.isAllowed ? "Uživatel se může přihlásit do aplikace." : "Uživatel nemůže přihlásit do aplikace."}
              </p>
            </div>
            <form action={setUserActive.bind(null, user.id, !user.isAllowed)}>
              <button type="submit" className={`px-6 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all border active:scale-95 ${
                user.isAllowed
                  ? "bg-gray-100 text-gray-500 border-gray-200 hover:bg-brand-pink/10 hover:text-brand-pink hover:border-brand-pink/30"
                  : "bg-brand-green/10 text-brand-green border-brand-green/30 hover:bg-brand-green hover:text-brand-navy"
              }`}>
                {user.isAllowed ? "Deaktivovat" : "Aktivovat"}
              </button>
            </form>
          </div>
        </section>

        {/* SMAZÁNÍ */}
        <section className="bg-white p-8 rounded-[2.5rem] border border-brand-pink/20 shadow-sm">
          <h2 className="text-[11px] font-black text-brand-pink uppercase tracking-[0.3em] italic mb-6">Nebezpečná zóna</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-black text-gray-900 text-sm">Smazat uživatele</p>
              <p className="text-[11px] text-gray-400 mt-1">Trvale odstraní uživatele včetně všech dat. Akce je nevratná.</p>
            </div>
            <form action={deleteUser.bind(null, user.id)}>
              <button type="submit" className="bg-brand-pink/10 text-brand-pink border border-brand-pink/30 px-6 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-brand-pink hover:text-white transition-all active:scale-95">
                Smazat
              </button>
            </form>
          </div>
        </section>

      </div>
    </div>
  )
}
