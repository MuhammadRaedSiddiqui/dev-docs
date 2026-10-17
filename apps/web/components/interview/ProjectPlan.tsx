'use client';
import { useInterviewStore } from '@/lib/interview/store';
import type { DomainId } from '@/lib/types';
import styles from './interview.module.css';

export function ProjectPlan({ onViewSection }: { onViewSection: (domain: DomainId) => void }) {
  const s = useInterviewStore();
  const count = s.completedDomains.length;
  const rows = <nav aria-label="Project domains" className={styles.domainList}>
    {s.activeDomains.map(domain => {
      const done = s.completedDomains.includes(domain.id);
      const current = s.currentDomain === domain.id;
      return <button type="button" key={domain.id} className={styles.domainRow}
        aria-current={current ? 'step' : undefined} aria-label={`${domain.label}: ${done ? 'completed, view saved section' : current ? 'current, incomplete' : 'not started'}`}
        disabled={!done} onClick={() => onViewSection(domain.id)}>
        <span aria-hidden="true" className={`${styles.circle} ${done ? styles.completed : ''}`}>{done ? '✓' : ''}</span>{domain.label}
      </button>;
    })}
  </nav>;
  return <>
    <aside className={styles.plan} aria-label="Your project plan">
      <h2 className={styles.planTitle}>Your project plan.</h2>
      <p className={styles.metadata}>{count} of {s.activeDomains.length} domains complete</p>
      <progress className={styles.progress} value={count} max={s.activeDomains.length} aria-label="Completed domains" />
      {rows}<p className={styles.planFooter}>One decision at a time.<br />A clear plan for what’s next.</p>
    </aside>
    <details className={styles.mobilePlan}>
      <summary>Your project plan · {count} / {s.activeDomains.length} complete</summary>
      {rows}
    </details>
  </>;
}
