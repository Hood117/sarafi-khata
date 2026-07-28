"use client";

import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { loginAction } from "@/features/auth/actions/session-actions";
import {
  loginSchema,
  toLoginFieldErrors,
} from "@/features/auth/schemas/login";
import { ThemeToggle } from "@/design-system/theme-toggle";
import { Typography } from "@/design-system/typography";
import { cn } from "@/lib/utils";

type FormErrors = {
  username?: string;
  password?: string;
  form?: string;
};

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = loginSchema.safeParse({ username, password });
    if (!parsed.success) {
      setErrors(toLoginFieldErrors(parsed.error));
      return;
    }

    setErrors({});
    setIsLoading(true);

    try {
      const result = await loginAction(parsed.data);

      if (!result.ok) {
        setErrors({
          ...(result.fieldErrors ?? {}),
          form: result.message,
        });
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setErrors({ form: "Unable to sign in. Please try again." });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-md shadow-lg ring-foreground/5">
      <CardHeader className="relative items-center text-center">
        <div className="absolute top-0 right-0">
          <ThemeToggle />
        </div>

        <div className="bg-primary text-primary-foreground mb-2 flex size-14 items-center justify-center rounded-2xl text-xl font-semibold tracking-wide">
          S
        </div>
        <CardTitle className="text-2xl font-semibold tracking-tight">
          Saraf
        </CardTitle>
        <CardDescription>Offline Sarafi Management System</CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="space-y-2">
          <FieldGroup>
            <Field data-invalid={errors.username ? true : undefined}>
              <FieldLabel htmlFor="username">Username</FieldLabel>
              <Input
                id="username"
                name="username"
                autoComplete="username"
                placeholder="Enter username"
                value={username}
                disabled={isLoading}
                aria-invalid={errors.username ? true : undefined}
                className="h-11"
                onChange={(event) => {
                  setUsername(event.target.value);
                  if (errors.username || errors.form) {
                    setErrors((current) => ({
                      ...current,
                      username: undefined,
                      form: undefined,
                    }));
                  }
                }}
              />
              {errors.username ? (
                <FieldError>{errors.username}</FieldError>
              ) : null}
            </Field>

            <Field data-invalid={errors.password ? true : undefined}>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter password"
                  value={password}
                  disabled={isLoading}
                  aria-invalid={errors.password ? true : undefined}
                  className="h-11 pr-11"
                  onChange={(event) => {
                    setPassword(event.target.value);
                    if (errors.password || errors.form) {
                      setErrors((current) => ({
                        ...current,
                        password: undefined,
                        form: undefined,
                      }));
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={isLoading}
                  className="text-muted-foreground absolute top-1/2 right-1 size-9 -translate-y-1/2"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((current) => !current)}
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </Button>
              </div>
              {errors.password ? (
                <FieldError>{errors.password}</FieldError>
              ) : null}
            </Field>
          </FieldGroup>

          {errors.form ? (
            <p className="text-destructive text-sm" role="alert">
              {errors.form}
            </p>
          ) : null}

          <Button
            type="submit"
            size="lg"
            disabled={isLoading}
            className={cn("h-11 w-full rounded-xl")}
          >
            {isLoading ? (
              <>
                <Loader2 className="animate-spin" />
                Signing in...
              </>
            ) : (
              "Sign in"
            )}
          </Button>

          <Typography variant="caption" className="block text-center">
            Local offline access only
          </Typography>
        </form>
      </CardContent>
    </Card>
  );
}
