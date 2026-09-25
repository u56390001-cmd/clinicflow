import { Building2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { APP_ROUTES } from "@/lib/constants";

export function ClinicEmptyState() {
  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-pill bg-primary/10">
          <Building2 className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>
        <CardTitle className="text-xl">Set up your clinic</CardTitle>
        <CardDescription>
          You haven&apos;t created a clinic yet. Add one now to start managing
          patients, availability and more.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center">
        <Button asChild size="lg">
          <a href={APP_ROUTES.app.clinicNew}>Set up your clinic</a>
        </Button>
      </CardContent>
    </Card>
  );
}
