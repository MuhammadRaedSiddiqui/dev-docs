import type { ReactNode, ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import styles from "./settings.module.css";

export { styles };
export function PageHeader({ title, sub }: { title: string; sub: string }) {
  return <header className={styles.header}><h1>{title}</h1><p>{sub}</p></header>;
}
export function Card({ title, sub, children, danger }: { title: string; sub?: string; children: ReactNode; danger?: boolean }) {
  return <section className={cn(styles.card, danger && styles.dangerCard)}>
    <div className={styles.cardHeader}><h2>{title}</h2>{sub && <p>{sub}</p>}</div>
    <div className={styles.cardBody}>{children}</div>
  </section>;
}
export function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return <div className={styles.field}><label htmlFor={htmlFor}>{label}</label>{children}</div>;
}
export function SettingsButton({ variant = "secondary", pending = false, disabled, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger"; pending?: boolean }) {
  return <button type="button" className={cn(styles.button, styles[variant], className)} {...props} disabled={disabled || pending} aria-busy={pending || undefined} />;
}
export function Badge({ children, active }: { children: ReactNode; active?: boolean }) {
  return <span className={cn(styles.badge, active && styles.activeBadge)}>{children}</span>;
}
export function Feedback({ children, error }: { children: ReactNode; error?: boolean }) {
  return <p className={cn(styles.feedback, error && styles.error)} role={error ? "alert" : "status"}>{children}</p>;
}
