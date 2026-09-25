import type { Metadata } from "next";
import Link from "next/link";
import { MailCheck } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { APP_ROUTES } from "@/lib/constants";

export const metadata: Metadata = { title: "Verify your email" };

interface VerifyPageProps {
  searchParams: Promise<{ confirmed?: string }>;
}

export default async function VerifyPage({ searchParams }: VerifyPageProps) {
  const { confirmed } = await searchParams;
  const isConfirmed = confirmed === "1";

  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-pill bg-primary/10">
          <MailCheck className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>
        <CardTitle className="text-2xl">
          {isConfirmed ? "Email confirmed" : "Check your inbox"}
        </CardTitle>
        <CardDescription>
          {isConfirmed
            ? "Your email is verified. You can now sign in."
            : `We sent a confirmation link to your email address. Click it to
               activate your account, then sign in.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3">
        {isConfirmed ? (
          <Button asChild className="w-full">
            <Link href={APP_ROUTES.auth.login}>Sign in</Link>
          </Button>
        ) : (
          <Button asChild variant="outline" className="w-full">
            <Link href={APP_ROUTES.auth.login}>Back to sign in</Link>
          </Button>
        )}
        {!isConfirmed && (
          <p className="text-sm text-text-muted">
            Didn&apos;t get the email? Check your spam folder, or request a new
            one from the sign-in page.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
