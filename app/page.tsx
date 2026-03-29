import { auth, signIn, signOut } from "../auth";
import { updateCompensation, addStrategicMetric, toggleMetric } from "@/lib/actions"

export default async function Home() {
  const session = await auth();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gray-50 text-black">
      <div className="bg-white p-8 rounded-xl shadow-lg text-center">
        <h1 className="text-3xl font-bold mb-6">Manažerský portál</h1>
        
        {session ? (
          <div>
            <p className="mb-4">Vítejte, <strong>{session.user?.name}</strong>!</p>
            <p className="text-sm text-gray-500 mb-6">{session.user?.email}</p>
            <form action={async () => { "use server"; await signOut(); }}>
              <button className="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-md transition">
                Odhlásit se
              </button>
            </form>
          </div>
        ) : (
          <div>
            <p className="mb-6 text-gray-600">Pro přístup k úkolům a PSP se přihlaste.</p>
            <form action={async () => { "use server"; await signIn("google"); }}>
              <button className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-md font-medium transition">
                Přihlásit se přes Google
              </button>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}