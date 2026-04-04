import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import Image from "next/image"
import { redirect } from "next/navigation"

export default async function HelpPage() {
  const session = await auth()
  if (!session?.user?.email) redirect("/")
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user || !user.isAllowed) redirect("/")

  const isAdmin   = user.role === "ADMIN"
  const isManager = user.role === "MANAGER"

  return (
    <div className="min-h-screen bg-gray-50 font-sans selection:bg-brand-cyan/20">

      {/* HLAVIČKA */}
      <header className="bg-white border-b border-gray-100 px-6 sm:px-10 py-4 flex justify-between items-center sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-4">
          <a href="/"><Image src="/algotech-logo.png" alt="Algotech" width={130} height={38} className="object-contain" /></a>
          <div className="w-px h-7 bg-gray-200" />
          <div>
            <h1 className="text-sm font-black italic uppercase tracking-tight text-gray-900">
              Nápověda <span className="text-brand-cyan">/ Dokumentace</span>
            </h1>
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Performance Cockpit</p>
          </div>
        </div>
        <a href="/" className="bg-brand-cyan text-brand-navy px-4 py-2 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-brand-pink hover:text-white transition-all shadow-sm">
          ← Cockpit
        </a>
      </header>

      <main className="max-w-3xl mx-auto py-10 px-6 space-y-6">

        {/* ÚVOD */}
        <section className="bg-brand-navy text-white p-8 rounded-[2.5rem] shadow-xl relative overflow-hidden">
          <div className="absolute -right-16 -top-16 w-64 h-64 bg-brand-pink rounded-full opacity-10 blur-[80px]" />
          <div className="relative z-10">
            <p className="text-[10px] font-black text-brand-pink uppercase tracking-[0.4em] mb-2">Dokumentace</p>
            <h2 className="text-2xl font-black italic uppercase tracking-tight mb-3">Performance Cockpit</h2>
            <p className="text-white/70 text-sm leading-relaxed">
              Systém pro sledování výkonnostních pobídek — bonusů, phantom opcí (POP) a vestingu.
              Každý manažer vidí svůj výpočet v reálném čase na základě dat zadaných administrátorem.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {[
                { label: "Admin", desc: "Plný přístup" },
                { label: "Manažer", desc: "Parametry + Cockpit" },
                { label: "Viewer", desc: "Pouze čtení" },
              ].map(r => (
                <span key={r.label} className="text-[10px] font-black px-3 py-1.5 rounded-full bg-white/10 border border-white/20">
                  {r.label} <span className="opacity-60">— {r.desc}</span>
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* COCKPIT */}
        <Section title="Cockpit (dashboard)" color="cyan" icon="📊">
          <p>Hlavní obrazovka po přihlášení. Zobrazuje aktuální stav vašich odměn pro vybrané období, rok a kvartál.</p>

          <SubSection title="Phantom Capital Gain (POP)">
            <p>Velké číslo nahoře — vaše <strong>průběžná projekce</strong> hodnoty phantom opcí k aktuálnímu datu. Jde o živý odhad pro motivaci, ne finální hodnota. Finální hodnota se uzamkne při uzavření kvartálu adminem.</p>
            <ul>
              <li><strong>Hodnota firmy dnes</strong> = Aktuální EBITDA × (Základní koeficient + Boostery)</li>
              <li><strong>Hodnota při grantu</strong> = EBITDA při vstupu do plánu × Koeficient při vstupu</li>
              <li><strong>Vytvořená hodnota</strong> = rozdíl těchto dvou čísel</li>
              <li><strong>Váš zisk (brutto)</strong> = Vytvořená hodnota × Váš podíl %</li>
            </ul>
          </SubSection>

          <SubSection title="Strategické boostery">
            <p>Splněné strategické cíle navyšují valuační koeficient. Každý splněný booster zvyšuje hodnotu firmy použitou pro výpočet POP.</p>
          </SubSection>

          <SubSection title="Bonus">
            <p>Výkonnostní bonus počítaný z firemních a divize parametrů pro vybraný kvartál. Zobrazuje breakdown po jednotlivých složkách — jakou část bonusu přináší každý parametr.</p>
            <ul>
              <li>Pokud parametr nedosáhne <strong>bariéry</strong> (min. % plnění), jeho složka je nulová</li>
              <li><strong>Gating</strong>: pokud jeden parametr nedosáhne bariéry, může nulovat i jiný</li>
              <li><strong>KPI složka</strong>: pokud je nastavena KPI váha, část bonusu závisí na splnění KPI úkolů</li>
            </ul>
          </SubSection>

          <SubSection title="Individuální KPI úkoly">
            <p>Soft cíle přiřazené přímo vám. Tři typy:</p>
            <ul>
              <li><strong>Splněno/Ne</strong> — jednoduché označení jako splněné</li>
              <li><strong>% plnění</strong> — zadáte číslo 0–100 % (např. projekt dokončen z 75 %)</li>
              <li><strong>Částka</strong> — plán vs. skutečnost (např. obrat divize)</li>
            </ul>
            <p>Celkové % splnění KPI je vážený průměr všech úkolů — částečné splnění se počítá poměrně.</p>
          </SubSection>

          <SubSection title="Vesting">
            <p>Plán vyplácení POP v čase. Hodnota opce se počítá od data grantu do vestingu — průběžný stav je jen pro informaci. Vesting splátky zpracovává admin v sekci Reporty.</p>
          </SubSection>

          <SubSection title="Výběr období / roku / kvartálu">
            <p>V horní liště lze přepínat mezi obdobími (např. "Rok 2025"), roky a kvartály (Q1–Q4). Výpočty se okamžitě aktualizují.</p>
          </SubSection>
        </Section>

        {/* PARAMETRY — jen pro Admin/Manager */}
        {(isAdmin || isManager) && (
          <Section title="Parametry" color="pink" icon="⚙️">
            <p>Stránka pro nastavení všech vstupních dat. Přístup mají Admin a Manažer.</p>

            <SubSection title="Tab: Firma">
              <p><strong>Firemní parametry</strong> (platí všem manažerům) — typicky EBITDA skupiny. Ke každému parametru se zadávají kvartální výsledky: skutečnost a cíl.</p>
              <p><strong>Divize parametry</strong> — platí jen manažerům v dané divizi. Typicky HORIZONT divize. Každá divize má vlastní sekci a vlastní výsledky.</p>
              <p><strong>POP – Valuační základ</strong> — aktuální EBITDA a základní koeficient pro výpočet hodnoty firmy.</p>
              <p><strong>Strategické boostery</strong> — cíle navyšující koeficient. Kliknutím "Splněno" se booster aktivuje a okamžitě se promítne do POP projekce všech manažerů.</p>
              {isAdmin && <p><strong>Uzavření kvartálu</strong> — uzamkne výsledky a vytvoří historický snapshot bonusu a POP hodnoty pro každého manažera.</p>}
            </SubSection>

            <SubSection title="Tab: Manažeři">
              <p>Nastavení individuálních podmínek pro každého manažera:</p>
              <ul>
                <li><strong>Smluvní podmínky</strong> — základní plat, cílový roční bonus, KPI váha, POP podíl %, grant datum, vesting</li>
                <li><strong>KPI úkoly</strong> — přidávání a hodnocení individuálních úkolů s váhou</li>
              </ul>
              {isAdmin && <p>Tlačítko <em>Odemknout</em> vedle uzavřeného kvartálu umožňuje opravit chybně zadané hodnoty.</p>}
            </SubSection>
          </Section>
        )}

        {/* REPORTY — jen pro Admin */}
        {isAdmin && (
          <Section title="Reporty" color="cyan" icon="📋">
            <p>Přehled dat pro vybrané období. Přístupné pouze adminovi.</p>
            <ul>
              <li><strong>KPI souhrn</strong> — počty a průměrné plnění KPI úkolů</li>
              <li><strong>Bonusy</strong> — přehled vypočtených bonusů všech manažerů</li>
              <li><strong>POP závazek</strong> — celková hodnota phantom opcí (projekce)</li>
              <li><strong>Vesting splátky</strong> — evidence vyplacených a nevyplacených splátek per manažer, možnost zadat vyplacenou částku</li>
              <li><strong>Historie</strong> — uzavřené kvartály a jejich snapshoty</li>
              <li><strong>Export do Excelu</strong> — stáhne .xlsx soubor se čtyřmi listy (Bonusy, POP závazek, Vesting, Historie)</li>
            </ul>
          </Section>
        )}

        {/* ADMIN */}
        {isAdmin && (
          <Section title="Správa uživatelů" color="pink" icon="👥">
            <ul>
              <li><strong>Pozvat uživatele</strong> — zadáte email a jméno, uživatel pak může nastavit heslo nebo se přihlásit přes Google</li>
              <li><strong>Role</strong> — Admin (plný přístup) / Manažer (parametry + cockpit) / Viewer (jen čtení)</li>
              <li><strong>Divize</strong> — přiřazení manažera do divize určuje, které divize parametry se mu počítají</li>
              <li><strong>Aktivace/deaktivace</strong> — deaktivovaný uživatel se nemůže přihlásit</li>
            </ul>
          </Section>
        )}

        {/* NASTAVENÍ */}
        <Section title="Nastavení účtu" color="cyan" icon="🔐">
          <p>Dostupné přes odkaz <em>Nastavení</em> v horní liště.</p>
          <ul>
            <li><strong>Změna hesla</strong> — nastavte nebo změňte heslo pro přihlášení emailem. Alternativa ke Google přihlášení.</li>
            <li><strong>Přihlašovací metody</strong> — zobrazuje zda je aktivní Google OAuth a/nebo email+heslo</li>
          </ul>
        </Section>

        {/* KLÍČOVÉ POJMY */}
        <Section title="Klíčové pojmy" color="pink" icon="📖">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              ["POP", "Phantom Option Plan — manažer dostane % z vytvořené hodnoty firmy, ale ne reálnou akcii"],
              ["Grant", "Datum vstupu manažera do POP plánu — od tohoto data se počítá vesting"],
              ["Vesting", "Postupné vyplácení hodnoty POP v ročních splátkách (typicky 4× po 25 %)"],
              ["EBITDA", "Zisk před úroky, daněmi a odpisy — základ pro ocenění firmy"],
              ["Koeficient", "Násobitel EBITDA pro ocenění firmy (např. 6× = firma = 6 × EBITDA)"],
              ["Booster", "Strategický cíl, který při splnění zvyšuje koeficient (a tím i POP)"],
              ["Bariéra", "Minimální % plnění parametru — pod touto hranicí je bonusová složka nulová"],
              ["Gating", "Podmínka: pokud jeden parametr nedosáhne bariéry, nuluje se i jiný parametr"],
              ["Snapshot", "Historický záznam bonusu a POP hodnoty v okamžiku uzavření kvartálu"],
              ["KPI váha", "Kolik % z cílového bonusu závisí na splnění KPI úkolů (0 = KPI se nepočítá)"],
            ].map(([term, def]) => (
              <div key={term} className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
                <p className="text-[10px] font-black text-brand-cyan uppercase tracking-widest mb-1">{term}</p>
                <p className="text-[12px] text-gray-600 leading-relaxed">{def}</p>
              </div>
            ))}
          </div>
        </Section>

        <p className="text-center text-[10px] text-gray-300 font-bold uppercase tracking-widest pb-4">
          Performance Cockpit · Algotech · {new Date().getFullYear()}
        </p>

      </main>
    </div>
  )
}

function Section({ title, color, icon, children }: { title: string; color: "cyan" | "pink"; children: React.ReactNode; icon: string }) {
  return (
    <section className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
      <div className={`px-8 py-5 border-b border-gray-100 flex items-center gap-3 ${color === "cyan" ? "bg-brand-cyan/5" : "bg-brand-pink/5"}`}>
        <span className="text-xl">{icon}</span>
        <h2 className={`text-[11px] font-black uppercase tracking-[0.3em] italic ${color === "cyan" ? "text-brand-cyan" : "text-brand-pink"}`}>{title}</h2>
      </div>
      <div className="px-8 py-6 space-y-4 text-sm text-gray-600 leading-relaxed [&_ul]:space-y-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_strong]:text-gray-900 [&_strong]:font-black">
        {children}
      </div>
    </section>
  )
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-l-2 border-brand-cyan/30 pl-4">
      <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}
