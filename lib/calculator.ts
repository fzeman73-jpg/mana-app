/**
 * Výpočetní logika – odměny a POP
 * Striktně odděleno od UI. Žádné importy z Prisma nebo Next.js.
 */

// ─── TYPY ────────────────────────────────────────────────────────────────────

export type ParameterInput = {
  id:           string
  name:         string
  weight:       number   // váha v % (0–100)
  threshold:    number   // bariéra v % plnění (0–100), pod tím = 0
  gatesParamId: string | null  // ID parametru, který se nuluje při neúspěchu tohoto
  actual:       number   // skutečná hodnota
  target:       number   // cílová hodnota
}

export type ParameterResult = {
  id:           string
  name:         string
  weight:       number
  achievement:  number   // % plnění (0–1.5)
  thresholdMet: boolean  // splněna bariéra
  gated:        boolean  // nulován jiným parametrem
  bonusAmount:  number   // vypočtená částka bonusu
}

export type BonusBreakdown = {
  parameters: ParameterResult[]
  total:      number
}

export type KpiInput = {
  weight:        number
  completionPct: number  // normalizováno na 0–1 (BOOLEAN: 0|1, PERCENT: pct/100, AMOUNT: actual/target)
}

export type BoosterInput = {
  multiplierBoost: number
  isAchieved:      boolean
}

export type PopInput = {
  sharePercent:     number   // podíl v %
  grantEbitda:      number
  grantMultiplier:  number
  currentEbitda:    number
  baseMultiplier:   number
  boosters:         BoosterInput[]
  minGrowthPercent: number   // hurdle rate – min. % růstu hodnoty firmy (0 = bez podmínky)
}

export type PopResult = {
  currentMultiplier: number   // base + boostery
  currentFirmValue:  number   // EBITDA × multiplier
  grantFirmValue:    number   // při vstupu do plánu
  createdValue:      number   // rozdíl
  grossGain:         number   // podíl × rozdíl (brutto); 0 pokud hurdle nesplněn
  boosterTotal:      number   // součet aktivních boosterů
  growthPercent:     number   // % růstu hodnoty firmy od grantu
  hurdleMet:         boolean  // true pokud growth >= minGrowthPercent
}

export type VestingInput = {
  grossGain:          number
  granularity:        "YEARLY" | "QUARTERLY"
  // YEARLY
  vestingYears:       number
  vestingPaymentDay:  number   // den vyplacení, např. 1
  vestingPaymentMonth: number  // měsíc vyplacení, např. 5 = květen
  grantYear:          number   // rok grantu (pro výpočet dat)
  // QUARTERLY
  vestingQuarters:    number
}

export type VestingSchedule = {
  index:      number   // pořadí splátky (rok 1–N nebo kvartál 1–N)
  label:      string   // zobrazovaný popis, např. "Rok 1" nebo "Q2 2027"
  payDate:    string   // datum vyplacení, např. "1.5.2027" nebo "15.4.2027"
  percentage: number   // % z celku
  amount:     number
  isCurrent:  boolean
}

// ─── BONUS Z VÝKONNOSTNÍCH PARAMETRŮ ─────────────────────────────────────────

/**
 * Spočítá bonus ze sady výkonnostních parametrů.
 * Logika:
 *   1. Pro každý parametr spočítá % plnění (actual/target, max 150%)
 *   2. Pokud plnění < threshold → složka je 0 (bariéra)
 *   3. Gating: pokud parametr A nesplní threshold a má gatesParamId → parametr B je také 0
 *   4. Bonus = targetBonus × weight/100 × achievement
 */
export function calcBonus(
  parameters: ParameterInput[],
  targetBonusAnnual: number,
  kpiTasks: KpiInput[],
  kpiWeight: number          // % váha KPI složky z celkového bonusu
): BonusBreakdown {
  if (targetBonusAnnual === 0) {
    return { parameters: [], total: 0 }
  }

  // 1. Spočítej achievement a threshold pro každý parametr
  const results: ParameterResult[] = parameters.map(p => {
    const achievement = p.target > 0
      ? Math.min(1.5, p.actual / p.target)
      : 0
    const thresholdMet = achievement >= (p.threshold / 100)
    return {
      id:           p.id,
      name:         p.name,
      weight:       p.weight,
      achievement,
      thresholdMet,
      gated:        false,  // zatím ne
      bonusAmount:  0,      // dopočítáme
    }
  })

  // 2. Pokud JAKÝKOLIV parametr nesplní threshold → všechny výkonnostní parametry jsou 0
  const anyFailed = results.some(r => !r.thresholdMet)

  // 3. Výpočet bonusu parametrů
  let total = 0
  for (const r of results) {
    if (anyFailed || !r.thresholdMet) {
      r.bonusAmount = 0
    } else {
      r.bonusAmount = targetBonusAnnual * (r.weight / 100) * r.achievement
    }
    total += r.bonusAmount
  }

  // 4. KPI složka
  if (kpiWeight > 0 && kpiTasks.length > 0) {
    const totalW    = kpiTasks.reduce((s, t) => s + t.weight, 0)
    const weightedW = kpiTasks.reduce((s, t) => s + t.weight * t.completionPct, 0)
    const kpiAch    = totalW > 0 ? weightedW / totalW : 0
    const kpiBonus  = targetBonusAnnual * (kpiWeight / 100) * kpiAch
    results.push({
      id:           'kpi',
      name:         'KPI úkoly',
      weight:       kpiWeight,
      achievement:  kpiAch,
      thresholdMet: true,
      gated:        false,
      bonusAmount:  kpiBonus,
    })
    total += kpiBonus
  }

  return { parameters: results, total }
}

// ─── POP – PHANTOM OPTION PLAN ───────────────────────────────────────────────

export function calcPOP(input: PopInput): PopResult {
  const boosterTotal = input.boosters
    .filter(b => b.isAchieved)
    .reduce((s, b) => s + b.multiplierBoost, 0)

  const currentMultiplier = input.baseMultiplier + boosterTotal
  const currentFirmValue  = input.currentEbitda * currentMultiplier
  const grantFirmValue    = input.grantEbitda   * input.grantMultiplier
  const createdValue      = Math.max(0, currentFirmValue - grantFirmValue)
  const growthPercent     = grantFirmValue > 0
    ? ((currentFirmValue - grantFirmValue) / grantFirmValue) * 100
    : 0
  const hurdleMet  = growthPercent >= input.minGrowthPercent
  const grossGain  = hurdleMet ? createdValue * (input.sharePercent / 100) : 0

  return {
    currentMultiplier,
    currentFirmValue,
    grantFirmValue,
    createdValue,
    grossGain,
    boosterTotal,
    growthPercent,
    hurdleMet,
  }
}

// ─── VESTING ─────────────────────────────────────────────────────────────────

export function calcVestingSchedule(input: VestingInput): VestingSchedule[] {
  const now = new Date()

  if (input.granularity === "QUARTERLY") {
    const count = input.vestingQuarters
    const pct   = count > 0 ? 100 / count : 0
    // Q1 ends Mar 31 → pay Apr 15, Q2→Jul 15, Q3→Oct 15, Q4→Jan 15 next year
    const payMonths = [4, 7, 10, 1]
    const schedule: VestingSchedule[] = []
    for (let i = 0; i < count; i++) {
      const quarterInYear = i % 4                      // 0–3
      const yearOffset    = Math.floor(i / 4)
      const payMonth      = payMonths[quarterInYear]
      const payYear       = input.grantYear + yearOffset + (quarterInYear === 3 ? 1 : 0)
      const isCurrent     = now >= new Date(payYear, payMonth - 1, 1) &&
                            now < new Date(payYear, payMonth, 1)
      schedule.push({
        index:      i + 1,
        label:      `Q${quarterInYear + 1} ${input.grantYear + yearOffset}`,
        payDate:    `15.${String(payMonth).padStart(2, "0")}.${payYear}`,
        percentage: pct,
        amount:     input.grossGain * (pct / 100),
        isCurrent,
      })
    }
    return schedule
  }

  // YEARLY
  const count = input.vestingYears
  const pct   = count > 0 ? 100 / count : 0
  const schedule: VestingSchedule[] = []
  for (let year = 1; year <= count; year++) {
    const payYear = input.grantYear + year
    const isCurrent = now.getFullYear() === payYear &&
                      now.getMonth() + 1 <= input.vestingPaymentMonth
    schedule.push({
      index:      year,
      label:      `Rok ${year}`,
      payDate:    `${input.vestingPaymentDay}.${String(input.vestingPaymentMonth).padStart(2, "0")}.${payYear}`,
      percentage: pct,
      amount:     input.grossGain * (pct / 100),
      isCurrent,
    })
  }
  return schedule
}

// ─── POMOCNÉ FUNKCE ──────────────────────────────────────────────────────────

/** Aktuální kvartál (1–4) a rok */
export function currentQuarter(): { quarter: number; year: number } {
  const now = new Date()
  return {
    quarter: Math.ceil((now.getMonth() + 1) / 3),
    year:    now.getFullYear(),
  }
}

