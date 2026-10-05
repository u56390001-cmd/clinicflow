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
  disabled,
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      // OR'd rather than `{...props}`-last: a caller's `disabled` (the
      // Prescription card's "nothing changed yet") would otherwise land after
      // this prop and re-enable the button mid-submit, allowing a double save.
      disabled={pending || disabled}
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
