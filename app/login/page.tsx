import LoginForm from "@/components/login/LoginForm";
import { OAUTH_PROVIDERS, isProviderConfigured } from "@/lib/sms";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;

  const providers = OAUTH_PROVIDERS.map((p) => ({
    id: p.id,
    name: p.name,
    icon: p.icon,
    configured: isProviderConfigured(p.id),
  }));

  return <LoginForm providers={providers} from={from} />;
}
