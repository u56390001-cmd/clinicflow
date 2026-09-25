import type { Metadata } from "next";

import { LoginForm } from "@/components/auth/login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Sign in" };

interface LoginPageProps {
  searchParams: Promise<{
    next?: string;
    error?: string;
    reset?: string;
  }>;
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_link:
    "That verification or reset link is invalid or has expired. Please request a new one.",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Welcome back</CardTitle>
        <CardDescription>
          Sign in to manage your clinic.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm
          next={params.next}
          notice={params.reset === "success" ? "Password updated. Sign in with your new password." : undefined}
          errorMessage={params.error ? ERROR_MESSAGES[params.error] : undefined}
        />
      </CardContent>
    </Card>
  );
}
