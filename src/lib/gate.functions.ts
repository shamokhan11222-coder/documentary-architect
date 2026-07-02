// Optional private-access gate. Active ONLY when SITE_PASSWORD is set as an
// environment variable on the deployment. When it is not set, the site is open
// (behaves exactly as before). This lets DOCU OS be deployed as a normal
// private website without requiring the Lovable editor.
import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { createHash, timingSafeEqual } from "node:crypto";

type GateSession = { unlocked?: boolean };

function sessionConfig() {
  return {
    password: process.env.SESSION_SECRET as string,
    name: "docos-gate",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "lax" as const,
      path: "/",
    },
  };
}

function passwordMatches(input: string, expected: string): boolean {
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

/** Whether the gate is enabled (password configured) and whether unlocked. */
export const getGateStatus = createServerFn({ method: "GET" }).handler(
  async () => {
    const enabled = Boolean(process.env.SITE_PASSWORD);
    if (!enabled) return { enabled: false, unlocked: true };
    const session = await useSession<GateSession>(sessionConfig());
    return { enabled: true, unlocked: Boolean(session.data.unlocked) };
  },
);

export const unlockSite = createServerFn({ method: "POST" })
  .inputValidator((data: { password: string }) => data)
  .handler(async ({ data }) => {
    const expected = process.env.SITE_PASSWORD;
    if (!expected) return { ok: true as const }; // gate disabled
    if (!passwordMatches(data.password ?? "", expected)) {
      return { ok: false as const };
    }
    const session = await useSession<GateSession>(sessionConfig());
    await session.update({ unlocked: true });
    return { ok: true as const };
  });

export const lockSite = createServerFn({ method: "POST" }).handler(async () => {
  const session = await useSession<GateSession>(sessionConfig());
  await session.clear();
  return { ok: true as const };
});
