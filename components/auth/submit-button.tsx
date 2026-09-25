"use client";

import { useFormStatus } from "react-dom";

import { Button, type ButtonProps } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

interface SubmitButtonProps extends Omit<ButtonProps, "type"> {
  /** Text shown while the form is submitting. */
  loadingText?: string;
}

/**
 * Renders the native form submit button and swaps its content for a spinner
 * while the parent <form>'s server action is pending.
 */
export function SubmitButton({
  loadingText = "Please wait…",
  children,
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      {...props}
    >
      {pending ? (
        <>
          <Spinner size="sm" />
          {loadingText}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
