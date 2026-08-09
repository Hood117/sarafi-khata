"use client";

import { Plus } from "lucide-react";
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
import { createUserAction } from "@/features/users/actions/user-actions";
import {
  emptyUserFormValues,
  UserForm,
  type UserFormValues,
} from "@/features/users/components/user-form";
import { useT } from "@/lib/i18n";

type AddUserDialogProps = {
  onSuccess?: (message: string) => void;
};

export function AddUserDialog({ onSuccess }: AddUserDialogProps) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setFormKey((current) => current + 1);
    }
  }

  async function handleSubmit(values: UserFormValues) {
    const result = await createUserAction({
      fullName: values.fullName,
      username: values.username,
      password: values.password,
      confirmPassword: values.confirmPassword,
      role: values.role,
      isActive: values.isActive,
      allowedScreens: values.allowedScreens,
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
      <DialogTrigger render={<Button />}>
        <Plus data-icon="inline-start" />
        Add User
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t.users.add}</DialogTitle>
          <DialogDescription>
            Create a local account and choose which screens they can open.
          </DialogDescription>
        </DialogHeader>

        <UserForm
          key={formKey}
          mode="create"
          initialValues={emptyUserFormValues}
          submitLabel={t.users.saveUser}
          errorFallbackMessage="Unable to add user. Please try again."
          onCancel={() => handleOpenChange(false)}
          onSubmit={handleSubmit}
          onSuccess={onSuccess}
        />
      </DialogContent>
    </Dialog>
  );
}
