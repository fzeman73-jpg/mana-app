import { auth, signIn, signOut } from "@/auth"
import { prisma } from "@/lib/db"
import { loginWithCredentials } from "@/lib/actions"
import Image from "next/image"

export default async function Home() {
  const session = await auth()

  // LOGIN SCREEN
  if (!session?.user?.email) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 text-gray-900 p-6 relative overflow-hidden">
        <div className="absolute -left-40 -top-40 w-[600px] h-[600px] bg-brand-cyan rounded-full opacity-5 blur-[150px]" />
        <div className="absolute right-0 bottom-0 w-[400px] h-[400px] bg-brand-pink rounded-full opacity-5 blur-[120px]" />
        <div className="text-center p-12 border border-gray-200 rounded-[3rem] bg-white shadow-2xl max-w-md w-full border-b-4 border-b-brand-cyan relative z-10">
          <div className="flex justify-center mb-10 mt-4">
            <Image src="/algotech-logo.png" alt="Algotech Logo" width={280} height={84} priority className="opacity-90" />
          </div>
          <h1 className="text-3xl font-black mb-2 tracking-tighter italic uppercase text-gray-900">
            Performance <span className="text-brand-cyan">Cockpit</span>
          </h1>
          <p className="text-gray-400 mb-10 font-medium italic tracking-wide text-sm underline decoration-brand-cyan/40 underline-offset-8">
            Sledování výkonnostních pobídek
          </p>
          <form action={loginWithCredentials} className="space-y-3 mb-6">
            <input name="email" type="email" placeholder="Email" required
              className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-4 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all placeholder:text-gray-400 text-gray-900" />
            <input name="password" type="password" placeholder="Heslo" required
              className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-4 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all placeholder:text-gray-400 text-gray-900" />
            <button type="submit" className="w-full bg-brand-navy text-white font-black py-4 px-8 rounded-2xl hover:bg-brand-cyan hover:text-brand-navy transition-all shadow-sm active:scale-95 uppercase tracking-[0.2em] text-xs">
              Přihlásit se
            </button>
          </form>
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">nebo</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
          <form action={async () => { "use server"; await signIn("google") }}>
            <button className="w-full bg-brand-cyan text-brand-navy font-black py-4 px-8 rounded-2xl hover:bg-brand-pink hover:text-white transition-all shadow-sm active:scale-95 uppercase tracking-[0.2em] text-xs">
              Vstoupit přes Google
            </button>
          </form>
        </div>
      </main>
    )
  }

  const dbUser = await prisma.user.findUnique({ where: { email: session.user.email } })
  const isAdmin   = dbUser?.role === "ADMIN"
  const isManager = dbUser?.role === "MANAGER"

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* NAVBAR */}
      <nav className="bg-white/90 backdrop-blur-md border-b border-gray-200 shadow-sm px-8 py-4 flex justify-between items-center sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <Image src="/algotech-logo.png" alt="Algotech" width={160} height={46} className="object-contain" />
          <span className="w-px h-6 bg-gray-200 ml-1" />
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest italic">Cockpit</span>
        </div>
        <div className="flex items-center gap-5">
          {(isAdmin || isManager) && (
            <a href="/admin/parameters" className="text-gray-400 hover:text-brand-cyan text-[10px] font-black uppercase tracking-widest transition-colors">
              Parametry
            </a>
          )}
          {isAdmin && (
            <a href="/admin" className="bg-brand-cyan/10 text-brand-cyan border border-brand-cyan/30 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-cyan hover:text-brand-navy transition-all">
              Správa uživatelů
            </a>
          )}
          <div className="text-right hidden sm:block leading-none">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1.5">Přihlášen</p>
            <p className="text-sm font-black text-gray-900 italic">{session.user?.name}</p>
          </div>
          {session.user?.image && (
            <img src={session.user.image} className="w-10 h-10 rounded-full ring-4 ring-brand-cyan/20 border border-brand-cyan/20" referrerPolicy="no-referrer" alt="Profile" />
          )}
          <form action={async () => { "use server"; await signOut() }}>
            <button className="p-2 text-gray-400 hover:text-brand-pink transition-colors uppercase text-[10px] font-black tracking-widest">Odhlásit</button>
          </form>
        </div>
      </nav>

      {/* PLACEHOLDER – Dashboard bude v dalším kroku */}
      <main className="max-w-4xl mx-auto py-20 px-6 text-center">
        <div className="bg-white rounded-[3rem] border border-gray-100 shadow-sm p-16">
          <p className="text-6xl mb-6">📊</p>
          <h2 className="text-2xl font-black italic uppercase tracking-tight text-gray-900 mb-3">
            Dashboard <span className="text-brand-cyan">připravujeme</span>
          </h2>
          <p className="text-gray-400 font-medium">
            Přejděte do <a href="/admin/parameters" className="text-brand-cyan font-black hover:underline">Parametrů</a> a nastavte první období, výkonnostní parametry a manažery.
          </p>
          {isAdmin && (
            <div className="flex gap-4 justify-center mt-8">
              <a href="/admin/parameters" className="bg-brand-cyan text-brand-navy px-8 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-brand-pink hover:text-white transition-all shadow-sm">
                Parametry →
              </a>
              <a href="/admin" className="bg-gray-100 text-gray-700 px-8 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-gray-200 transition-all">
                Správa uživatelů
              </a>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
