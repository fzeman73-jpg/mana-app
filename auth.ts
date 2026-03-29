import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { prisma } from "@/lib/db"

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  callbacks: {
    async signIn({ user }) {
      // Pokud Google nevrátí email, nepustíme ho vůbec
      if (!user.email) return false

      // Podíváme se do databáze, jestli tam uživatel už je
      const dbUser = await prisma.user.findUnique({
        where: { email: user.email }
      })

      // HLAVNÍ BRÁNA: 
      // Pustíme ho jen pokud existuje v DB a má isAllowed nastaveno na true.
      // Pokud tam není, nebo má false, signIn vrátí chybu a nepustí ho do aplikace.
      return dbUser?.isAllowed ?? false
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
      }
      return session
    },
  },
  // Tato stránka se zobrazí, když signIn vrátí "false" (nepovolený uživatel)
  pages: {
    error: '/', 
  }
})