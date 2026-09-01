import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import PostgresAdapter from "@auth/pg-adapter";
import bcrypt from "bcryptjs";
import { Pool } from "pg";

/**
 * Singleton pool shared with the rest of the app (drizzle, etc).
 * We reuse it here so Auth.js and the app share one connection pool.
 * Lazy-initialised so the Edge runtime (middleware) never touches Node APIs.
 */
let _pool: Pool | null = null;
function getPool(): Pool {
  if (!_pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is required for Auth.js adapter");
    _pool = new Pool({
      connectionString: url,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    _pool.on("error", (err) => {
      console.error("[auth/pool] unexpected idle client error", err);
    });
  }
  return _pool;
}

/**
 * Extend the default Auth.js session type to include `id` and `role` on the
 * JWT / session user so downstream code can check roles without a DB hit.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
  interface User {
    id: string;
    role: string;
  }
}



/**
 * Lazily constructed PostgresAdapter.  The pool + adapter are only created
 * when a server-side route actually calls the adapter (login, register, etc.),
 * so the Edge runtime used by middleware never loads `pg`.
 */
let _adapter: ReturnType<typeof PostgresAdapter> | null = null;
function getAdapter() {
  if (!_adapter) {
    _adapter = PostgresAdapter(getPool());
  }
  return _adapter;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: getAdapter(),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      authorization: {
        params: {
          scope: "openid email profile",
        },
      },
    }),
    Credentials({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = String(credentials.email).toLowerCase().trim();
        const password = String(credentials.password);

        const pool = getPool();
        try {
          // Look up user in our credentials_users table
          const result = await pool.query(
            "SELECT id, email, name, password_hash, role FROM credentials_users WHERE email = $1 LIMIT 1",
            [email],
          );
          const user = result.rows[0];
          if (!user) return null;

          const valid = await bcrypt.compare(password, user.password_hash);
          if (!valid) return null;

          return {
            id: user.id,
            name: user.name ?? email.split("@")[0],
            email: user.email,
            role: user.role ?? "viewer",
          };
        } catch (err) {
          console.error("[auth] authorize error", err);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // On initial sign-in, merge user fields into the JWT
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role ?? "viewer";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role as string) ?? "viewer";
      }
      return session;
    },
  },
});
