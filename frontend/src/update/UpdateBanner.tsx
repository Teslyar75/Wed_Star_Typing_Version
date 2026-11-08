import { useEffect, useState } from "react";
import { t } from "../i18n";
import { applyHostUpdate, checkForUpdate, hostUpdateStatus, type UpdateInfo } from "./checkUpdate";

const DISMISS_KEY = "st_upd_banner_dismiss";

type Props = {
  onOpenSettings: () => void;
};

export default function UpdateBanner({ onOpenSettings }: Props) {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [behind, setBehind] = useState(0);
  const [hidden, setHidden] = useState(() => sessionStorage.getItem(DISMISS_KEY) === "1");
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    let live = true;
    void Promise.all([checkForUpdate(), hostUpdateStatus()])
      .then(([u, st]) => {
        if (!live) return;
        if (u.available) setInfo(u);
        if (st.can_apply && (st.behind || 0) > 0) setBehind(st.behind || 0);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const visible = !hidden && (Boolean(info?.available) || behind > 0);
  if (!visible) return null;

  const label = info?.available
    ? t("upd_banner").replace("{0}", info.latest)
    : t("upd_git_behind").replace("{0}", String(behind));

  return (
    <div className="upd-banner" role="status">
      <span>{label}</span>
      <button
        type="button"
        className="hud-btn amber"
        disabled={applying}
        onClick={() => {
          setApplying(true);
          void applyHostUpdate()
            .then((res) => {
              if (res.ok && res.updated) window.location.reload();
              else onOpenSettings();
            })
            .catch(() => onOpenSettings())
            .finally(() => setApplying(false));
        }}
      >
        {applying ? t("upd_applying") : t("upd_apply")}
      </button>
      <button
        type="button"
        className="hud-btn"
        onClick={() => {
          onOpenSettings();
        }}
      >
        {t("upd_banner_open")}
      </button>
      <button
        type="button"
        className="hud-btn"
        onClick={() => {
          sessionStorage.setItem(DISMISS_KEY, "1");
          setHidden(true);
        }}
      >
        {t("upd_banner_dismiss")}
      </button>
    </div>
  );
}
