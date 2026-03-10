import NextAuth from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import EmailProvider from "next-auth/providers/email"
import { PrismaAdapter } from "@auth/prisma-adapter"
import prisma from "@/lib/prisma"

export const authOptions = {
    adapter: PrismaAdapter(prisma),
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        }),
        EmailProvider({
            server: process.env.EMAIL_SERVER,
            from: process.env.EMAIL_FROM,
        }),
    ],
    session: {
        strategy: "jwt"
    },
    events: {
        async createUser({ user }) {
            // Automatically set notification_email to the user's login email
            if (user.email) {
                await prisma.setting.create({
                    data: {
                        userId: user.id,
                        key: 'notification_email',
                        value: user.email,
                    }
                });
            }
        }
    },
    callbacks: {
        async session({ session, token }) {
            if (session?.user) {
                session.user.id = token.uid;
            }
            return session;
        },
        async jwt({ token, user }) {
            if (user) {
                token.uid = user.id;
            }
            return token;
        }
    }
}

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }
