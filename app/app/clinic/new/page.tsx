import type { Metadata } from "next";

import { ClinicCreateForm } from "@/components/clinic/clinic-create-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Set up your clinic" };

export default function ClinicNewPage() {
  return (
    <div className="mx-auto max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Set up your clinic</CardTitle>
          <CardDescription>
            Create your clinic to get started. You&apos;ll be its owner — you can
            add more clinics and team members later.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ClinicCreateForm />
        </CardContent>
      </Card>
    </div>
  );
}
