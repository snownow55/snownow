import { AuthProvider } from "@/components/auth-provider";
import { AppFooter } from "@/components/app-footer";

// URL-neutral route group: preserve the normal app auth provider and header.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}<AppFooter /></AuthProvider>;
}
