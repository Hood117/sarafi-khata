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
  getCustomerForEditAction,
  updateCustomerAction,
} from "@/features/customers/actions/customer-actions";
import {
  CustomerForm,
  emptyCustomerFormValues,
  type CustomerFormValues,
} from "@/features/customers/components/customer-form";

type EditCustomerDialogProps = {
  customerId: string;
  onSuccess?: (message: string) => void;
  triggerVariant?: "default" | "outline" | "ghost" | "secondary";
  triggerSize?: "default" | "sm" | "lg";
  triggerLabel?: string;
};

export function EditCustomerDialog({
  customerId,
  onSuccess,
  triggerVariant = "ghost",
  triggerSize = "sm",
  triggerLabel = "Edit",
}: EditCustomerDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [initialValues, setInitialValues] = useState<CustomerFormValues>(
    emptyCustomerFormValues,
  );
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    async function loadCustomer() {
      setIsLoading(true);
      setLoadError(null);

      try {
        const result = await getCustomerForEditAction(customerId);

        if (cancelled) {
          return;
        }

        if (!result.ok) {
          setLoadError(result.message);
          setInitialValues(emptyCustomerFormValues);
          return;
        }

        setInitialValues({
          fullName: result.customer.fullName,
          phone: result.customer.phone,
          address: result.customer.address,
          nationalId: result.customer.nationalId,
          notes: result.customer.notes,
        });
        setFormKey((current) => current + 1);
      } catch {
        if (!cancelled) {
          setLoadError("Unable to load customer. Please try again.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadCustomer();

    return () => {
      cancelled = true;
    };
  }, [customerId, open]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setLoadError(null);
      setIsLoading(false);
      setInitialValues(emptyCustomerFormValues);
      setFormKey((current) => current + 1);
    }
  }

  async function handleSubmit(values: CustomerFormValues) {
    const result = await updateCustomerAction({
      id: customerId,
      ...values,
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
      <DialogTrigger
        render={<Button variant={triggerVariant} size={triggerSize} />}
      >
        {triggerLabel}
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Customer</DialogTitle>
          <DialogDescription>
            Update customer details. Creation date is preserved.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="text-muted-foreground flex items-center justify-center gap-2 py-10 text-sm">
            <Loader2 className="size-4 animate-spin" />
            Loading customer...
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
          <CustomerForm
            key={formKey}
            initialValues={initialValues}
            submitLabel="Save Changes"
            errorFallbackMessage="Unable to update customer. Please try again."
            onCancel={() => handleOpenChange(false)}
            onSubmit={handleSubmit}
            onSuccess={onSuccess}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
