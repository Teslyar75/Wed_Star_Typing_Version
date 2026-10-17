/** Общая оболочка окон настроек: подсказка + прокручиваемый контент (ЭКРАН — в крошках App). */
import type { ReactNode } from "react";

type Props = {
  className?: string;
  navGroup?: string;
  hint?: string;
  ariaLabel?: string;
  children: ReactNode;
};

export default function ZoneSettingsShell({
  className = "",
  navGroup,
  hint,
  ariaLabel,
  children,
}: Props) {
  return (
    <section
      className={`zone-settings ${className}`.trim()}
      data-nav-group={navGroup || "zone-settings"}
    >
      {hint ? (
        <div className="zone-settings-bar">
          <p className="muted zone-settings-hint">{hint}</p>
        </div>
      ) : null}
      <div className="zone-settings-scroll" tabIndex={0} role="region" aria-label={ariaLabel}>
        {children}
      </div>
    </section>
  );
}
