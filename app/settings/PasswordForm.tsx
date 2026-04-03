"use client"

import { useActionState } from "react"
import { changeOwnPassword, type PasswordState } from "@/lib/actions"

export default function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changeOwnPassword, {})

  return (
    <form action={action} className="space-y-4">
      {state.error && (
        <div className="bg-brand-pink/10 border border-brand-pink/30 text-brand-pink text-sm font-bold px-4 py-3 rounded-2xl">
          {state.error}
        </div>
      )}
      {state.success && (
        <div className="bg-brand-green/10 border border-brand-green/30 text-brand-green text-sm font-bold px-4 py-3 rounded-2xl">
          Heslo bylo úspěšně změněno.
        </div>
      )}
      {hasPassword && (
        <div>
          <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Stávající heslo</label>
          <input name="current" type="password" required placeholder="Zadejte stávající heslo"
            className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3.5 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all placeholder:text-gray-400 text-gray-900" />
        </div>
      )}
      <div>
        <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Nové heslo</label>
        <input name="password" type="password" required minLength={6} placeholder="Alespoň 6 znaků"
          className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3.5 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all placeholder:text-gray-400 text-gray-900" />
      </div>
      <div>
        <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Zopakovat nové heslo</label>
        <input name="confirm" type="password" required minLength={6} placeholder="Zopakujte nové heslo"
          className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3.5 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all placeholder:text-gray-400 text-gray-900" />
      </div>
      <button type="submit" disabled={pending}
        className="w-full bg-brand-cyan text-brand-navy py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-brand-pink hover:text-white transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed mt-2">
        {pending ? "Ukládám…" : hasPassword ? "Změnit heslo" : "Nastavit heslo"}
      </button>
    </form>
  )
}
