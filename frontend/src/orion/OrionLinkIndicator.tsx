import { useCallback, useState, type KeyboardEvent, type MouseEvent } from "react";
import { ot } from "./orionI18n";
import type { LinkView } from "./orionLink";

type Props = {
  view: LinkView;
  compact?: boolean;
  onRecheck?: () => void | Promise<void>;
  testId?: string;
};

/** HUD-индикатор связи: зелёный / жёлтый / красный / серый. */
export default function OrionLinkIndicator({ view, compact, onRecheck, testId = "orion-link" }: Props) {
  const [hint, setHint] = useState("");
  const [spin, setSpin] = useState(false);

  const run = useCallback(async () => {
    setSpin(true);
    // На красном/сером — подсказка «как починить»; иначе короткая подпись статуса.
    setHint(ot(view.tone === "down" || view.tone === "off" ? view.tipKey : view.labelKey));
    try {
      await onRecheck?.();
    } finally {
      setSpin(false);
    }
  }, [view, onRecheck]);

  const onClick = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    void run();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.stopPropagation();
      e.preventDefault();
      void run();
    }
  };

  const title = hint || ot(view.labelKey);
  const cls = "hud-btn orion-link" + (compact ? " compact" : "") + (spin ? " busy" : "");
  const body = (
    <>
      <span className="orion-link-dot" aria-hidden />
      {!compact ? <span className="orion-link-lab">{ot(view.labelKey)}</span> : null}
    </>
  );

  // Внутри списка пассажиров — span, чтобы не было button-in-button.
  if (compact) {
    return (
      <span
        role="button"
        tabIndex={0}
        className={cls}
        data-testid={testId}
        data-tone={view.tone}
        data-reason={view.reason || ""}
        title={title}
        aria-label={title}
        onClick={onClick}
        onKeyDown={onKey}
      >
        {body}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={cls}
      data-testid={testId}
      data-tone={view.tone}
      data-reason={view.reason || ""}
      title={title}
      aria-label={title}
      onClick={onClick}
    >
      {body}
    </button>
  );
}
