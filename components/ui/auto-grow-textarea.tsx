"use client";

import { useCallback, useEffect, useRef, type ComponentPropsWithoutRef } from "react";

/**
 * A textarea that grows with its content.
 *
 * The reference design pairs `resize: none` with `overflow: hidden`, which only
 * looks right if the box is resized programmatically — otherwise a three-line
 * answer is clipped with no scrollbar and no way to read the rest. Height is
 * reset to `auto` before measuring so the box can also *shrink* when text is
 * deleted, and the caller's `min-h` keeps an empty field at its intended size.
 *
 * Uncontrolled by default: these sit inside forms and inside autosaving lists,
 * and a controlled textarea that re-renders mid-typing fights the user's cursor.
 * The parent owns the value via `defaultValue` and `onBlur`.
 *
 * Pass `value` when the parent genuinely owns the value — the prescription
 * builder's draft, which the voice copilot also writes to. The measurement then
 * runs on every value change rather than on input, which also covers text that
 * arrived without a keystroke.
 */
export function AutoGrowTextarea({
  className,
  defaultValue,
  onInput,
  value,
  fill,
  ...props
}: Omit<
  ComponentPropsWithoutRef<"textarea">,
  "onInput" | "ref" | "className" | "defaultValue" | "value"
> & {
  className?: string;
  defaultValue?: string | null;
  onInput?: ComponentPropsWithoutRef<"textarea">["onInput"];
  /** Supplying this makes the field controlled. */
  value?: string;
  /**
   * Grow to the content but let the box stretch taller than that.
   *
   * For fields that share a row with a longer sibling: a fixed pixel height
   * would leave the shorter field visibly shorter, and a flex-stretched one
   * would never shrink again, because `scrollHeight` on an already-stretched
   * textarea reports the stretched height — so deleting text would not bring it
   * back down. This measures the content, records it as a floor, then releases
   * the box so CSS owns the height again. The field stays its own minimum size
   * and can only be pushed taller by its sibling.
   */
  fill?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const content = el.scrollHeight;
    if (fill) {
      el.style.minHeight = `${content}px`;
      // Hand the height back to CSS so a taller sibling can stretch the box.
      el.style.height = "";
    } else {
      el.style.minHeight = "";
      el.style.height = `${content}px`;
    }
  }, [fill]);

  // Seed the height from the prefilled value on mount and whenever it changes,
  // so an existing long answer is fully visible before the user types anything.
  useEffect(() => {
    resize();
  }, [resize, defaultValue]);

  // Controlled: re-measure when the value changes, whoever wrote it.
  useEffect(() => {
    if (value === undefined) return;
    resize();
  }, [value, resize]);

  return (
    <textarea
      {...props}
      ref={ref}
      value={value}
      defaultValue={value === undefined ? (defaultValue ?? "") : undefined}
      onInput={(event) => {
        resize();
        onInput?.(event);
      }}
      className={className}
    />
  );
}
