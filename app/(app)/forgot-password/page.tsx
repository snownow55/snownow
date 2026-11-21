import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
export default function Page() {
  return (
    <Suspense fallback={<p role="status">読み込み中…</p>}>
      <AuthForm mode="forgot" />
    </Suspense>
  );
}
