import { cookies } from "next/headers";
import { createHmac, timingSafeEqual, createHash } from "node:crypto";
export function same(a: string, b: string) {
  const hash = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(hash(a), hash(b));
}
function sign(value: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("Configure SESSION_SECRET (32 or more characters).");
  return createHmac("sha256", secret).update(value).digest("hex");
}
export async function login(password: string) {
  if (
    !process.env.DEMO_OPERATOR_PASSWORD ||
    !same(password, process.env.DEMO_OPERATOR_PASSWORD)
  )
    throw new Error("Operator sign-in unavailable or password incorrect.");
  const end = String(Date.now() + 3600000);
  (await cookies()).set("operator", end + "." + sign(end), {
    httpOnly: true,
    sameSite: "strict",
    maxAge: 3600,
    path: "/",
  });
}
export async function authorize() {
  const [end, signature] = (
    (await cookies()).get("operator")?.value ?? ""
  ).split(".");
  if (!(Number(end) > Date.now()) || !same(sign(end), signature ?? ""))
    throw new Error("Sign in as the demo operator first.");
}
