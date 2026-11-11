import type { FieldError } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

interface FormFieldProps extends React.ComponentProps<"input"> {
  id: string;
  label: string;
  error?: FieldError;
  /** Password fields only: adds the show/hide button. */
  revealable?: boolean;
}

/** Label, input and inline error message, wired for accessibility (aria-invalid, aria-describedby). */
export function FormField({ id, label, error, revealable, type, ...inputProps }: FormFieldProps) {
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {revealable ? (
        <PasswordInput id={id} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} {...inputProps} />
      ) : (
        <Input id={id} type={type} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} {...inputProps} />
      )}
      {error && (
        <p id={errorId} className="text-sm text-destructive">
          {error.message}
        </p>
      )}
    </div>
  );
}
