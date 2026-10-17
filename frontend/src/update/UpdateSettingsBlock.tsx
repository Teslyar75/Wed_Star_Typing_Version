import { useCallback, useEffect, useState, type ReactNode } from "react";
import { t } from "../i18n";
import { appVersion, checkForUpdate, type UpdateInfo } from "./checkUpdate";

type RowProps = { title: string; desc: string; children: ReactNode };

export default function UpdateSettingsBlock({ Row }: { Row: (p: RowProps) => ReactNode }) {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ver = appVersion();

  const run = useCallback(async (force = false) => {
    setBusy(true);
    setErr("");
    try {
      const next = await checkForUpdate({ force });
      setInfo(next);
    } catch {
      setErr(t("upd_fail"));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void run(false);
  }, [run]);

  const status = (() => {
    if (busy) return t("upd_checking");
    if (err) return err;
    if (!info) return "…";
    if (!info.tag) return t("upd_none");
    if (info.available) return t("upd_available").replace("{0}", info.latest).replace("{1}", info.current);
    return t("upd_current").replace("{0}", info.current);
  })();

  return (
    <>
      <Row title={t("upd_title")} desc={t("upd_desc").replace("{0}", ver)}>
        <span className={`muted ${info?.available ? "upd-status-new" : ""}`}>{status}</span>
        <button type="button" className="hud-btn" disabled={busy} onClick={() => void run(true)}>
          {t("upd_check")}
        </button>
        <a className="hud-btn" href={info?.htmlUrl || "https://github.com/Teslyar75/Wed_Star_Typing_Version/releases"} target="_blank" rel="noreferrer">
          {t("upd_open")}
        </a>
      </Row>
      {info?.bodyPlain ? <p className="muted settings-upd-notes">{info.bodyPlain}</p> : null}
      <p className="muted settings-upd-hint">{t("upd_rebuild")}</p>
    </>
  );
}
