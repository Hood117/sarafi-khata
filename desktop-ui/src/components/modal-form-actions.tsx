import type { ReactNode } from "react";

import {
  IconCancel,
  IconPrevious,
  IconSave,
  IconSaveAndNew,
} from "@desktop/icons";
import { ModalErrorBanner } from "@desktop/ui/modal-error-banner";

type Props = {
  busy?: boolean;
  error?: string | null;
  saveLabel: string;
  saveAndNewLabel: string;
  cancelLabel: string;
  previousLabel?: string;
  onSave: () => void;
  onSaveAndNew: () => void;
  onCancel: () => void;
  onPrevious?: () => void;
  /** Extra actions rendered before Cancel (e.g. WhatsApp). */
  extra?: ReactNode;
};

/**
 * Shared footer actions for desk movement modals — icons + distinct tones.
 * Optional `error` renders above the buttons so validation stays visible.
 * Use `inline` to keep actions in normal document flow (no sticky bar).
 */
export function ModalFormActions({
  busy = false,
  error = null,
  saveLabel,
  saveAndNewLabel,
  cancelLabel,
  previousLabel,
  onSave,
  onSaveAndNew,
  onCancel,
  onPrevious,
  extra,
  inline = false,
}: Props & { inline?: boolean }) {
  return (
    <div className={inline ? "modal-form-footer is-inline" : "modal-form-footer"}>
      <ModalErrorBanner message={error} />
      <div className="modal-actions">
        {onPrevious && previousLabel ? (
          <button
            type="button"
            className="btn btn-action btn-action--previous modal-actions-previous"
            data-desk-action="undo"
            disabled={busy}
            onClick={onPrevious}
          >
            <IconPrevious />
            <span>{previousLabel}</span>
          </button>
        ) : null}

        <button
          type="button"
          className="btn btn-action btn-action--save"
          data-desk-action="save"
          disabled={busy}
          onClick={onSave}
        >
          <IconSave />
          <span>{saveLabel}</span>
        </button>

        <button
          type="button"
          className="btn btn-action btn-action--new"
          disabled={busy}
          onClick={onSaveAndNew}
        >
          <IconSaveAndNew />
          <span>{saveAndNewLabel}</span>
        </button>

        {extra}

        <button
          type="button"
          className="btn btn-action btn-action--cancel"
          disabled={busy}
          onClick={onCancel}
        >
          <IconCancel />
          <span>{cancelLabel}</span>
        </button>
      </div>
    </div>
  );
}
