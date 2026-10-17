import { useEffect, useState } from "react";
import { t } from "../i18n";
import { checkForUpdate, type UpdateInfo } from "./checkUpdate";

const DISMISS_KEY = "st_upd_banner_dismiss";

type Props = {
  onOpenSettings: () => void;
};

export default function UpdateBanner({ onOpenSettings }: Props) {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [hidden, setHidden] = useState(() => sessionStorage.getItem(DISMISS_KEY) === "1");

  useEffect(() => {
    let live = true;
    void checkForUpdate()
      .then((u) => {
        if (live && u.available) setInfo(u);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  if (hidden || !info?.available) return null;

  return (
    <div className="upd-banner" role="status">
      <span>{t("upd_banner").replace("{0}", info.latest)}</span>
      <button
        type="button"
        className="hud-btn amber"
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
