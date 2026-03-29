"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"

// 1. ULOŽENÍ FINANČNÍCH PARAMETRŮ (Základ, Bonus, POP)
export async function updateCompensation(formData: FormData) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Nepřihlášen")

  const data = {
    baseSalary: parseFloat(formData.get("baseSalary") as string) || 0,
    targetBonusAnnual: parseFloat(formData.get("targetBonusAnnual") as string) || 0,
    popUnits: parseFloat(formData.get("popUnits") as string) || 0,
    grantEbitda: parseFloat(formData.get("grantEbitda") as string) || 0,
    grantMultiplier: parseFloat(formData.get("grantMultiplier") as string) || 0,
  }

  await prisma.compensation.upsert({
    where: { userId: session.user.id },
    update: data,
    create: { ...data, userId: session.user.id }
  })

  // Tohle zajistí, že se dashboard okamžitě překreslí s novými čísly
  revalidatePath("/")
}

// 2. PŘIDÁNÍ STRATEGICKÉHO ÚKOLU (Ovlivňuje multiplier)
export async function addStrategicMetric(formData: FormData) {
  const session = await auth()
  if (!session?.user?.id) return

  const name = formData.get("name") as string
  const impact = parseFloat(formData.get("multiplierImpact") as string) || 0

  await prisma.strategicMetric.create({
    data: {
      name,
      multiplierImpact: impact,
      userId: session.user.id,
    }
  })

  revalidatePath("/")
}

// 3. PŘEPNUTÍ ÚKOLU (Splněno/Nesplněno)
export async function toggleMetric(id: string, currentStatus: boolean) {
  await prisma.strategicMetric.update({
    where: { id },
    data: { isCompleted: !currentStatus }
  })
  revalidatePath("/")
}