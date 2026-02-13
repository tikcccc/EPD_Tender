import { useEffect, useId, useMemo, useRef, useState } from "react";

type TruncatedTooltipProps = {
  text: string;
  visibleText?: string;
  wrapperClassName?: string;
  triggerClassName?: string;
  tooltipClassName?: string;
  forceTooltip?: boolean;
  focusable?: boolean;
  side?: "top" | "bottom";
};

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function isOverflowed(element: HTMLElement): boolean {
  const horizontal = element.scrollWidth - element.clientWidth > 1;
  const vertical = element.scrollHeight - element.clientHeight > 1;
  return horizontal || vertical;
}

export function TruncatedTooltip({
  text,
  visibleText,
  wrapperClassName,
  triggerClassName,
  tooltipClassName,
  forceTooltip = false,
  focusable = false,
  side = "bottom",
}: TruncatedTooltipProps) {
  const normalized = useMemo(() => normalizeText(text), [text]);
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const tooltipId = useId();
  const [overflowed, setOverflowed] = useState(false);
  const [open, setOpen] = useState(false);

  const renderText = visibleText ?? normalized;
  const shouldShowTooltip = normalized.length > 0 && (forceTooltip || overflowed);

  useEffect(() => {
    const node = triggerRef.current;
    if (!node) {
      return;
    }

    const updateOverflow = (): void => {
      setOverflowed(isOverflowed(node));
    };

    const frame = window.requestAnimationFrame(updateOverflow);

    const observer = new ResizeObserver(() => {
      updateOverflow();
    });

    observer.observe(node);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [renderText, triggerClassName]);

  const wrapperClasses = [
    "c-trunc-tip",
    wrapperClassName ?? "",
    focusable ? "is-focusable" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const overlayClasses = [
    "c-trunc-tip-overlay",
    side === "top" ? "is-top" : "is-bottom",
    open && shouldShowTooltip ? "is-open" : "",
    tooltipClassName ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={wrapperClasses}
      onMouseEnter={() => {
        if (shouldShowTooltip) {
          setOpen(true);
        }
      }}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => {
        if (focusable && shouldShowTooltip) {
          setOpen(true);
        }
      }}
      onBlur={() => {
        if (focusable) {
          setOpen(false);
        }
      }}
      onKeyDown={(event) => {
        if (focusable && event.key === "Escape") {
          setOpen(false);
          (event.currentTarget as HTMLSpanElement).blur();
        }
      }}
    >
      <span
        ref={triggerRef}
        className={triggerClassName}
        tabIndex={focusable && shouldShowTooltip ? 0 : undefined}
        aria-describedby={open && shouldShowTooltip ? tooltipId : undefined}
      >
        {renderText}
      </span>
      {shouldShowTooltip ? (
        <span id={tooltipId} role="tooltip" className={overlayClasses}>
          {normalized}
        </span>
      ) : null}
    </span>
  );
}
