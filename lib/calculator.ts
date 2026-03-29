// lib/calculator.ts

export function calculatePOP(
  currentEbitda: number,
  baseMultiplier: number,
  metrics: { multiplierImpact: number, isCompleted: boolean }[],
  compensation: { grantEbitda: number, grantMultiplier: number, popUnits: number }
) {
  // 1. Spočítáme aktuální multiplier (základ + splněné úkoly)
  const bonusMultiplier = metrics
    .filter(m => m.isCompleted)
    .reduce((sum, m) => sum + m.multiplierImpact, 0);
  
  const currentMultiplier = baseMultiplier + bonusMultiplier;

  // 2. Aktuální hodnota firmy vs. Hodnota při grantu
  const currentCompanyValue = currentEbitda * currentMultiplier;
  const grantCompanyValue = compensation.grantEbitda * compensation.grantMultiplier;

  // 3. Rozdíl (vytvořená hodnota)
  const valueCreated = Math.max(0, currentCompanyValue - grantCompanyValue);

  // 4. Podíl uživatele (Phantom Payout)
  return valueCreated * (compensation.popUnits / 100); 
}