import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type LiveSettings, type SettingLimits, type SmsStatus } from "../lib/api";
import { useAuth } from "../lib/authContext";

type SliderKey = "confidenceThreshold" | "weaponConfidenceThreshold" | "crowdConfidence" | "cooldownSeconds" | "crowdThreshold";

interface SliderDef {
  key: SliderKey;
  label: string;
  hint: string;
  step: number;
  format: (v: number) => string;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

const SLIDERS: SliderDef[] = [
  { key: "confidenceThreshold", label: "person confidence", hint: "zone alerts. 0.4 to 0.5 is balanced; above 0.7 misses many people", step: 0.05, format: pct },
  { key: "crowdConfidence", label: "crowd counting confidence", hint: "for counting. 0.3 to 0.4 counts best; lower adds false people", step: 0.05, format: pct },
  { key: "weaponConfidenceThreshold", label: "weapon confidence", hint: "higher = fewer false alarms but more missed weapons", step: 0.05, format: pct },
  { key: "cooldownSeconds", label: "alert cooldown", hint: "gap between alerts", step: 1, format: (v) => `${v}s` },
  { key: "crowdThreshold", label: "crowd alert at", hint: "people in view", step: 1, format: (v) => `${v}` },
];

export default function SettingsPanel() {
  const { token, logout } = useAuth();
  const canEdit = token !== null;
  const [settings, setSettings] = useState<LiveSettings | null>(null);
  const [limits, setLimits] = useState<SettingLimits | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<Partial<Record<keyof LiveSettings, number>>>({});

  useEffect(() => {
    let cancelled = false;
    const pending = timers.current;
    api
      .settings()
      .then((r) => {
        if (cancelled) return;
        setSettings(r.settings);
        setLimits(r.limits);
      })
      .catch(() => {
        if (!cancelled) setError("could not load settings");
      });
    return () => {
      cancelled = true;
      Object.values(pending).forEach((t) => t && clearTimeout(t));
    };
  }, []);

  // Update the slider immediately, then save to the server shortly after the user stops moving it.
  const change = useCallback(
    (key: keyof LiveSettings, value: number) => {
      setSettings((s) => (s ? { ...s, [key]: value } : s));
      setStatus(null);
      setError(null);
      const existing = timers.current[key];
      if (existing) clearTimeout(existing);
      timers.current[key] = window.setTimeout(async () => {
        try {
          const r = await api.setSettings({ [key]: value });
          setSettings(r.settings);
          setStatus("saved");
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) {
            logout();
          } else {
            setError("could not save - is the backend running?");
            api.settings().then((r) => setSettings(r.settings)).catch(() => {});
          }
        }
      }, 350);
    },
    [logout],
  );

  if (!settings || !limits) {
    return (
      <div className="mt-6 mx-auto border border-[#132227] p-4 text-xs" style={{ width: 640 }}>
        {error ?? "loading settings…"}
      </div>
    );
  }

  return (
    <div className="mt-6 mx-auto border border-[#132227] p-4" style={{ width: 640 }}>
      <div className="flex items-center justify-between mb-3 text-xs">
        <span className="tracking-wide text-[#4de8f5]">detection settings</span>
        <span className={error ? "text-[#ff6b5e]" : "text-[#4a5a63]"}>
          {error ?? status ?? (canEdit ? "changes apply on the next frame" : "log in to change these")}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        {SLIDERS.map((s) => {
          const lim = limits[s.key] as { min: number; max: number };
          return (
            <label key={s.key} className="block text-xs">
              <div className="flex justify-between mb-1">
                <span className="text-[#93a2a8]">{s.label}</span>
                <span className="text-[#f5f8f9]">{s.format(settings[s.key])}</span>
              </div>
              <input
                type="range"
                min={lim.min}
                max={lim.max}
                step={s.step}
                value={settings[s.key]}
                disabled={!canEdit}
                onChange={(e) => change(s.key, Number(e.target.value))}
                className="w-full accent-[#4de8f5] disabled:opacity-40"
              />
              <div className="text-[10px] text-[#4a5a63]">{s.hint}</div>
            </label>
          );
        })}
        <label className="block text-xs">
          <div className="flex justify-between mb-1">
            <span className="text-[#93a2a8]">detection size</span>
            <span className="text-[#f5f8f9]">{settings.detectionSize}px</span>
          </div>
          <select
            value={settings.detectionSize}
            disabled={!canEdit}
            onChange={(e) => change("detectionSize", Number(e.target.value))}
            className="w-full bg-[#0a0f12] border border-[#2a3a40] text-[#93a2a8] px-2 py-1.5 rounded disabled:opacity-40"
          >
            {(limits.detectionSize as { choices: number[] }).choices.map((c) => (
              <option key={c} value={c}>
                {c}px
              </option>
            ))}
          </select>
          <div className="text-[10px] text-[#4a5a63]">bigger finds smaller or farther people, but is slower</div>
        </label>
        <label className="flex items-start gap-2 text-xs col-span-2">
          <input
            type="checkbox"
            checked={settings.denseCounting === 1}
            disabled={!canEdit}
            onChange={(e) => change("denseCounting", e.target.checked ? 1 : 0)}
            className="mt-0.5 accent-[#4de8f5] disabled:opacity-40"
          />
          <span>
            <span className="text-[#93a2a8]">dense crowd counting</span>
            <span className="block text-[10px] text-[#4a5a63]">
              when several people are in view, scan the frame in tiles to find more of them (finds roughly twice as many in packed scenes, slower on those frames)
            </span>
          </span>
        </label>
      </div>
      <SmsRow />
    </div>
  );
}

// Shows whether SMS alerts (textbee.dev) are set up and lets an admin send a test message.
function SmsRow() {
  const { token, logout } = useAuth();
  const [status, setStatus] = useState<SmsStatus | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    api.smsStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    if (token) refresh();
  }, [token, refresh]);

  const sendTest = async () => {
    setBusy(true);
    setNote(null);
    try {
      const r = await api.smsTest();
      setNote(`test sent to ${r.recipients} number${r.recipients !== 1 ? "s" : ""} (arrives when the phone is online)`);
      refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) logout();
      else if (err instanceof ApiError && err.status === 400) setNote("SMS is not set up on the server");
      else if (err instanceof ApiError && err.status === 429) setNote("daily SMS limit reached");
      else setNote("textbee rejected it or could not be reached - check the API key and that the phone is online");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async () => {
    if (!status) return;
    setBusy(true);
    setNote(null);
    try {
      setStatus(await api.smsSetEnabled(!status.enabled));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) logout();
      else setNote("could not change the SMS switch - is the backend running?");
    } finally {
      setBusy(false);
    }
  };

  const summary = !token
    ? "log in to see SMS alert status"
    : !status
      ? "checking SMS alerts…"
      : !status.configured
        ? "SMS alerts off · set TEXTBEE_API_KEY and SMS_RECIPIENTS in server/.env, then restart the backend"
        : !status.enabled
          ? "SMS alerts switched off · no texts will be sent for alerts"
          : `SMS alerts on ·${status.recipients} recipient${status.recipients !== 1 ? "s" : ""} · ${status.minSeverity} and above · one per type every ${Math.round(status.cooldownSeconds / 60)} min · ${status.sentToday}/${status.dailyLimit} sent today`;

  return (
    <div className="mt-4 pt-3 border-t border-[#132227] flex items-center justify-between gap-4 text-xs">
      <div>
        <div className="text-[#93a2a8]">{summary}</div>
        {note && <div className="text-[10px] text-[#4a5a63] mt-1">{note}</div>}
      </div>
      <div className="shrink-0 flex items-center gap-2">
        <button
          onClick={toggle}
          disabled={!token || !status?.configured || busy}
          role="switch"
          aria-checked={status?.enabled ?? false}
          aria-label="automatic SMS alerts"
          className={`px-3 py-1.5 border rounded disabled:opacity-40 ${
            status?.enabled ? "border-[#4de8f5] text-[#4de8f5] hover:bg-[#0f1a1d]" : "border-[#2a3a40] text-[#93a2a8] hover:bg-[#0f1a1d]"
          }`}
        >
          SMS: {status?.enabled ? "on" : "off"}
        </button>
        <button
          onClick={sendTest}
          disabled={!token || !status?.configured || busy}
          className="px-3 py-1.5 border border-[#2a3a40] text-[#93a2a8] hover:bg-[#0f1a1d] rounded disabled:opacity-40"
        >
          {busy ? "working…" : "send test SMS"}
        </button>
      </div>
    </div>
  );
}
