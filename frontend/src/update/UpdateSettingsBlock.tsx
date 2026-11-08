import { useCallback, useEffect, useState, type ReactNode } from "react";
import { t } from "../i18n";
import { appVersion, applyHostUpdate, checkForUpdate, hostUpdateStatus, type HostUpdateStatus, type UpdateInfo } from "./checkUpdate";

type RowProps = { title: string; desc: string; children: ReactNode };

export default function UpdateSettingsBlock({ Row }: { Row: (p: RowProps) => ReactNode }) {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [host, setHost] = useState<HostUpdateStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [err, setErr] = useState("");
  const [applyMsg, setApplyMsg] = useState("");
  const ver = appVersion();

  const run = useCallback(async (force = false) => {
    setBusy(true);
    setErr("");
    try {
      const [next, st] = await Promise.all([checkForUpdate({ force }), hostUpdateStatus()]);
      setInfo(next);
      setHost(st);
    } catch {
      setErr(t("upd_fail"));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void run(false);
  }, [run]);

  const apply = async () => {
    setApplying(true);
    setApplyMsg("");
    setErr("");
    try {
      const res = await applyHostUpdate();
      if (res.ok && res.updated) {
        setApplyMsg(t("upd_applied"));
        window.setTimeout(() => window.location.reload(), 2500);
      } else if (res.ok) {
        setApplyMsg(t("upd_current").replace("{0}", ver));
      } else {
        setErr(t("upd_apply_fail"));
      }
    } catch {
      setErr(t("upd_apply_fail"));
    } finally {
      setApplying(false);
      void run(true);
    }
  };

  const status = (() => {
    if (busy) return t("upd_checking");
    if (err) return err;
    if (host?.can_apply && (host.behind || 0) > 0) {
      return t("upd_git_behind").replace("{0}", String(host.behind));
    }
    if (!info) return "…";
    if (!info.tag) return t("upd_none");
    if (info.available) return t("upd_available").replace("{0}", info.latest).replace("{1}", info.current);
    return t("upd_current").replace("{0}", info.current);
  })();

  const canApply = Boolean(host?.can_apply) || Boolean(info?.available);

  return (
    <>
      <Row title={t("upd_title")} desc={t("upd_desc").replace("{0}", ver)}>
        <span className={`muted ${info?.available || host?.can_apply ? "upd-status-new" : ""}`}>{status}</span>
        <button type="button" className="hud-btn" disabled={busy || applying} onClick={() => void run(true)}>
          {t("upd_check")}
        </button>
        <button type="button" className="hud-btn amber" disabled={applying || !canApply} onClick={() => void apply()}>
          {applying ? t("upd_applying") : t("upd_apply")}
        </button>
        <a className="hud-btn" href={info?.htmlUrl || "https://github.com/Teslyar75/Wed_Star_Typing_Version/releases"} target="_blank" rel="noreferrer">
          {t("upd_open")}
        </a>
      </Row>
      {applyMsg ? <p className="muted settings-upd-notes">{applyMsg}</p> : null}
      {info?.bodyPlain ? <p className="muted settings-upd-notes">{info.bodyPlain}</p> : null}
      <p className="muted settings-upd-hint">{t("upd_rebuild")}</p>
    </>
  );
}
