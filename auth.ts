import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { prisma } from "./lib/db" // Ujisti se, že importuješ ten správný soubor

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      
      try {
        // TADY SE DĚJE TEN ZÁPIS - MUSÍ TAM BÝT AWAIT
        await prisma.user.upsert({
          where: { email: user.email },
          update: { name: user.name, image: user.image },
          create: {
            email: user.email,
            name: user.name,
            image: user.image,
          },
        });
        console.log("Uživatel uložen/aktualizován v DB:", user.email);
        return true;
      } catch (error) {
        console.error("KRITICKÁ CHYBA ZÁPISU DO DB:", error);
        return true; 
      }
    },
  },
  session: { strategy: "jwt" },
  secret: process.env.AUTH_SECRET,
})

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false

      const dbUser = await prisma.user.findUnique({
        where: { email: user.email }
      })

      // Tady je ta nová brána:
      // Pustíme ho jen pokud už je v DB a má isAllowed: true
      return dbUser?.isAllowed ?? false
    },
    // Tady nechej své původní JWT a session callbacky, co už tam máš:
    async jwt({ token, user }) {
      if (user) token.id = user.id
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
      }
      return session
    },
  },
})