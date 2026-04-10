import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import Credentials from "next-auth/providers/credentials"
import { prisma } from "@/lib/db"
import bcrypt from "bcryptjs"

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google,
    Credentials({
      credentials: {
        email:    { label: "Email" },
        password: { label: "Heslo", type: "password" },
      },
      async authorize(credentials) {
        const email    = credentials?.email as string | undefined
        const password = credentials?.password as string | undefined
        if (!email || !password) return null

        const user = await prisma.user.findUnique({ where: { email } })
        if (!user || !user.password || !user.isAllowed) return null

        const valid = await bcrypt.compare(password, user.password)
        if (!valid) return null

        return { id: user.id, email: user.email, name: user.name, image: user.image }
      }
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false

      const dbUser = await prisma.user.findUnique({ where: { email: user.email } })

      if (!dbUser) {
        // Bootstrap: pokud žádný admin neexistuje, první přihlášení = admin
        const adminCount = await prisma.user.count({ where: { role: "ADMIN", isAllowed: true } })
        if (adminCount === 0) {
          await prisma.user.create({
            data: { email: user.email, name: user.name, image: user.image, isAllowed: true, role: "ADMIN" },
          })
          return true
        }
        return false
      }

      if (!dbUser.isAllowed) return false

      // Aktualizace jména/fotky z Google
      if (user.name || user.image) {
        await prisma.user.update({
          where: { email: user.email },
          data: { name: user.name ?? undefined, image: user.image ?? undefined },
        })
      }

      await prisma.auditLog.create({
        data: { userEmail: user.email, action: "LOGIN" },
      })

      return true
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
  pages: {
    error: '/',
  }
})
