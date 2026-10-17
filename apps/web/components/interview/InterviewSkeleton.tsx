import styles from './interview.module.css';
export function InterviewSkeleton() {
  return <div className={styles.page} aria-busy="true">
    <header className={styles.header}><span className={styles.brand}>DevDocs AI</span></header>
    <main className={styles.questionArea}><p role="status" className={styles.metadata}>Loading your project plan…</p></main>
  </div>;
}
