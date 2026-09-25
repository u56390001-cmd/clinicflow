"use client";

import { useCallback, useRef } from "react";
import { Upload, X, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];
const MAX_SIZE = 10 * 1024 * 1024;

interface ProofUploadProps {
  onFileSelect: (file: File) => void;
  file: File | null;
  onRemove: () => void;
  error?: string;
}

export function ProofUpload({
  onFileSelect,
  file,
  onRemove,
  error,
}: ProofUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const validate = useCallback((f: File): string | null => {
    if (!ALLOWED_TYPES.includes(f.type)) {
      return "File must be JPG, PNG, WebP, or PDF.";
    }
    if (f.size > MAX_SIZE) {
      return "File must be under 10 MB.";
    }
    return null;
  }, []);

  const handleFile = useCallback(
    (f: File) => {
      const err = validate(f);
      if (err) {
        onRemove();
        // Trigger error display by dispatching a custom change event
        const input = inputRef.current;
        if (input) {
          input.setCustomValidity(err);
          input.reportValidity();
          input.setCustomValidity("");
        }
        return;
      }
      onFileSelect(f);
    },
    [validate, onFileSelect, onRemove],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const dropped = e.dataTransfer.files[0];
      if (dropped) handleFile(dropped);
    },
    [handleFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      if (selected) handleFile(selected);
    },
    [handleFile],
  );

  const isImage = file?.type.startsWith("image/");

  const preview = file ? (
    isImage ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={URL.createObjectURL(file)}
        alt="Proof preview"
        className="h-16 w-16 rounded-control object-cover"
      />
    ) : (
      <div className="flex h-16 w-16 items-center justify-center rounded-control bg-status-destructive/10">
        <FileText className="h-8 w-8 text-status-destructive" />
      </div>
    )
  ) : null;

  return (
    <div className="space-y-2">
      {file ? (
        <div className="relative flex items-center gap-4 rounded-card border border-text-muted/30 bg-surface p-4">
          {preview}

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-text-primary">
              {file.name}
            </p>
            <p className="text-xs text-text-muted">
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={onRemove}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          className={cn(
            "flex w-full flex-col items-center gap-2 rounded-card border-2 border-dashed p-8 text-center transition-colors",
            error
              ? "border-status-destructive/50 bg-status-destructive/5"
              : "border-text-muted/40 hover:border-primary/50 hover:bg-primary/5",
          )}
          onClick={() => inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          <Upload className="h-8 w-8 text-text-muted" />
          <div>
            <p className="text-sm font-medium text-text-primary">
              Click to browse
            </p>
            <p className="text-xs text-text-muted">
              JPG, PNG, WebP, or PDF (max 10 MB)
            </p>
          </div>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.pdf"
        className="hidden"
        onChange={handleChange}
      />

      {error && (
        <p className="text-xs text-status-destructive">{error}</p>
      )}
    </div>
  );
}
