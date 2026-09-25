import type { Metadata } from "next";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Forgot password" };

interface ForgotPasswordPageProps {
  searchParams: Promise<{ expired?: string }>;
}

export default async function ForgotPasswordPage({
  searchParams,
}: ForgotPasswordPageProps) {
  const { expired } = await searchParams;

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Reset your password</CardTitle>
        <CardDescription>
          Enter your email and we&apos;ll send you a reset link.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {expired === "1" && (
          <Alert variant="warning" className="mb-4">
            <AlertDescription>
              That reset link is invalid or has expired. Request a new one
              below.
            </AlertDescription>
          </Alert>
        )}
        <ForgotPasswordForm />
      </CardContent>
    </Card>
  );
}
