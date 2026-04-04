import { prisma } from "@/lib/db"
import { setPasswordFromInvite } from "@/lib/actions"
import Image from "next/image"

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const user = await (prisma as unknown as {
    user: { findFirst: (a: object) => Promise<{ name: string | null; email: string | null; inviteTokenExpiry: Date | null } | null> }
  }).user.findFirst({
    where: { inviteToken: token },
    select: { name: true, email: true, inviteTokenExpiry: true },
  })

  const expired = !user || (user.inviteTokenExpiry && user.inviteTokenExpiry < new Date())

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md space-y-6">

        <div className="flex justify-center">
          <Image src="/algotech-logo.png" alt="Algotech" width={160} height={46} className="object-contain" />
        </div>

        {expired ? (
          <div className="bg-white rounded-[2.5rem] p-10 shadow-sm border border-gray-100 text-center space-y-4">
            <p className="text-3xl">⏰</p>
            <h1 className="text-lg font-black italic uppercase tracking-tight text-gray-900">Pozvánka vypršela</h1>
            <p className="text-sm text-gray-500">Tento odkaz již není platný. Požádejte administrátora o novou pozvánku.</p>
            <a href="/" className="inline-block mt-4 bg-brand-cyan text-brand-navy px-6 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-brand-pink hover:text-white transition-all">
              Přejít na přihlášení
            </a>
          </div>
        ) : (
          <div className="bg-white rounded-[2.5rem] p-10 shadow-sm border border-gray-100 space-y-6">
            <div>
              <p className="text-[10px] font-black text-brand-cyan uppercase tracking-[0.4em] mb-1">Vítejte</p>
              <h1 className="text-2xl font-black italic uppercase tracking-tight text-gray-900">
                {user!.name ?? "Nastavení účtu"}
              </h1>
              <p className="text-sm text-gray-400 mt-1">{user!.email}</p>
            </div>

            <p className="text-sm text-gray-600">
              Nastavte si heslo pro přihlášení do Performance Cockpit. Po uložení se budete moci přihlásit emailem nebo Google účtem.
            </p>

            <form action={setPasswordFromInvite.bind(null, token)} className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">
                  Nové heslo
                </label>
                <input
                  name="password"
                  type="password"
                  minLength={8}
                  placeholder="Minimálně 8 znaků"
                  required
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3.5 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all placeholder:text-gray-400 text-gray-900"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-brand-cyan text-brand-navy hover:bg-brand-pink hover:text-white transition-all py-4 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-sm active:scale-95"
              >
                Nastavit heslo a přihlásit se
              </button>
            </form>

            <p className="text-[10px] text-gray-400 text-center">
              Platnost odkazu: {user!.inviteTokenExpiry ? new Date(user!.inviteTokenExpiry).toLocaleDateString("cs-CZ") : "—"}
            </p>
          </div>
        )}

      </div>
    </div>
  )
}
