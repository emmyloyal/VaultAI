// Slot components for the VaultMind UI. Each one maps to a Pin UI component role (https://www.pinui.xyz/components).
// Pin UI ships copy-paste source files: to use the real ones, paste a file into src/components/pin/ and swap the
// import in App.tsx. The props below are deliberately small so that swap is a drop-in.
import { useState, type ReactNode } from "react";

// Pin UI role: Liquid Tabs
export function LiquidTabs<T extends string>({ tabs, value, onChange }: { tabs: [T, string][]; value: T; onChange: (v: T) => void }) {
  const i = tabs.findIndex(t => t[0] === value);
  return <div className="lt" role="tablist" style={{ gridTemplateColumns: `repeat(${tabs.length},1fr)` }}>
    <span className="lt-i" style={{ width: `${100 / tabs.length}%`, transform: `translateX(${i * 100}%)` }} />
    {tabs.map(([k, n]) => <button key={k} role="tab" aria-selected={k === value} className={k === value ? "on" : ""} onClick={() => onChange(k)}>{n}</button>)}
  </div>;
}
// Pin UI role: Balance Card
export function BalanceCard({ label, amount, unit, sub, actions }: { label: string; amount: string; unit: string; sub?: ReactNode; actions?: ReactNode }) {
  return <div className="bc"><div className="m">{label}</div><div className="bc-n">{amount}</div><div className="m">{unit}</div>{sub && <div className="m" style={{ marginTop: 8 }}>{sub}</div>}<div>{actions}</div></div>;
}
// Pin UI role: Chips
export function Chips({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [t, setT] = useState("");
  const add = () => { const v = t.trim().toLowerCase(); if (v && !values.includes(v)) onChange([...values, v]); setT(""); };
  return <div className="chips">{values.map(v => <span key={v} className="chip">{v}<button aria-label={`Remove ${v}`} onClick={() => onChange(values.filter(x => x !== v))}>×</button></span>)}
    <input value={t} placeholder={placeholder} onChange={e => setT(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} onBlur={add} /></div>;
}
// Pin UI role: Lamp Switch
export function LampSwitch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button role="switch" aria-checked={on} className={"lamp" + (on ? " on" : "")} onClick={() => onChange(!on)}><span className="lamp-k" />{label}</button>;
}
// Pin UI role: Task Card
export function TaskCard({ title, badge, tone, reasons, children }: { title: string; badge: string; tone: "allow" | "ask" | "block" | "done"; reasons: string; children?: ReactNode }) {
  return <div className="tk"><div><span className={"pill " + tone}>{badge}</span> <b>{title}</b></div><div className="m">{reasons}</div><div>{children}</div></div>;
}
// Pin UI role: Prompt Composer
export function PromptComposer({ value, onChange, onSubmit, placeholder }: { value: string; onChange: (v: string) => void; onSubmit: () => void; placeholder: string }) {
  return <div className="pc"><textarea rows={2} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(); } }} /><button onClick={onSubmit}>Ask agent</button></div>;
}
// Pin UI role: Progress
export function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const p = Math.min(100, max > 0 ? (value / max) * 100 : 0);
  return <div><div className="m">{label}</div><div className="mt"><i style={{ width: p + "%", background: p > 85 ? "var(--bad)" : "var(--pri)" }} /></div></div>;
}
