// lib/calculator.ts

export type KpiTaskInput = {
  weight: number
  isCompleted: boolean
}

export type BonusBreakdown = {
  ebitda:  number
  horizont: number
  kpi:     number
  total:   number
}

export type CompanyParams = {
  currentEbitda:     number
  targetEbitda:      number
  currentHorizont:   number
  targetHorizont:    number
  currentMultiplier: number
}

export type CompensationParams = {
  targetBonusAnnual:   number
  bonusWeightEbitda:   number  // %
  bonusWeightHorizont: number  // %
  bonusWeightKpi:      number  // %
  sharePercent:        number  // %
  grantEbitda:         number
  grantMultiplier:     number
}

// Roční bonus – EBITDA složka
export function calcBonusEbitda(
  company: Pick<CompanyParams, 'currentEbitda' | 'targetEbitda'>,
  comp: Pick<CompensationParams, 'targetBonusAnnual' | 'bonusWeightEbitda'>
): number {
  if (comp.targetBonusAnnual === 0 || comp.bonusWeightEbitda === 0) return 0
  const achievement = company.targetEbitda > 0
    ? Math.min(1.5, company.currentEbitda / company.targetEbitda)
    : 0
  return comp.targetBonusAnnual * (comp.bonusWeightEbitda / 100) * achievement
}

// Roční bonus – HORIZONT složka
export function calcBonusHorizont(
  company: Pick<CompanyParams, 'currentHorizont' | 'targetHorizont'>,
  comp: Pick<CompensationParams, 'targetBonusAnnual' | 'bonusWeightHorizont'>
): number {
  if (comp.targetBonusAnnual === 0 || comp.bonusWeightHorizont === 0) return 0
  const achievement = company.targetHorizont > 0
    ? Math.min(1.5, company.currentHorizont / company.targetHorizont)
    : 0
  return comp.targetBonusAnnual * (comp.bonusWeightHorizont / 100) * achievement
}

// Roční bonus – KPI složka
export function calcBonusKpi(
  kpiTasks: KpiTaskInput[],
  comp: Pick<CompensationParams, 'targetBonusAnnual' | 'bonusWeightKpi'>
): number {
  if (comp.targetBonusAnnual === 0 || comp.bonusWeightKpi === 0) return 0
  const totalWeight     = kpiTasks.reduce((s, t) => s + t.weight, 0)
  const completedWeight = kpiTasks.filter(t => t.isCompleted).reduce((s, t) => s + t.weight, 0)
  const achievement     = totalWeight > 0 ? completedWeight / totalWeight : 0
  return comp.targetBonusAnnual * (comp.bonusWeightKpi / 100) * achievement
}

// Celkový roční bonus – agregát
export function calcBonus(
  company: CompanyParams,
  comp: CompensationParams,
  kpiTasks: KpiTaskInput[]
): BonusBreakdown {
  const ebitda  = calcBonusEbitda(company, comp)
  const horizont = calcBonusHorizont(company, comp)
  const kpi     = calcBonusKpi(kpiTasks, comp)
  return { ebitda, horizont, kpi, total: ebitda + horizont + kpi }
}

// Phantom Option Plan
export function calcPOP(
  company: Pick<CompanyParams, 'currentEbitda' | 'currentMultiplier'>,
  comp: Pick<CompensationParams, 'sharePercent' | 'grantEbitda' | 'grantMultiplier'>
): number {
  const currentValue = company.currentEbitda * company.currentMultiplier
  const grantValue   = comp.grantEbitda * comp.grantMultiplier
  const created      = Math.max(0, currentValue - grantValue)
  return created * (comp.sharePercent / 100)
}
