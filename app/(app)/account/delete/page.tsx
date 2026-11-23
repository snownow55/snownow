import { AccountDeletionForm } from "@/components/account-deletion-form";
import { deletionConfiguration } from "@/lib/account-deletion";

export const dynamic = "force-dynamic";

export default function DeleteAccountPage() {
  return <AccountDeletionForm available={deletionConfiguration(process.env) !== null} />;
}
