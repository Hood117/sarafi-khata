"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  getUserForEditAction,
  updateUserAction,
} from "@/features/users/actions/user-actions";
import {
  emptyUserFormValues,
  UserForm,
  type UserFormValues,
} from "@/features/users/components/user-form";

type EditUserDialogProps = {
  userId: string;
  isCurrentUser?: boolean;
  onSuccess?: (message: string) => void;
};

export function EditUserDialog({
  userId,
  isCurrentUser = false,
  onSuccess,
}: EditUserDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [initialValues, setInitialValues] =
    useState<UserFormValues>(emptyUserFormValues);
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    async function loadUser() {
      setIsLoading(true);
      setLoadError(null);

      try {
        const result = await getUserForEditAction(userId);

        if (cancelled) {
          return;
        }

        if (!result.ok) {
          setLoadError(result.message);
          setInitialValues(emptyUserFormValues);
          return;
        }

        setInitialValues({
          fullName: result.user.fullName,
          username: result.user.username,
          password: "",
          confirmPassword: "",
          role: result.user.role,
          isActive: result.user.isActive,
        });
        setFormKey((current) => current + 1);
      } catch {
        if (!cancelled) {
          setLoadError("Unable to load user. Please try again.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadUser();

    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setLoadError(null);
      setIsLoading(false);
      setInitialValues(emptyUserFormValues);
      setFormKey((current) => current + 1);
    }
  }

  async function handleSubmit(values: UserFormValues) {
    const result = await updateUserAction({
      id: userId,
      fullName: values.fullName,
      role: values.role,
      isActive: values.isActive,
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
        Edit
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
          <DialogDescription>
            Update name, role, and status. Username cannot be changed.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="text-muted-foreground flex items-center justify-center gap-2 py-10 text-sm">
            <Loader2 className="size-4 animate-spin" />
            Loading user...
          </div>
        ) : loadError ? (
          <div className="space-y-4">
            <p className="text-destructive text-sm" role="alert">
              {loadError}
            </p>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                Close
              </Button>
            </div>
          </div>
        ) : (
          <UserForm
            key={formKey}
            mode="edit"
            initialValues={initialValues}
            usernameReadOnly
            roleDisabled={isCurrentUser}
            statusDisabled={isCurrentUser}
            submitLabel="Save Changes"
            errorFallbackMessage="Unable to update user. Please try again."
            onCancel={() => handleOpenChange(false)}
            onSubmit={handleSubmit}
            onSuccess={onSuccess}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
