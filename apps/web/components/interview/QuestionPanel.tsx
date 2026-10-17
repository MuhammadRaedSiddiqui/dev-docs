'use client';
import { useEffect, useRef, useState } from 'react';
import { useInterviewStore } from '@/lib/interview/store';
import { getDomain } from '@/lib/interview/domains';
import { DOMAIN_COPY } from '@/lib/interview/questions';
import type { DomainId } from '@/lib/types';
import styles from './interview.module.css';

const statusText = { ready: 'Ready to answer', submitting: 'Preparing your response…', preparing: 'Preparing your response…', generating: 'Generating documentation…', saving: 'Saving documentation…', follow_up: 'Follow-up question ready', saved: 'Interview complete', error: '' };
export function QuestionPanel({ onViewSection }: { onViewSection: (domain: DomainId) => void }) {
  const s = useInterviewStore();
  const [validation, setValidation] = useState('');
  const textarea = useRef<HTMLTextAreaElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const main = useRef<HTMLElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const canMoveFocus = useRef(false);
  const mounted = useRef(false);
  const domain = getDomain(s.currentDomain);
  const copy = DOMAIN_COPY[domain.id];
  const completed = s.isComplete;
  const busy = s.isThinking || s.isStreaming;
  const locked = busy || !!s.pending;
  const option = s.question.choices?.find(o => o.id === s.draft.choice);
  useEffect(() => {
    const trackFocus = (event: FocusEvent) => {
      if (event.target !== document.body) canMoveFocus.current = !!main.current?.contains(event.target as Node);
    };
    document.addEventListener('focusin', trackFocus);
    return () => document.removeEventListener('focusin', trackFocus);
  }, []);
  useEffect(() => {
    setValidation('');
    // Preserve focus in documentation, the header, or navigation. Disabled
    // answer controls can lose browser focus to body while awaiting a save.
    if (mounted.current && !busy && canMoveFocus.current && main.current?.getClientRects().length) {
      if (completed) heading.current?.focus();
      else form.current?.querySelector<HTMLElement>('input:not(:disabled), textarea:not(:disabled)')?.focus();
    }
    mounted.current = true;
  }, [s.currentDomain, s.question.text, completed, busy]);
  useEffect(() => {
    const el = textarea.current;
    if (el) { el.style.height = 'auto'; el.style.height = `${Math.max(142, el.scrollHeight)}px`; }
  }, [s.draft.text]);
  function submit() {
    if (locked) return;
    if (s.question.choices && !option) { setValidation('Select an option before confirming.'); return; }
    if (option?.requiresExplanation && !s.draft.context.trim()) { setValidation('Describe your choice so it can be included in your documentation.'); return; }
    if (!s.question.choices && !s.draft.text.trim()) { setValidation('Enter an answer. If you’re unsure, you can say “not sure”.'); textarea.current?.focus(); return; }
    setValidation(''); s.submitAnswer();
  }
  const error = s.lastError && <div role="alert" className={styles.error}>
    <p>{s.lastError.message}</p>
    <button className={styles.secondary} type="button" onClick={s.retryLast} disabled={busy}>Retry</button>
    {s.lastError.type === 'auth' && <a href="/settings?section=apikey">Check API key</a>}
    {s.lastError.type === 'model_unavailable' && <a href="https://dev.meta.ai" target="_blank" rel="noopener noreferrer">Meta dashboard</a>}
  </div>;
  return <main ref={main} className={styles.main} id="interview-question">
    <div className={styles.questionArea}>
      <p className={styles.breadcrumb}>Interview / {domain.label}</p>
      <h1 ref={heading} tabIndex={-1} className={styles.heading}>{completed ? 'Your project plan is ready.' : copy.heading}</h1>
      {completed ? <>
        <p className={styles.introduction}>Your interview is complete. Every domain is documented, and your plan is ready to review and export.</p>
        <p className={styles.savedBadge}><span aria-hidden="true">✓</span> All sections saved</p>
        <div className={styles.actions}>
          <button className={styles.primary} type="button" onClick={() => onViewSection(domain.id)}>View complete documentation</button>
        </div>{error}
      </> : <>
        <p className={styles.introduction}>{copy.introduction}</p>
        <p className={styles.assistant}>DevDocs assistant <span aria-hidden="true">·</span> {s.followUpCount ? 'Follow-up' : 'Main question'}</p>
        <h2 className={styles.question} id="question-text">{s.question.text}</h2>
        {s.question.guidance && <p id="question-guidance" className={styles.guidance}>{s.question.guidance}</p>}
        <form ref={form} onSubmit={e => { e.preventDefault(); submit(); }} noValidate aria-busy={busy}>
          {s.question.choices ? <>
            <fieldset className={styles.choices} disabled={locked} aria-describedby={validation ? 'answer-error' : undefined}>
              <legend className={styles.srOnly}>{s.question.text}</legend>
              <div className={styles.radioGrid}>{s.question.choices.map(choice => <label key={choice.id} className={styles.radioCard}>
                <input type="radio" name="interview-choice" value={choice.id} checked={s.draft.choice === choice.id} onChange={() => { s.setAnswerDraft({ choice: choice.id }); setValidation(''); }} />
                <span><span className={styles.radioTitle}>{choice.title}</span>{choice.description && <span className={styles.radioDescription}>{choice.description}</span>}</span>
              </label>)}</div>
            </fieldset>
            {option && <div className={styles.context}>
              <label className={styles.answerLabel} htmlFor="answer-context">{option.requiresExplanation ? 'Describe your choice (required)' : 'Supporting context (optional)'}</label>
              <textarea id="answer-context" className={styles.textarea} rows={3} maxLength={3000} disabled={locked} value={s.draft.context} onChange={e => s.setAnswerDraft({ context: e.target.value })} aria-invalid={!!validation && option.requiresExplanation} aria-describedby={validation ? 'answer-error' : undefined} />
            </div>}
          </> : <>
            <label className={styles.answerLabel} htmlFor="interview-answer">Your answer</label>
            <textarea ref={textarea} id="interview-answer" className={styles.textarea} rows={4} maxLength={4000} value={s.draft.text} disabled={locked}
              placeholder={s.question.placeholder ?? 'Share what you know, or say “not sure”…'} aria-invalid={!!validation} aria-describedby={`question-text ${s.question.guidance ? 'question-guidance ' : ''}${validation ? 'answer-error' : 'answer-hint'}`}
              onChange={e => { s.setAnswerDraft({ text: e.target.value }); setValidation(''); }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); submit(); } }} />
            {s.question.example && <details className={styles.example}><summary>See an example</summary><p>{s.question.example}</p></details>}
          </>}
          {validation && <p id="answer-error" role="alert" className={styles.error}>{validation}</p>}
          <div className={styles.actions}>
            <button className={styles.primary} type="submit" disabled={locked}>{busy ? 'Working…' : s.question.choices ? 'Confirm choice' : 'Send answer'}</button>
            {!s.question.choices && <span id="answer-hint" className={styles.metadata}>Enter to send · Shift + Enter for a new line</span>}
          </div>
        </form>{error}
      </>}
      <p className={styles.status} role="status" aria-live="polite" aria-atomic="true">{s.notice || (s.status === 'generating' ? `Generating ${getDomain(s.pending?.domainId ?? s.currentDomain).label} documentation…` : statusText[s.status])}</p>
    </div>
  </main>;
}
