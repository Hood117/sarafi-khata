"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { resetUserPasswordAction } from "@/features/users/actions/user-actions";
import {
  ResetPasswordForm,
  type ResetPasswordFormValues,
} from "@/features/users/components/reset-password-form";

type ResetPasswordDialogProps = {
  userId: string;
  username: string;
  onSuccess?: (message: string) => void;
};

export function ResetPasswordDialog({
  userId,
  username,
  onSuccess,
}: ResetPasswordDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setFormKey((current) => current + 1);
    }
  }

  async function handleSubmit(values: ResetPasswordFormValues) {
    const result = await resetUserPasswordAction({
      id: userId,
      password: values.password,
      confirmPassword: values.confirmPassword,
    });

    if (!result.ok) {
      return {
        ok: false as const,
        message: result.message,
        fieldErrors: result.fieldErrors,
      };
    }

    router.refresh();
    window.setTimeout(() => {
      handleOpenChange(false);
    }, 700);

    return {
      ok: true as const,
      message: result.message,
    };
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="ghost" size="sm" />}>
        Reset Password
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            Set a new password for <strong>{username}</strong>. Their active
            sessions will be signed out.
          </DialogDescription>
        </DialogHeader>

        <ResetPasswordForm
          key={formKey}
          errorFallbackMessage="Unable to reset password. Please try again."
          onCancel={() => handleOpenChange(false)}
          onSubmit={handleSubmit}
          onSuccess={onSuccess}
        />
      </DialogContent>
    </Dialog>
  );
}
