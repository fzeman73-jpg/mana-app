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
  sharePercent:    number   // podíl v %
  grantEbitda:     number
  grantMultiplier: number
  currentEbitda:   number
  baseMultiplier:  number
  boosters:        BoosterInput[]
}

export type PopResult = {
  currentMultiplier: number   // base + boostery
  currentFirmValue:  number   // EBITDA × multiplier
  grantFirmValue:    number   // při vstupu do plánu
  createdValue:      number   // rozdíl
  grossGain:         number   // podíl × rozdíl (brutto)
  boosterTotal:      number   // součet aktivních boosterů
}

export type VestingInput = {
  grossGain:      number
  vestingYears:   number
  vestingPercent: number   // % ročně (např. 25)
  yearsSinceGrant: number
}

export type VestingSchedule = {
  year:       number
  percentage: number
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

  // 2. Gating – projdi parametry a označ gated
  for (const p of parameters) {
    if (!p.gatesParamId) continue
    const thisResult = results.find(r => r.id === p.id)
    if (!thisResult || thisResult.thresholdMet) continue
    // Tento parametr nesplnil threshold → gated cílový parametr
    const gatedResult = results.find(r => r.id === p.gatesParamId)
    if (gatedResult) gatedResult.gated = true
  }

  // 3. Výpočet bonusu parametrů
  let total = 0
  for (const r of results) {
    if (!r.thresholdMet || r.gated) {
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
  const grossGain         = createdValue * (input.sharePercent / 100)

  return {
    currentMultiplier,
    currentFirmValue,
    grantFirmValue,
    createdValue,
    grossGain,
    boosterTotal,
  }
}

// ─── VESTING ─────────────────────────────────────────────────────────────────

export function calcVestingSchedule(input: VestingInput): VestingSchedule[] {
  const schedule: VestingSchedule[] = []
  for (let year = 1; year <= input.vestingYears; year++) {
    schedule.push({
      year,
      percentage: input.vestingPercent,
      amount:     input.grossGain * (input.vestingPercent / 100),
      isCurrent:  year === input.yearsSinceGrant,
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

/** Počet let od data grantu (pro vesting) */
export function yearsSinceDate(date: Date): number {
  const now = new Date()
  return now.getFullYear() - date.getFullYear()
}
