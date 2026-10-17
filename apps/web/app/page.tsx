// app/page.tsx
// Public-facing marketing landing page.
// "use client" is needed only for the FAQ accordion toggle. Everything else
// could be server-rendered; feel free to extract the FAQ into its own client
// component and make the rest of this file a Server Component.
"use client";

import { useState } from "react";
import Link from "next/link";
import s from "@/app/landing.module.css";

const OUTPUT_FILES = [
  { name: "PLANNING", desc: "Project scope, MVP definition, success metrics, timeline" },
  { name: "ARCHITECTURE", desc: "Tech stack decisions, architecture decision records, component responsibilities" },
  { name: "DATABASE", desc: "Schema design, migration strategy, indexing plan, soft delete policy" },
  { name: "API-CONTRACTS", desc: "Endpoint definitions, request/response shapes, authentication per route" },
  { name: "ENV-STRATEGY", desc: "Environment list, secrets management, CI/CD gate definitions" },
  { name: "AUTH", desc: "Auth provider, session strategy, token storage, RBAC model" },
  { name: "TESTING", desc: "Testing pyramid, tool choices, coverage targets, CI integration" },
  { name: "MONITORING", desc: "Four golden signals, alert thresholds, error tracking, health checks" },
  { name: "FRONTEND", desc: "Design tokens, component architecture, state management pattern, a11y targets" },
  { name: "DEPLOYMENT", desc: "Hosting platform, deployment method, rollback strategy, scaling triggers" },
];

const FAQS = [
  {
    q: "Is my API key secure?",
    a: "Your key is sent once over HTTPS to our server, verified, and encrypted at rest with AES-256-GCM. It's never returned to your browser after saving and is never stored in client code. All AI calls are made server-side using the encrypted key held only in memory for the duration of a request — we never log your key or your prompts.",
  },
  {
    q: "How long does an interview take?",
    a: "15–30 minutes for a typical project. Complex projects with multiple integrations take longer. The interview is designed to feel like a conversation with a senior developer, not a form. You can skip domains that don't apply to your project type.",
  },
  {
    q: "Can I edit the generated documentation?",
    a: "Yes. Every generated file is editable in-app before you export the bundle.",
  },
  {
    q: "Does this work with Claude Code, Cursor, and Windsurf?",
    a: "Yes. The documentation bundle is structured markdown optimised for AI coding agent consumption. Drop the docs/ folder into your project root and point your agent at the README.md. The agent reads full architectural context before writing a line of code.",
  },
  {
    q: "What if I already started my project?",
    a: "DevDocs AI is designed for pre-build planning, but you can also use the interview to document decisions in an existing project and identify gaps.",
  },
];

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  function toggleFaq(i: number) {
    setOpenFaq((cur) => (cur === i ? null : i));
  }

  return (
    <div className={s.root}>
      {/* Mobile notice */}
      <div className={s.mobileNotice}>
        DevDocs AI is best experienced on a larger screen.
      </div>
      {/* NAV */}
      <nav className={s.nav} aria-label="Main navigation">
        <span className={s.navLogo}>DevDocs AI</span>
        <ul className={s.navLinks}>
          <li><a href="#how">How It Works</a></li>
          <li><a href="#output">Output</a></li>
          <li><a href="#pricing">Pricing & Billing</a></li>
          <li><a href="#faq">FAQ</a></li>
        </ul>
        <div className={s.navActions}>
          <Link href="/sign-in" className={s.btnGhost}>Sign In</Link>
          <Link href="/sign-in" className={s.btnPrimary}>Get Started Free</Link>
        </div>
      </nav>

      <main>
      {/* HERO */}
      <section className={s.hero}>
        <div className={s.container}>
          <div className={s.heroInner}>
            <div>
              <p className={s.sectionLabel}>Pre-build planning</p>
              <h1 className={s.displayType}>
                Your project, fully planned before you write line one.
              </h1>
              <p className={s.heroSub}>
                Interview with AI. Generate a project-specific documentation bundle. Feed it to Claude Code,
                Cursor, or Windsurf. Build without guessing.
              </p>
              <div className={s.heroCtas}>
                <Link href="/sign-in" className={s.btnPrimary}>Get Started Free</Link>
                <a href="#how" className={s.btnGhost}>See How It Works</a>
              </div>
              <p className={s.heroNote}>Free app access; your AI provider charges for usage.</p>
            </div>

            {/* Illustrative content, not a captured customer interview. */}
            <figure className={s.productExample}>
              <figcaption className={s.exampleHeader}>
                <span className={s.exampleLabel}>Example output</span>
                <span>Project: personal document workspace</span>
              </figcaption>
              <ol className={s.exampleSteps}>
                <li>
                  <p className={s.exampleLabel}>1. Discovery question</p>
                  <p>Who can access a project’s documents?</p>
                </li>
                <li>
                  <p className={s.exampleLabel}>2. Your answer → planning decision</p>
                  <p>“Just the project owner. No sharing in the MVP.”</p>
                  <p className={s.exampleDecision}><strong>Decision:</strong> Require sign-in and check project ownership before every document request.</p>
                </li>
                <li>
                  <p className={s.exampleLabel}>3. Generated documentation</p>
                  <p className={s.exampleFilename}>docs/AUTH.md</p>
                  <pre className={s.exampleMarkdown}><code>{`## Document access\n\n- Only the signed-in project owner can\n  read or edit project documents.\n- Verify ownership on every request.\n- Sharing is out of scope for the MVP.`}</code></pre>
                </li>
              </ol>
            </figure>
          </div>
        </div>
      </section>

      <hr className={s.divider} />

      {/* PROBLEM */}
      <section className={s.sectionProblem} id="problem">
        <div className={s.container}>
          <div className={s.problemIntro}>
            <p className={s.sectionLabel}>The problem</p>
            <h2 className={s.heading}>
              AI coding agents fail when planning is missing.
            </h2>
            <p>
              Every undocumented decision — database schema, auth strategy, deployment target — becomes
              a broken build discovered mid-sprint. DevDocs AI surfaces every decision before development begins.
            </p>
          </div>
          <div className={s.beforeAfter}>
            <div className={s.baCard}>
              <p className={s.baCardLabel}>✕ &nbsp;Without DevDocs AI</p>
              <div className={s.codeSnippet}>
                Build me a SaaS app with user auth,<br />a dashboard, and Stripe payments.
              </div>
              <ul className={s.consequenceList}>
                {[
                  "No schema — the agent guesses and gets it wrong",
                  "Auth strategy undecided — JWT vs sessions resolved at random",
                  "Stripe webhooks break because the strategy was never defined",
                  "Three days of rework. Significant token waste.",
                ].map((item) => (
                  <li key={item} className={s.consequenceItem}>
                    <span className={s.consequenceIcon}>✕</span> {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className={s.baCard}>
              <p className={s.baCardLabel}>✓ &nbsp;With DevDocs AI</p>
              <div className={s.codeSnippet}>
                docs/README.md → 10 files loaded<br />Full architectural context present.
              </div>
              <ul className={s.consequenceList}>
                {[
                  "Schema designed and indexed before a table is created",
                  "Auth documented with provider, session, and RBAC decisions",
                  "Stripe webhook strategy defined in ENV-STRATEGY.md",
                  "Coding agent begins with documented project decisions.",
                ].map((item) => (
                  <li key={item} className={s.consequenceItem}>
                    <span className={s.consequenceIcon}>✓</span> {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className={s.sectionHow} id="how">
        <div className={s.container}>
          <div className={s.sectionHowIntro}>
            <p className={s.sectionLabel}>How it works</p>
            <h2 className={s.heading}>Four steps between your idea<br />and an implementation-ready plan.</h2>
          </div>
          <div className={s.stepsGrid}>
            {[
              {
                n: "01 — Interview",
                title: "The AI asks every question you'd skip.",
                body: "Targeted questions across 10 planning domains. Architecture, database, auth, testing, deployment, and more. Every question is the one a senior developer would ask before writing a line of code.",
              },
              {
                n: "02 — Recommend",
                title: "Opinionated, not neutral.",
                body: "Based on your constraints — team size, timeline, budget, scale — the AI recommends architecture with justification. It argues for a monolith over microservices when that's the right call.",
              },
              {
                n: "03 — Generate",
                title: "Relevant domains, documented.",
                body: "DevDocs generates the documentation domains relevant to your project type. Each follows a consistent markdown format and remains editable before export.",
              },
              {
                n: "04 — Export & Build",
                title: "Drop in. Point. Build.",
                body: "Download the generated documentation bundle as a ZIP. Drop the docs/ folder into your project root and give your coding agent the decisions captured during the interview.",
              },
            ].map((step) => (
              <div key={step.n} className={s.stepCell}>
                <p className={s.stepNumber}>{step.n}</p>
                <h3 className={s.cardHeading}>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <hr className={s.divider} />

      {/* OUTPUT */}
      <section className={s.sectionOutput} id="output">
        <div className={s.container}>
          <div className={s.outputIntro}>
            <p className={s.sectionLabel}>The output</p>
            <h2 className={s.heading}>Ten supported domains.<br />Your project gets the relevant set.</h2>
          </div>
          <div className={s.outputTable}>
            {OUTPUT_FILES.map((f) => (
              <div key={f.name} className={s.outputRow}>
                <div className={s.outputFilename}>
                  {f.name}<span className={s.fileExt}>.md</span>
                </div>
                <div className={s.outputDesc}>{f.desc}</div>
              </div>
            ))}
          </div>
          <p className={s.outputNote}>
            Every generated file is editable in-app before ZIP export.
          </p>
        </div>
      </section>

      {/* PRICING & BILLING */}
      <section className={s.sectionPricing} id="pricing">
        <div className={s.container}>
          <div className={s.pricingIntro}>
            <p className={s.sectionLabel}>Pricing & Billing</p>
            <h2 className={s.heading}>Free app. Your AI provider key.</h2>
          </div>
          <div className={s.pricingCard}>
            <div className={s.pricingDetails}>
              <h3 className={s.cardHeading}>Free with bring your own key (BYOK)</h3>
              <p className={s.pricingPrice}>$0</p>
              <p className={s.pricingPriceNote}>DevDocs AI app access. No subscription required.</p>
              <p className={s.pricingDesc}>Connect an API key from a supported AI provider to power your planning interview. An API key lets DevDocs AI use that provider’s models on your behalf.</p>
              <p className={s.billingNote}><strong>AI usage is separate.</strong> Your provider may charge you directly for usage. Costs vary by model and interview length.</p>
              <Link href="/sign-in" className={s.btnPrimary}>Get Started Free</Link>
            </div>
            <div className={s.pricingIncluded}>
              <h3 className={s.cardHeading}>Included today</h3>
              <ul className={s.pricingFeatures}>
                {["AI-guided planning across the domains relevant to your project", "Project templates to start your interview", "Editable Markdown documentation in the app", "Markdown and ZIP export for your coding workflow"].map((f) => <li key={f}>{f}</li>)}
              </ul>
            </div>
          </div>
          <aside className={s.roadmapNote} aria-label="Roadmap">
            <strong>On the roadmap:</strong> Hosted AI and team workspaces are under consideration and are not currently available. Availability and pricing are not announced.
          </aside>
        </div>
      </section>

      {/* FAQ */}
      <section className={s.sectionFaq} id="faq">
        <div className={s.container}>
          <div className={s.faqIntro}>
            <p className={s.sectionLabel}>Common questions</p>
            <h2 className={s.heading}>Common questions.</h2>
          </div>
          <div className={s.faqList}>
            {FAQS.map((faq, i) => (
              <div key={i} className={s.faqItem}>
                <button type="button" className={s.faqQuestion} id={`faq-question-${i}`} aria-expanded={openFaq === i} aria-controls={`faq-answer-${i}`} onClick={() => toggleFaq(i)}>
                  {faq.q}
                  <span aria-hidden="true" className={`${s.faqArrow} ${openFaq === i ? s.faqArrowOpen : ""}`}>↓</span>
                </button>
                <div className={s.faqAnswer} id={`faq-answer-${i}`} role="region" aria-labelledby={`faq-question-${i}`} hidden={openFaq !== i}>{faq.a}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className={s.sectionCta}>
        <div className={s.container}>
          <div className={s.ctaInner}>
            <h2 className={s.heading}>
              Stop discovering architecture decisions mid-build.
            </h2>
            <p className={s.ctaSub}>Plan completely. Build confidently. Ship without rework.</p>
            <div className={s.ctaButtons}>
              <Link href="/sign-in" className={s.btnPrimary}>Get Started Free</Link>
              <a href="#output" className={s.btnGhost}>See the Output</a>
            </div>
          </div>
        </div>
      </section>
      </main>

      {/* FOOTER */}
      <footer className={s.footer}>
        <div className={s.container}>
          <div className={s.footerInner}>
            <div className={s.footerLeft}>
              <span className={s.footerWordmark}>DevDocs AI</span>
              <span className={s.footerCopy}>© 2026 DevDocs AI. All rights reserved.</span>
            </div>
            <ul className={s.footerLinks}>
              <li><a href="#how">How It Works</a></li>
              <li><a href="#pricing">Pricing & Billing</a></li>
              <li><a href="#output">Documentation</a></li>
              <li><a href="#faq">FAQ</a></li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}
