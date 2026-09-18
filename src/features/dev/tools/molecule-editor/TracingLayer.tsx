"use client";

/**
 * Session-only image tracing layer for the molecule canvas (the editor's
 * "drop a picture in and draw through it" feature).
 *
 * The OpenChemLib canvas paints an opaque white background internally, so the
 * reference image sits ON TOP of the canvas at reduced opacity instead of
 * behind it. While "Adjust image" is on, the overlay captures the pointer for
 * dragging; switched off, it is `pointer-events: none`, so every click and
 * drag falls straight through to the drawing tools underneath.
 *
 * Nothing here is uploaded or persisted: the image lives in an object URL for
 * this browser session only and is revoked on replace, clear, and unmount.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/common/Icon";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui";
import { EditorCheckbox } from "@/features/dev/components";

export interface TracingLayerState {
  imageUrl: string | null;
  opacity: number;
  scale: number;
  offset: { x: number; y: number };
  adjusting: boolean;
  setOpacity: (value: number) => void;
  setScale: (value: number) => void;
  setOffset: (value: { x: number; y: number }) => void;
  setAdjusting: (value: boolean) => void;
  loadFile: (file: File) => void;
  clear: () => void;
}

export function useTracingLayer(): TracingLayerState {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [opacity, setOpacity] = useState(0.4);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [adjusting, setAdjusting] = useState(false);

  const loadFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    setImageUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
    setOpacity(0.4);
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setAdjusting(true);
  }, []);

  const clear = useCallback(() => {
    setImageUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setAdjusting(false);
  }, []);

  // Revoke the object URL when the editor unmounts.
  const imageUrlRef = useRef<string | null>(null);
  imageUrlRef.current = imageUrl;
  useEffect(
    () => () => {
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    },
    [],
  );

  return {
    imageUrl,
    opacity,
    scale,
    offset,
    adjusting,
    setOpacity,
    setScale,
    setOffset,
    setAdjusting,
    loadFile,
    clear,
  };
}

/** The see-through image over the canvas. Renders nothing without an image. */
export function TracingOverlay({
  layer,
  className,
}: {
  layer: TracingLayerState;
  className?: string;
}) {
  const dragState = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null);

  if (!layer.imageUrl) return null;

  return (
    <div
      data-testid="tracing-overlay"
      className={cn(
        "grid place-items-center overflow-hidden",
        layer.adjusting ? "cursor-grab touch-none" : "pointer-events-none",
        className,
      )}
      onPointerDown={(event) => {
        if (!layer.adjusting) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        dragState.current = {
          pointerId: event.pointerId,
          lastX: event.clientX,
          lastY: event.clientY,
        };
      }}
      onPointerMove={(event) => {
        const drag = dragState.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        layer.setOffset({
          x: layer.offset.x + event.clientX - drag.lastX,
          y: layer.offset.y + event.clientY - drag.lastY,
        });
        drag.lastX = event.clientX;
        drag.lastY = event.clientY;
      }}
      onPointerUp={(event) => {
        if (dragState.current?.pointerId === event.pointerId) dragState.current = null;
      }}
      onPointerCancel={() => {
        dragState.current = null;
      }}
    >
      {/* plain <img>: the source is a session-local object URL, never a hosted asset */}
      <img
        src={layer.imageUrl}
        alt="Tracing reference"
        draggable={false}
        className="max-h-full max-w-full select-none"
        style={{
          opacity: layer.opacity,
          transform: `translate(${layer.offset.x}px, ${layer.offset.y}px) scale(${layer.scale})`,
        }}
      />
    </div>
  );
}

/** The control cluster for the tracing layer (file pick, fade, size, move, clear). */
export function TracingControls({
  layer,
  disabled,
}: {
  layer: TracingLayerState;
  disabled?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="space-y-2">
      <p className="theme-text-faint text-xs font-medium uppercase tracking-wide">
        Tracing image
      </p>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        aria-label="Choose a tracing image"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) layer.loadFile(file);
          event.target.value = "";
        }}
      />
      {!layer.imageUrl ? (
        <>
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            title="Show a see-through reference image over the canvas so you can draw on top of it"
          >
            <Icon icon="lucide:image-plus" size={15} />
            Trace an image…
          </Button>
          <p className="theme-text-faint text-xs">
            Or drag an image onto the canvas. It stays on this screen only and is never saved.
          </p>
        </>
      ) : (
        <>
          <label className="theme-text-muted flex items-center gap-2 text-xs">
            <span className="w-14 shrink-0">Fade</span>
            <input
              type="range"
              min={0.1}
              max={0.9}
              step={0.05}
              value={layer.opacity}
              onChange={(event) => layer.setOpacity(Number(event.target.value))}
              className="w-full"
              aria-label="Tracing image transparency"
            />
          </label>
          <label className="theme-text-muted flex items-center gap-2 text-xs">
            <span className="w-14 shrink-0">Size</span>
            <input
              type="range"
              min={0.2}
              max={3}
              step={0.05}
              value={layer.scale}
              onChange={(event) => layer.setScale(Number(event.target.value))}
              className="w-full"
              aria-label="Tracing image size"
            />
          </label>
          <EditorCheckbox
            checked={layer.adjusting}
            onChange={(event) => layer.setAdjusting(event.target.checked)}
            label="Adjust image"
            description="On: drag the image to move it. Off: draw straight through it."
          />
          <Button variant="outline" size="sm" onClick={layer.clear}>
            <Icon icon="lucide:image-off" size={14} />
            Remove image
          </Button>
        </>
      )}
    </div>
  );
}
