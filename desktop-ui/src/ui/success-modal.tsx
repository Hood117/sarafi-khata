import { Modal } from "@desktop/ui/modal";

export function SuccessModal({
  title = "Success",
  message,
  onClose,
  primaryLabel = "OK",
}: {
  title?: string;
  message: string;
  onClose: () => void;
  primaryLabel?: string;
}) {
  return (
    <Modal title={title} size="md" onClose={onClose}>
      <p style={{ margin: 0, fontSize: "1.05rem" }}>{message}</p>
      <div className="modal-actions">
        <button type="button" className="btn primary" onClick={onClose}>
          {primaryLabel}
        </button>
      </div>
    </Modal>
  );
}
