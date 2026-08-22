import { LoginForm } from "@/components/login-form";
import { getSessionUserId } from "@/lib/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getSessionUserId()) redirect("/dashboard");
  return <LoginForm />;
}
