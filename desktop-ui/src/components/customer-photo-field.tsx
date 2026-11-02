import { useEffect, useRef, useState } from "react";

import { useT } from "@desktop/i18n";
import { Modal } from "@desktop/ui/modal";

const MAX_EDGE = 480;

function photoFromSource(
  source: CanvasImageSource,
  width: number,
  height: number,
): string {
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height, 1));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(source, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.82);
}

async function photoFromFile(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    return photoFromSource(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

export function CustomerPhotoField({
  value,
  disabled,
  onChange,
}: {
  value: string | null;
  disabled?: boolean;
  onChange: (photo: string | null) => void;
}) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  useEffect(() => () => stopCamera(), []);

  useEffect(() => {
    if (!cameraOpen) return;
    let cancelled = false;
    void navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => undefined);
        }
      })
      .catch(() => {
        if (!cancelled) setError(t.customers.photoCameraError);
        setCameraOpen(false);
      });
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [cameraOpen, t.customers.photoCameraError]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      if (!file.type.startsWith("image/")) {
        setError(t.customers.photoReadError);
        return;
      }
      onChange(await photoFromFile(file));
    } catch {
      setError(t.customers.photoReadError);
    }
  }

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setError(null);
    try {
      onChange(photoFromSource(video, video.videoWidth, video.videoHeight));
      setCameraOpen(false);
    } catch {
      setError(t.customers.photoReadError);
    }
  }

  return (
    <div className="customer-photo-field">
      <span className="muted">{t.customers.photoOptional}</span>
      <div className="customer-photo-field-row">
        <div className="customer-photo-slot">
          {value ? (
            <img src={value} alt={t.customers.photo} />
          ) : (
            <span className="muted">{t.customers.photo}</span>
          )}
        </div>
        <div className="customer-photo-actions">
          <button
            type="button"
            className="btn"
            disabled={disabled}
            onClick={() => {
              setError(null);
              setCameraOpen(true);
            }}
          >
            {t.customers.takePhoto}
          </button>
          <button
            type="button"
            className="btn"
            disabled={disabled}
            onClick={() => fileRef.current?.click()}
          >
            {t.customers.choosePhoto}
          </button>
          {value ? (
            <button
              type="button"
              className="btn"
              disabled={disabled}
              onClick={() => onChange(null)}
            >
              {t.customers.removePhoto}
            </button>
          ) : null}
          {error ? <p className="error" style={{ margin: 0 }}>{error}</p> : null}
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          void onFile(file);
        }}
      />
      {cameraOpen ? (
        <Modal title={t.customers.takePhoto} onClose={() => setCameraOpen(false)}>
          <div className="stack">
            <video ref={videoRef} className="customer-photo-video" autoPlay playsInline muted />
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setCameraOpen(false)}>
                {t.common.cancel}
              </button>
              <button type="button" className="btn primary" onClick={capture}>
                {t.customers.capturePhoto}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
