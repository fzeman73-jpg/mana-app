# Algotech Performance Management (mana-app)

Webová aplikace pro správu výkonnostních odměn, KPI úkolů a phantom option plánů (POP) pro manažery společnosti Algotech.

---

## Obsah

1. [Přehled aplikace](#1-přehled-aplikace)
2. [Technický stack](#2-technický-stack)
3. [Instalace a spuštění](#3-instalace-a-spuštění)
4. [Přihlášení a role](#4-přihlášení-a-role)
5. [Datový model](#5-datový-model)
6. [Výpočetní logika](#6-výpočetní-logika)
7. [Navigace a obrazovky](#7-navigace-a-obrazovky)
8. [Správa uživatelů (Admin)](#8-správa-uživatelů-admin)
9. [Nastavení plánů (Admin / Manager)](#9-nastavení-plánů-admin--manager)
10. [Uzavírání kvartálů](#10-uzavírání-kvartálů)
11. [POP – Phantom Option Plan](#11-pop--phantom-option-plan)
12. [Audit log](#12-audit-log)
13. [Nastavení vah – krok za krokem](#13-nastavení-vah--krok-za-krokem)
14. [Časté chyby a řešení](#14-časté-chyby-a-řešení)

---

## 1. Přehled aplikace

Aplikace umožňuje:

- Definovat **výkonnostní parametry** (EBITDA, HORIZONT a vlastní) pro každé období
- Zadávat **kvartální výsledky** (skutečnost vs. cíl) a automaticky vypočítat bonus
- Přiřazovat **individuální KPI úkoly** manažerům po kvartálech
- Spravovat **POP plány** (phantom options) s boostery a vestingem
- **Uzavírat kvartály** – zmrazit výsledky a uložit historický snapshot
- Zobrazit každému manažerovi jeho **Performance Cockpit** s přehledem bonusů, KPI a POP

---

## 2. Technický stack

| Vrstva       | Technologie                                |
|--------------|--------------------------------------------|
| Framework    | Next.js 16 (App Router, Server Actions)    |
| Databáze     | PostgreSQL (Supabase / Vercel Postgres)    |
| ORM          | Prisma 6                                   |
| Auth         | NextAuth v5 (Google OAuth + email/heslo)   |
| Styling      | Tailwind CSS                               |
| Deployment   | Vercel                                     |

---

## 3. Instalace a spuštění

```bash
# 1. Klonování repozitáře
git clone <repo-url>
cd mana-app

# 2. Instalace závislostí
npm install

# 3. Konfigurace prostředí – vytvořte .env.local:
DATABASE_URL="postgresql://..."
NEXTAUTH_SECRET="..."
NEXTAUTH_URL="http://localhost:3000"
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."

# 4. Migrace databáze
npx prisma migrate dev

# 5. Spuštění vývojového serveru
npm run dev
```

**Produkční nasazení:** Vercel automaticky spustí `prisma generate` a `next build`.

---

## 4. Přihlášení a role

### Způsoby přihlášení

| Způsob         | Popis                                                                  |
|----------------|------------------------------------------------------------------------|
| Google OAuth   | Přihlášení Google účtem; účet musí mít `isAllowed = true`             |
| Email + heslo  | Admin nastaví heslo uživateli ručně v detailu uživatele               |
| Pozvánka       | Admin vygeneruje pozvánkový odkaz (platný 7 dní), uživatel si nastaví heslo |

### Role a oprávnění

| Akce                                                    | USER | MANAGER | ADMIN |
|---------------------------------------------------------|------|---------|-------|
| Zobrazit Performance Cockpit (vlastní data)             | ✓    | ✓       | ✓     |
| Označit KPI úkol jako splněný (vlastní)                 | –    | ✓       | ✓     |
| Vytvořit / upravit KPI úkol                             | –    | ✓       | ✓     |
| Vytvořit / upravit výkonnostní parametry                | –    | ✓       | ✓     |
| Zadávat kvartální výsledky                              | –    | ✓       | ✓     |
| Nastavovat váhy parametrů per-manažer                   | –    | –       | ✓     |
| Uzavřít / otevřít kvartál (zamknout výsledky)           | –    | –       | ✓     |
| Správa uživatelů (pozvat, role, heslo, divize)          | –    | –       | ✓     |
| Správa POP plánů                                        | –    | –       | ✓     |
| Zobrazit Reporty                                        | –    | –       | ✓     |
| Zobrazit Audit log                                      | –    | –       | ✓     |
| Nastavení Compensations                                 | –    | –       | ✓     |

> **Pozor:** MANAGER nemůže nastavovat váhy parametrů ani uzavírat kvartály. Vidí pouze záložku Manažeři (ne Firma) v Nastavení plánů.

---

## 5. Datový model

### Diagram entit

```
Period (1) ─────────────────────────────────────────────────────────── (n) PerformanceParameter
   │                                                                             │
   │                                                                             ├── (n) QuarterlyResult (actual, target, isLocked)
   │                                                                             └── (n) ParameterWeight (per-user override)
   │
   ├── (n) Compensation (targetBonusAnnual, kpiWeight per user)
   ├── (n) KpiTask (per user, per quarter)
   └── (n) QuarterlySnapshot (uzavřený kvartál – bonusAmount, breakdown)

User (1) ──── (n) Compensation
           ├── (n) KpiTask
           ├── (n) QuarterlySnapshot
           ├── (n) ParameterWeight
           └── (n) PopAssignment → PopPlan → PopPlanBooster / PopYearData / PopPayment

Division (1) ── (n) User
             └── (n) PerformanceParameter (divize-specifický parametr)
```

### Popis tabulek

#### `User`
Uživatel systému.

| Sloupec            | Typ       | Popis                                              |
|--------------------|-----------|----------------------------------------------------|
| `id`               | String    | Primární klíč (cuid)                               |
| `email`            | String    | Unikátní emailová adresa                           |
| `name`             | String?   | Celé jméno                                         |
| `role`             | Role      | `USER` / `MANAGER` / `ADMIN`                       |
| `isAllowed`        | Boolean   | Musí být `true` pro přihlášení                     |
| `password`         | String?   | Bcrypt hash pro přihlášení emailem/heslem          |
| `inviteToken`      | String?   | Token pozvánky (platný 7 dní)                      |
| `divisionId`       | String?   | FK na Division – přiřazení k divizi                |
| `position`         | String?   | C-level / TMAG / SMAG / Specialista / Ostatní     |

#### `Division`
Organizační jednotka (divize).

| Sloupec       | Typ     | Popis                             |
|---------------|---------|-----------------------------------|
| `id`          | String  | Primární klíč                     |
| `name`        | String  | Název divize (např. „BC", „TR")   |
| `description` | String? | Volitelný popis                   |

Divize slouží k:
- Přiřazení uživatele → vidí divize-specifické parametry navíc k firemním
- Vytváření parametrů platných pouze pro danou divizi

#### `Period`
Časové období (typicky rok nebo pololetí).

| Sloupec     | Typ      | Popis                                           |
|-------------|----------|-------------------------------------------------|
| `id`        | String   | Primární klíč                                   |
| `name`      | String   | Název, např. „2026"                             |
| `startDate` | DateTime | Začátek období                                  |
| `endDate`   | DateTime | Konec období                                    |
| `isActive`  | Boolean  | Aktivní období – zobrazuje se jako výchozí      |

#### `PerformanceParameter`
Výkonnostní parametr definovaný pro dané období.

| Sloupec       | Typ     | Popis                                                          |
|---------------|---------|----------------------------------------------------------------|
| `periodId`    | String  | FK na Period                                                   |
| `divisionId`  | String? | `null` = firemní (platí všem); set = pouze pro tuto divizi    |
| `name`        | String  | Název (např. „EBITDA skupiny", „HORIZONT – BC")               |
| `description` | String? | Metodika výpočtu                                               |
| `weight`      | Float   | Globální váha v % z cílového bonusu                           |
| `threshold`   | Float   | Minimální % plnění (bariéra) – pod tím = složka 0            |
| `gatesParamId`| String? | ID parametru, který se nuluje, pokud tento nesplní threshold  |
| `sortOrder`   | Int     | Pořadí zobrazení                                               |

> **Gating:** Pokud má parametr A nastaveno `gatesParamId` = parametr B, a parametr A nesplní threshold, pak parametr B dostane bonusAmount = 0 (nehledě na vlastní výsledek).

#### `QuarterlyResult`
Kvartální výsledek (skutečnost vs. cíl) pro jeden parametr.

| Sloupec         | Typ      | Popis                                        |
|-----------------|----------|----------------------------------------------|
| `parameterId`   | String   | FK na PerformanceParameter                   |
| `quarter`       | Int      | Číslo kvartálu (1–4)                         |
| `year`          | Int      | Rok (např. 2026)                             |
| `actual`        | Float    | Skutečná hodnota                             |
| `target`        | Float    | Cílová hodnota pro daný kvartál              |
| `note`          | String?  | Komentář                                     |
| `isLocked`      | Boolean  | Uzamčeno (nelze editovat)                    |
| `lockedByEmail` | String?  | Kdo uzamknul                                 |

#### `Compensation`
Smluvní odměna uživatele pro dané období.

| Sloupec              | Typ    | Popis                                            |
|----------------------|--------|--------------------------------------------------|
| `userId`             | String | FK na User                                       |
| `periodId`           | String | FK na Period                                     |
| `baseSalary`         | Float  | Měsíční fixní plat (CZK)                         |
| `targetBonusAnnual`  | Float  | Roční cílový bonus (CZK)                         |
| `kpiWeight`          | Float  | % z bonusu tvořené KPI složkou (0 = KPI nehraje) |

#### `ParameterWeight`
Per-manažer přepsání globální váhy parametru.

| Sloupec       | Typ    | Popis                                          |
|---------------|--------|------------------------------------------------|
| `userId`      | String | FK na User                                     |
| `parameterId` | String | FK na PerformanceParameter                     |
| `weight`      | Float  | Přepsaná váha v % (nahrazuje `parameter.weight`)|

Pokud pro daného uživatele a parametr záznam neexistuje, použije se globální `PerformanceParameter.weight`.

#### `KpiTask`
Individuální KPI úkol přiřazený uživateli na konkrétní kvartál.

| Sloupec           | Typ     | Popis                                                    |
|-------------------|---------|----------------------------------------------------------|
| `userId`          | String  | FK na User                                               |
| `periodId`        | String  | FK na Period                                             |
| `quarter`         | Int     | Pro který kvartál (1–4)                                  |
| `name`            | String  | Název úkolu                                              |
| `description`     | String? | Krátký popis / podmínky plnění                          |
| `assignmentDetail`| String? | Detailní zadání (metodika, kontext, příklady)            |
| `weight`          | Float   | Váha v % (součet všech KPI v rámci kvartálu = 100)      |
| `taskType`        | String  | `BOOLEAN` / `PERCENT` / `AMOUNT`                         |
| `isCompleted`     | Boolean | Splněno (pro BOOLEAN)                                    |
| `completionPct`   | Float?  | % plnění (pro PERCENT, 0–100)                            |
| `targetAmount`    | Float?  | Cílová částka (pro AMOUNT)                               |
| `actualAmount`    | Float?  | Skutečná částka (pro AMOUNT)                             |
| `evaluationNote`  | String? | Komentář při vyhodnocení                                 |

**Typy KPI úkolů:**
- `BOOLEAN` – splněno / nesplněno (0 nebo 100 %)
- `PERCENT` – zadáš % dosažení (0–100)
- `AMOUNT` – zadáš skutečnost a plán v CZK, % se vypočítá

#### `QuarterlySnapshot`
Historický záznam bonusu při uzavření kvartálu. Jednou uložený snapshot se zobrazuje místo živého výpočtu.

| Sloupec       | Typ    | Popis                                               |
|---------------|--------|-----------------------------------------------------|
| `userId`      | String | FK na User                                          |
| `periodId`    | String | FK na Period                                        |
| `quarter`     | Int    | Číslo kvartálu                                      |
| `year`        | Int    | Rok                                                 |
| `bonusAmount` | Float  | Vypočtený bonus za kvartál (CZK)                    |
| `popValue`    | Float  | Celková hodnota POP v momentě uzavření              |
| `breakdown`   | Json?  | Detailní rozpad bonusu (per parametr)               |

#### `PopPlan`
Phantom Option Plan – šablona pro skupinu účastníků.

| Sloupec              | Typ    | Popis                                                    |
|----------------------|--------|----------------------------------------------------------|
| `name`               | String | Název plánu                                              |
| `baseMultiplier`     | Float  | Základní multiplikátor hodnoty firmy                     |
| `grantEbitda`        | Float  | Vstupní EBITDA při zahájení plánu                       |
| `vestingGranularity` | String | `YEARLY` nebo `QUARTERLY`                                |
| `vestingYears`       | Int    | Počet ročních splátek (pro YEARLY)                       |
| `vestingQuarters`    | Int    | Počet kvartálních splátek (pro QUARTERLY)                |
| `vestingPaymentDay`  | Int    | Den výplaty (pro YEARLY, např. 1)                        |
| `vestingPaymentMonth`| Int    | Měsíc výplaty (pro YEARLY, např. 5 = 1. května)          |
| `minGrowthPercent`   | Float  | Minimální % růstu hodnoty firmy (hurdle rate, 0 = vždy) |

#### `PopPlanBooster`
Bonus k multiplikátoru při splnění podmínky.

| Sloupec           | Typ      | Popis                                           |
|-------------------|----------|-------------------------------------------------|
| `name`            | String   | Název boosteru                                  |
| `description`     | String?  | Podmínky / popis                                |
| `multiplierBoost` | Float    | O kolik se zvýší multiplikátor                  |
| `isAchieved`      | Boolean  | Splněno                                         |
| `achievedAt`      | DateTime?| Datum splnění                                   |
| `achievedNote`    | String?  | Komentář k splnění                              |

#### `PopAssignment`
Přiřazení konkrétního uživatele k POP plánu.

| Sloupec        | Typ      | Popis                                               |
|----------------|----------|-----------------------------------------------------|
| `userId`       | String   | FK na User                                          |
| `popPlanId`    | String   | FK na PopPlan                                       |
| `sharePercent` | Float    | Podíl uživatele na vytvořené hodnotě (%)            |
| `grantDate`    | DateTime | Datum přiřazení (vstup do plánu)                    |
| `grantEbitda`  | Float    | Přepsání grantEBITDA pro tohoto uživatele (0 = z plánu)|

#### `AuditLog`
Záznam každé změny provedené v systému.

| Sloupec     | Typ    | Popis                                              |
|-------------|--------|----------------------------------------------------|
| `userEmail` | String | Kdo provedl změnu                                  |
| `action`    | String | Typ akce (např. `LOCK_QUARTER`, `SET_COMPENSATION`)|
| `target`    | String?| Objekt změny (např. `Compensation:clxxx`)         |
| `oldValue`  | String?| JSON hodnoty před změnou                           |
| `newValue`  | String?| JSON hodnoty po změně                              |

---

## 6. Výpočetní logika

Veškerá kalkulační logika je v `lib/calculator.ts` – oddělena od UI a databáze.

### Kvartální bonus

```
bonusQ = (targetBonusAnnual / 4) × Σ (váha_i / 100 × plnění_i)
```

kde:
- `targetBonusAnnual / 4` = čtvrtinová cílová odměna
- `váha_i` = per-manažer váha parametru (z `ParameterWeight`, pokud existuje, jinak globální `weight`)
- `plnění_i` = min(1.5, actual / target) – plnění je zastropováno na 150 %

**Součet vah musí dát dohromady 100 %** (výkonnostní parametry + KPI složka).

### Bariéra (threshold)

Každý parametr má nastaveno minimální % plnění (`threshold`). Pokud **jakýkoliv** parametr nedosáhne svého threshold:

> **Všechny výkonnostní parametry dostávají bonusAmount = 0 Kč.**

KPI složka bariérou **není** ovlivněna.

### Gating

Parametr A může mít nastaveno `gatesParamId` = parametr B. Pokud A nesplní threshold, parametr B dostane 0 – i kdyby vlastní threshold splnil.

Příklad: EBITDA skupiny nesplní → HORIZONT divize se nuluje.

### KPI složka

```
kpiBonus = (targetBonusAnnual / 4) × (kpiWeight / 100) × vážený_průměr_plnění
```

kde vážený průměr plnění KPI = Σ (váha_úkolu × plnění_úkolu) / Σ váha_úkolu

Plnění dle typu úkolu:
- `BOOLEAN`: 0 nebo 1
- `PERCENT`: completionPct / 100
- `AMOUNT`: min(1, actualAmount / targetAmount)

### Celkový bonus kvartálu

```
celkem = Σ bonusAmount výkonnostních parametrů + kpiBonus
```

### Roční přehled

Dashboard sčítá 4 kvartály:
- Pokud je kvartál **uzavřen** (snapshot existuje): použije `snapshot.bonusAmount`
- Jinak: vypočítá live z aktuálních dat

### POP výpočet

```
currentFirmValue = currentEbitda × (baseMultiplier + Σ aktivní boostery)
grantFirmValue   = grantEbitda × baseMultiplier
createdValue     = max(0, currentFirmValue - grantFirmValue)
grossGain        = createdValue × (sharePercent / 100)
```

Pokud je nastavena hurdle rate (`minGrowthPercent > 0`) a skutečný % růst hodnoty firmy ji nesplní, `grossGain = 0`.

---

## 7. Navigace a obrazovky

```
/ (Cockpit)                   – dashboard uživatele
  ├── /settings               – nastavení účtu
  │
  ├── /admin                  – správa uživatelů (ADMIN)
  ├── /admin/user/[id]        – detail uživatele (ADMIN)
  ├── /admin/parameters       – nastavení plánů (ADMIN + MANAGER)
  │     ├── ?tab=firma        – firemní parametry (jen ADMIN)
  │     └── ?tab=manageri     – per-manažer: kompenzace, váhy, KPI, POP
  ├── /admin/reports          – reporty a přehled odměn (ADMIN)
  ├── /admin/pop              – správa POP plánů (ADMIN)
  ├── /admin/pop/[id]         – detail POP plánu (ADMIN)
  └── /admin/audit            – audit log (ADMIN)
```

---

## 8. Správa uživatelů (Admin)

### Přidání uživatele

1. Jdi na `/admin` → sekce „Pozvat uživatele"
2. Zadej jméno a email → klikni **Pozvat**
3. Systém vygeneruje pozvánkový odkaz (platný 7 dní) – zkopíruj a pošli uživateli
4. Uživatel přes odkaz nastaví si heslo nebo přihlásí Google účtem

Alternativně: Admin může rovnou nastavit heslo v detailu uživatele (`/admin/user/[id]`).

### Detail uživatele (`/admin/user/[id]`)

| Sekce               | Co nastavíš                                           |
|---------------------|-------------------------------------------------------|
| Úroveň přístupu     | Role: USER / MANAGER / ADMIN                          |
| Pozice              | C-level / TMAG / SMAG / Specialista / Ostatní        |
| Divize              | Přiřazení k divizi                                    |
| Nastavit heslo      | Přepíše heslo (min. 6 znaků)                          |
| Stav účtu           | Aktivovat / Deaktivovat (zabrání přihlášení)          |
| Nebezpečná zóna     | Smazat uživatele (nevratné!)                          |

### Divize

Divize slouží k oddělení parametrů a přiřazení uživatelů. Správa divizí je na stránce `/admin` v sekci „Divize".

---

## 9. Nastavení plánů (Admin / Manager)

Stránka `/admin/parameters` – dvě záložky:

### Záložka Firma (jen ADMIN)

Zde se definují **výkonnostní parametry** platné pro celou firmu nebo konkrétní divizi.

**Kroky pro nový parametr:**
1. Vyber aktivní období
2. Klikni **+ Přidat parametr**
3. Vyplň: Název, Popis, Váha (%), Bariéra (%), Pořadí
4. Váha = podíl z cílového bonusu. **Součet všech vah parametrů + KPI = 100 %**
5. U divize-specifického parametru vyber divizi

**Editace parametru:**
- Na kartě parametru edituj přímo **Min. plnění** (bariéru) a ulož
- Globální váha se nastavuje v záložce Manažeři per-user

**Kvartální výsledky:**
- Na každé kartě parametru jsou 4 čtvercová pole Q1–Q4
- Zadej Skutečnost a Cíl → klikni **Uložit**
- CZK hodnota se zobrazuje jako náhled pod polem
- 🔒 uzamkne daný kvartál (nelze dál editovat)
- 🔓 Odemknout kvartál – odstraní uzamčení

**Uzavření celého kvartálu** (záložka Firma, sekce „Uzavření kvartálů"):
- Klikni **Uzavřít Q[x]** → systém vypočítá bonusy pro VŠECHNY uživatele a uloží snapshot
- Uzavřený kvartál se zobrazí jako zelená karta s historickým bonusem

### Záložka Manažeři (ADMIN + MANAGER)

Vyber období a uživatele.

**Co můžeš nastavit:**

| Sekce                   | Popis                                                          |
|-------------------------|----------------------------------------------------------------|
| Kompenzace              | Fixní plat, roční cílový bonus, KPI váha (%)                  |
| Výkonnostní parametry   | Per-user váha každého parametru; součet + KPI váha = 100 %    |
| KPI úkoly (Q1–Q4)       | Přidat/smazat/vyhodnotit KPI úkoly pro každý kvartál          |
| POP přiřazení           | Přiřadit uživatele k POP plánu s podílem a datem grantu       |

**Nastavení vah (krok za krokem):**
1. Vyber období a uživatele
2. V sekci výkonnostních parametrů vidíš všechny parametry (firemní + divize uživatele)
3. U každého parametru edituj pole Váha → klikni **Uložit**
4. Sleduj celkový součet vpravo – musí ukazovat **100 % ✓**
5. KPI váha se nastavuje v sekci Kompenzace → pole „KPI váha (%)"

---

## 10. Uzavírání kvartálů

Systém má dvě úrovně uzamčení:

### Úroveň 1: Zamknutí konkrétního výsledku (🔒)

- Zamkne jeden `QuarterlyResult` (jeden parametr, jeden kvartál)
- Výsledek nelze editovat, ale **bonus snapshot se nevytvoří**
- Lze odemknout přes 🔓 Odemknout kvartál

### Úroveň 2: Uzavření celého kvartálu (Uzavřít Q[x])

- Vytvoří `QuarterlySnapshot` pro KAŽDÉHO uživatele v daném období
- Uloží `bonusAmount` = vypočtený bonus v daném okamžiku
- Zamkne všechny `QuarterlyResult` daného kvartálu
- Na dashboardu uživatele se zobrazuje historická hodnota (ne live výpočet)

### Opětovné otevření

- **Odemknout kvartál** (🔓 na kartě parametru): smaže snapshot pro celé období + odemkne všechny výsledky daného kvartálu
- Po odemčení se dashboard vrátí k live výpočtu

---

## 11. POP – Phantom Option Plan

### Postup nastavení

1. Vytvoř **POP plán** na `/admin/pop` – nastav základní multiplikátor, grantEBITDA, vesting
2. Přidej **boostery** – každý zvyšuje multiplikátor o definovanou hodnotu
3. Přidej **roční data EBITDA** – každý rok zadej aktuální EBITDA (základ pro výpočet hodnoty firmy)
4. V záložce Manažeři → sekce POP → přiřaď uživatele k plánu s podílem (%) a datem grantu

### Výpočet hodnoty

```
Hodnota firmy dnes  = aktuální EBITDA × (základní multiplikátor + Σ aktivní boostery)
Hodnota firmy v grantu = grant EBITDA × základní multiplikátor
Vytvořená hodnota   = max(0, hodnota dnes − hodnota v grantu)
Hrubý výnos         = vytvořená hodnota × podíl uživatele (%)
```

### Vesting (rozložení výplat)

| Typ         | Popis                                               |
|-------------|-----------------------------------------------------|
| `YEARLY`    | Rovnoměrné roční splátky na definovaný datum (den/měsíc) |
| `QUARTERLY` | Rovnoměrné kvartální splátky, výplatní termíny 15. dubna / července / října / ledna |

---

## 12. Audit log

Každá změna dat se zaznamenává do `AuditLog`. Přehled je na `/admin/audit`.

Zaznamenávané akce (výběr):

| Akce                   | Popis                                  |
|------------------------|----------------------------------------|
| `INVITE_USER`          | Pozvání nového uživatele               |
| `SET_ROLE`             | Změna role uživatele                   |
| `SET_COMPENSATION`     | Změna kompenzace                       |
| `UPDATE_QUARTERLY_RESULT` | Aktualizace kvartálního výsledku    |
| `LOCK_QUARTER`         | Uzamčení výsledku                      |
| `CLOSE_QUARTER`        | Uzavření kvartálu (snapshot)           |
| `REOPEN_QUARTER`       | Opětovné otevření kvartálu             |
| `SET_PARAMETER_WEIGHT` | Nastavení váhy parametru per-user      |
| `ADD_KPI_TASK`         | Přidání KPI úkolu                      |
| `TOGGLE_KPI_TASK`      | Splnění / zrušení KPI úkolu            |

---

## 13. Nastavení vah – krok za krokem

Nejčastější chyba je nastavit váhy špatně a dostat bonus mimo očekávání.

### Pravidlo

> **Součet všech výkonnostních parametrů + KPI váha = 100 %**
> 
> Příklad: EBITDA 60 % + HORIZONT 40 % + KPI 0 % = 100 % ✓  
> Příklad: EBITDA 50 % + HORIZONT 30 % + KPI 20 % = 100 % ✓

### Postup (Admin)

1. Jdi na `/admin/parameters?tab=manageri`
2. Vyber **Období** (aktivní se vybere automaticky)
3. Vyber **Uživatele**
4. V sekci **Kompenzace** nastav:
   - Roční cílový bonus (CZK)
   - KPI váha (%) – kolik % bonusu tvoří KPI složka
5. V sekci výkonnostních parametrů nastav váhu pro každý parametr
6. Sleduj součet – musí být **100 % ✓**
7. Pokud je součet jiný, oprav váhy a ulož znovu

### Co se stane bez nastavení vah?

Pokud pro uživatele v tabulce `ParameterWeight` záznamy neexistují, použijí se globální váhy parametrů (`PerformanceParameter.weight`). Pokud jsou globální váhy špatně nastaveny (např. 0 pro nový parametr), bonus bude chybný.

---

## 14. Časté chyby a řešení

| Problém                                  | Příčina                                              | Řešení                                                |
|------------------------------------------|------------------------------------------------------|-------------------------------------------------------|
| Bonus je 0 Kč přestože jsou data         | Některý parametr nesplnil threshold (bariéru)        | Zkontroluj % plnění vs. Min. plnění na kartě parametru|
| Bonus je příliš vysoký                   | Součet vah přesahuje 100 %                           | Zkontroluj váhy v záložce Manažeři                    |
| Bonus je příliš nízký                    | Váha parametru je 0 (nebyla nastavena)               | Nastav per-user váhy v záložce Manažeři               |
| Tlačítko Odemknout / Zamknout nefunguje  | Formulář byl vnořen (opraveno)                       | Stránka by měla fungovat po aktualizaci               |
| Uživatel se nemůže přihlásit             | `isAllowed = false`                                  | Admin aktivuje účet v detailu uživatele               |
| IDE ukazuje chyby Prisma typů            | Zastaralá Prisma cache v IDE                         | Vercel build proběhne správně; spusť `npx prisma generate` |
| Snapshot ukazuje starý bonus             | Kvartál byl uzavřen před opravou dat                 | Admin znovu otevře kvartál → opraví data → znovu uzavře |
