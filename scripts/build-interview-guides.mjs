#!/usr/bin/env node
// Generate 5 interview question / answer blog posts in /blog/.
// Uses the same article template as the salary guides.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outDir = path.join(repoRoot, 'blog');

const BASE = 'https://www.hiretrack.co.in';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

const GUIDES = [
  {
    slug: 'mis-executive-interview-questions-2026',
    role: 'MIS Executive',
    title: 'Top 30 MIS Executive Interview Questions and Answers (2026)',
    desc: '30 MIS Executive interview questions for 2026 — Excel, SQL, reporting, analytics, situational and HR rounds. With detailed answers and difficulty levels.',
    heroColor: '#78350f',
    emoji: '📊',
    intro:
      "MIS Executive interviews in 2026 focus heavily on Excel + SQL + reporting fundamentals plus situational reasoning. This guide collects 30 of the most commonly asked questions, grouped by round, with detailed answers and difficulty levels.",
    groups: [
      {
        name: 'Excel & SQL',
        questions: [
          ['Easy', 'What is the difference between VLOOKUP and XLOOKUP?', 'XLOOKUP is the modern replacement for VLOOKUP. It searches in any direction (left or right), defaults to exact match, returns multiple values, and lets you specify a fallback value. It is faster on large datasets and is now standard in Microsoft 365.'],
          ['Easy', 'Explain the difference between WHERE and HAVING in SQL.', 'WHERE filters rows before grouping (i.e., before GROUP BY); HAVING filters the resulting groups after the aggregation. Use WHERE for row-level filters and HAVING for aggregate-level filters like SUM(amount) > 1000.'],
          ['Medium', 'What are pivot tables and when would you use them?', 'Pivot tables summarise large datasets into compact, interactive reports — typically for grouping, filtering and aggregating. Use them for monthly sales by region, attendance by department, etc. They are central to most MIS reporting.'],
          ['Medium', 'Write a SQL query to find the second highest salary from an employees table.', "SELECT MAX(salary) AS second_highest FROM employees WHERE salary < (SELECT MAX(salary) FROM employees); — or use DENSE_RANK() window function for ties: SELECT salary FROM (SELECT salary, DENSE_RANK() OVER (ORDER BY salary DESC) AS rk FROM employees) t WHERE rk = 2;"],
          ['Hard', 'How would you optimise a slow SQL query?', 'Inspect the query plan (EXPLAIN), check for missing indexes on JOIN/WHERE columns, avoid SELECT *, push filters down into subqueries, and rewrite correlated subqueries as JOINs. For analytics, pre-aggregate into materialised views.'],
          ['Hard', 'Explain SUMIFS with multiple criteria including dates.', 'SUMIFS(sum_range, criteria_range1, criteria1, criteria_range2, criteria2, …). For dates, criteria can use ">="&DATE(2026,1,1) and "<"&DATE(2026,2,1). Each criteria pair is ANDed together — there is no OR in SUMIFS without a helper column or SUMPRODUCT.'],
        ],
      },
      {
        name: 'Reporting & Analytics',
        questions: [
          ['Easy', 'How do you ensure data accuracy in MIS reports?', 'Cross-check totals against the source system, use named ranges and data validation in Excel, automate refreshes with Power Query, and lock formulas. Maintain a change log so you can audit any edit.'],
          ['Medium', 'How would you build a dashboard for daily sales review?', 'Start from raw transactions in SQL/CSV → load via Power Query → model in Power BI/Tableau → add 4–6 KPIs (revenue, units, AOV, top SKUs), drill-through filters by store/region, and schedule refresh. Keep it under 1 screen with executive summary on top.'],
          ['Medium', 'What is the difference between MIS reports and BI dashboards?', 'MIS reports are scheduled, static views (often in Excel) for operational tracking. BI dashboards are interactive, self-service, and built for ad-hoc exploration. Most modern MIS roles do both.'],
          ['Hard', 'Walk me through how you would design a monthly P&L automation.', 'Pull GL entries from the ERP into a staging table, map cost-centres to P&L categories via a lookup table, transform with Power Query / SQL, and load into a templated Excel/BI report. Add variance vs budget, prior-year and prior-month columns, plus a commentary cell per line.'],
        ],
      },
      {
        name: 'Analytical Thinking',
        questions: [
          ['Medium', 'Sales dropped 20% last week — how would you investigate?', 'First check data integrity (was the feed complete?). Then split by region, channel, SKU and customer segment to localise the drop. Compare with same week last year and last month. Layer in operational events (holiday, system outage, pricing change) before drawing a conclusion.'],
          ['Medium', 'How do you decide which KPIs go on an executive dashboard?', 'Start from the business question — what decision is the executive making? Pick 4–7 KPIs that directly drive that decision. Anything else goes into drill-throughs. Use the "north star" framing.'],
          ['Hard', 'How would you measure the success of a new marketing campaign?', 'Set up a clear pre/post window, use a control cohort if possible, track impressions → clicks → leads → conversions, and report CAC, ROAS and incremental revenue. Watch for halo effects on retention.'],
        ],
      },
      {
        name: 'Situational',
        questions: [
          ['Medium', 'Your manager asks for a report in 1 hour but the data source is down. What do you do?', "Communicate immediately. Offer the latest cached version with a clear timestamp + caveat, and provide a revised ETA for the live report. Don't ship inaccurate numbers under pressure."],
          ['Medium', 'How do you handle conflicting requirements from two stakeholders?', "Re-state both requirements in writing, identify the underlying business question for each, then ask both stakeholders to align in a 15-minute call. Document the agreed scope before building."],
          ['Hard', 'You discover an error in a report that has already been sent to leadership. What now?', "Notify your manager immediately, then send a follow-up to recipients with the corrected report and a short explanation of the error and its impact. Add a post-mortem note on what process change will prevent recurrence."],
        ],
      },
      {
        name: 'HR / Behavioural',
        questions: [
          ['Easy', 'Why do you want to be an MIS Executive?', 'A strong answer connects the role to your strengths: numerical reasoning, attention to detail, comfort with Excel/SQL, and curiosity about business operations. Mention the role as a path into BA/analytics.'],
          ['Easy', 'Walk me through your resume.', 'Use a structured 60-second arc: education → first role + biggest impact → most recent role + biggest impact → why you are interviewing for this role today.'],
          ['Medium', 'Where do you see yourself in 3–5 years?', "Show direction without being rigid: senior MIS / lead analyst → BA or BI manager. Tie growth to building skills (advanced SQL, Power BI, Python, domain depth)."],
          ['Medium', 'Tell me about a time you handled a difficult stakeholder.', "Use STAR: situation, task, action, result. Focus on how you understood their requirement, set expectations, and delivered a measurable outcome."],
        ],
      },
    ],
    cta: 'Try AI Interview Prep',
    related: [
      ['/blog/mis-executive-salary-india-2026.html', 'MIS Executive Salary 2026'],
      ['/blog/business-analyst-salary-india-2026.html', 'Business Analyst Salary 2026'],
    ],
  },
  {
    slug: 'hr-executive-interview-questions-2026',
    role: 'HR Executive',
    title: 'Top 25 HR Executive Interview Questions and Answers (2026)',
    desc: '25 HR Executive interview questions for 2026 — labour laws, recruitment, payroll, conflict resolution, behavioural. Detailed answers + difficulty.',
    heroColor: '#0e7490',
    emoji: '👥',
    intro:
      "HR Executive interviews in 2026 test knowledge of labour laws, hiring funnels, payroll compliance and people-management judgement. This guide covers 25 of the most common questions with structured answers.",
    groups: [
      {
        name: 'Labour Laws & Compliance',
        questions: [
          ['Easy', 'What is the difference between PF, ESI and PT?', 'PF (Provident Fund) is a retirement saving — 12% of basic + DA from both employee and employer. ESI (Employee State Insurance) provides medical and cash benefits — 0.75% employee, 3.25% employer, capped salary. PT (Professional Tax) is a state tax on income — slab-based.'],
          ['Medium', 'When does POSH (Prevention of Sexual Harassment) compliance apply?', 'POSH applies to any organisation with 10 or more employees. The employer must constitute an Internal Committee, run awareness training, and file an annual report with the District Officer.'],
          ['Medium', 'What is the difference between gratuity, leave encashment and bonus?', 'Gratuity is paid on separation after 5+ years (₹15 days of last salary × years of service). Leave encashment converts unused leave to cash at separation. Bonus is a statutory or discretionary year-end payout typically 8.33%–20% of basic.'],
          ['Hard', 'A contract worker has been on rolls for 240+ days continuously — what does the Industrial Disputes Act require?', 'They become eligible for protections under the IDA — including notice, retrenchment compensation if terminated. Companies should either regularise them or rotate genuinely.'],
        ],
      },
      {
        name: 'Recruitment & Onboarding',
        questions: [
          ['Easy', 'Walk me through your end-to-end recruitment process.', 'Hiring manager kickoff → JD finalise → sourcing (job boards, referrals) → screening → shortlist → interviews (HR + technical + leadership) → reference check → offer → onboarding. Track conversion ratios at each step.'],
          ['Medium', 'How do you reduce time-to-hire?', 'Pre-screen with structured questions, batch interviews, give hiring managers a 24-hour SLA, and keep a warm pipeline for the top 3 roles. Use scorecards to avoid endless review loops.'],
          ['Medium', 'How do you assess culture fit without bias?', "Define 3–4 core behaviours that matter (e.g., ownership, collaboration). Ask STAR questions for each. Use the same scorecard for every candidate and calibrate across interviewers."],
          ['Hard', 'How would you build an HR onboarding programme from scratch?', 'Pre-day-1 (offer letter, BGV, paperwork) → Day 1 welcome + IT setup → Week 1 manager 1:1 + team intros + training plan → 30/60/90-day check-ins with feedback. Capture NPS at 30 days.'],
        ],
      },
      {
        name: 'Payroll & Operations',
        questions: [
          ['Easy', 'What is CTC, gross salary and in-hand pay?', 'CTC = full cost to company including benefits. Gross salary = CTC minus employer-side benefits (PF, gratuity). In-hand = gross minus deductions (PF employee, PT, TDS, ESI).'],
          ['Medium', 'How do you reconcile payroll month-on-month?', 'Compare current vs previous month per employee, flag deltas (joinees, exits, salary revision, attendance), and run statutory checks (PF, ESI, PT, TDS). Sign off only after manager approval.'],
          ['Medium', 'How do you handle a payroll error that under-paid an employee?', 'Apologise + commit to a same-day correction. Pay the delta immediately (or with next cycle, with clear communication). Add the root cause to a tracker so it does not recur.'],
        ],
      },
      {
        name: 'Conflict & Behavioural',
        questions: [
          ['Easy', 'Tell me about a difficult employee situation you resolved.', "STAR: situation, task, action, result. Focus on listening + fairness + clear documentation."],
          ['Medium', 'How would you handle a complaint about a manager from their direct report?', 'Listen carefully and document. Validate severity. If it falls under POSH, route via Internal Committee. Otherwise, have a confidential 1:1 with the manager, set expectations, and follow up in 30 days.'],
          ['Medium', 'Two teams are blaming each other for a missed deliverable. What do you do?', "Bring both leads together, separate facts from interpretation, identify the system failure, and agree on a shared definition of done. Focus on the process, not the people."],
          ['Hard', "An employee is on a Performance Improvement Plan but the manager wants to terminate them tomorrow. What's your stance?", "Push back on the timeline. PIP exists to give the employee a fair chance. Terminating early opens legal and reputational risk. Bring legal + HR head into the loop."],
        ],
      },
      {
        name: 'HR Strategy',
        questions: [
          ['Easy', 'Why HR?', 'A strong answer connects to your interest in people, systems, and operational rigour. Reference one concrete experience — a college club you ran, a community you mentored — to ground it.'],
          ['Medium', "What HR tools have you used? What's your favourite?", 'Mention 2–3: Darwinbox, Keka, BambooHR, Greenhouse, Lever. State what you liked + the tradeoff (e.g., Greenhouse for structured hiring, Darwinbox for India-specific payroll).'],
          ['Hard', 'How would you design a retention strategy for a 50-person SME?', "Run a 1:1 manager cadence, refresh comp benchmarks every 12 months, define clear growth bands, run a quarterly pulse, and put exit interviews in a closed loop with leadership."],
          ['Medium', 'Tell me about a time you used data in an HR decision.', "STAR. Examples: identifying high-attrition teams from exit interviews, predicting hiring needs from sales pipeline, or measuring NPS pre/post a learning programme."],
        ],
      },
    ],
    cta: 'Try AI Interview Prep',
    related: [
      ['/blog/hr-executive-salary-india-2026.html', 'HR Executive Salary 2026'],
      ['/blog/hr-jobs-india-salary-skills-2025.html', 'HR Jobs Salary Guide 2025'],
    ],
  },
  {
    slug: 'sales-executive-interview-questions-2026',
    role: 'Sales Executive',
    title: 'Sales Executive Interview Questions for Freshers & Experienced (2026)',
    desc: 'Top sales executive interview questions for 2026 — cold calling, CRM, targets, objection handling, role-play. With detailed answers + difficulty.',
    heroColor: '#7e22ce',
    emoji: '🤝',
    intro:
      "Sales executive interviews in 2026 test how you think on your feet, handle objections, structure pipelines, and use CRM tools. This guide collects the most common questions with answers calibrated to Indian B2B + retail sales contexts.",
    groups: [
      {
        name: 'Cold calling & Prospecting',
        questions: [
          ['Easy', 'How would you open a cold call?', "State your name + company in one line, ask permission with a 15-second pitch, and end with a calendar question, not a yes/no. Example: 'Hi, this is Riya from HireTrack — we help SMEs hire faster. Can I take 30 seconds to share why I called?'"],
          ['Medium', 'How do you handle a "send me an email instead" response?', "Acknowledge + redirect: 'I will, but to send the most relevant note, can I ask one quick question about how you currently hire?' Get one piece of qualifying info before you let them off the call."],
          ['Hard', 'How do you build a 50-account weekly pipeline from cold?', "Define ICP, scrape from LinkedIn + Apollo + ZoomInfo + employee networks. Tier accounts A/B/C. Touch each Tier A account 6 times in 14 days across LinkedIn + email + call. Track hit-rate by channel."],
        ],
      },
      {
        name: 'CRM & Process',
        questions: [
          ['Easy', 'Which CRMs have you used?', 'Mention 2–3: Salesforce, HubSpot, Zoho, LeadSquared. Talk about the workflow you ran (stage definitions, fields you logged, reports you watched).'],
          ['Medium', 'How do you keep your CRM clean?', 'Log every meaningful interaction the same day, set the next-step + due date, and review a personal "stale deals" report weekly. Use stage definitions consistently across the team.'],
          ['Medium', 'How do you forecast deal closure?', 'Use weighted pipeline (deal value × probability × stage). Cross-check with rep gut. Update after every customer interaction.'],
        ],
      },
      {
        name: 'Objection handling',
        questions: [
          ['Easy', '"Your product is too expensive." How do you respond?', "Anchor on value, not price: 'I understand. Can I ask what you are comparing it against?' Then quantify the ROI relative to their current cost — usually a sales cycle is at least 5–10× the SaaS spend."],
          ['Medium', '"We already use a competitor." Now what?', "Don't disparage — get curious. 'That's great — what would they need to change for you to switch?' Listen for the structural gap, then position one specific advantage."],
          ['Hard', '"Send me a one-pager and we will get back." Translate that into a 30% closer.', "Agree, but pin a 15-minute follow-up call before you hang up. 'Happy to. To make sure I send the right version, can we lock 15 minutes on Thursday to walk through it together?'"],
        ],
      },
      {
        name: 'Role play & Targets',
        questions: [
          ['Medium', 'Sell me this pen.', "Don't pitch features. Ask: 'When did you last need to write something down?' → 'What kind of pen do you use?' → 'What if I told you ours never leaks and writes on any surface?' Discover need first, then position."],
          ['Medium', 'You missed your monthly target by 30%. What did you do next month?', "STAR. Diagnose: stage funnel — was the gap top-of-funnel, mid-funnel or close rate? Fix the right stage. Increase activity (more calls/demos) in parallel. Communicate proactively with the manager."],
          ['Hard', "How would you ramp a new sales hire to 80% quota in 90 days?", "Day 1–14: product + ICP + tools. Day 15–30: shadow + role-play + 100 outbound activities/day. Day 31–60: live deals with manager review. Day 61–90: own a small territory + weekly pipeline reviews."],
        ],
      },
      {
        name: 'Behavioural',
        questions: [
          ['Easy', 'Why sales?', "Connect to ownership of outcomes and direct impact on revenue + the ability to compound your earnings. Reference a concrete moment where you persuaded or sold something already."],
          ['Medium', 'Tell me about your biggest deal.', "STAR. Size, complexity, what was at stake, how you navigated stakeholders, and what you would do differently."],
          ['Medium', 'How do you handle rejection?', "Acknowledge it's part of the job. Specific examples: I review my notes, look for the structural lesson (positioning vs ICP vs timing), and move on. The numbers favour the consistent."],
        ],
      },
    ],
    cta: 'Try AI Interview Prep',
    related: [
      ['/blog/sales-executive-salary-india-2026.html', 'Sales Executive Salary 2026'],
      ['/blog/digital-marketing-executive-salary-india-2026.html', 'Digital Marketing Salary 2026'],
    ],
  },
  {
    slug: 'data-analyst-interview-questions-sql-2026',
    role: 'Data Analyst',
    title: 'Data Analyst SQL Interview Questions — India Edition (2026)',
    desc: 'Top SQL data-analyst interview questions for 2026 in India — JOINs, GROUP BY, window functions, real Indian business scenarios. With answers + difficulty.',
    heroColor: '#1d4ed8',
    emoji: '🗄️',
    intro:
      "SQL is the #1 skill tested in any Indian data-analyst interview in 2026. This guide groups the most-asked questions by topic, with answers and difficulty.",
    groups: [
      {
        name: 'JOINs',
        questions: [
          ['Easy', 'Explain INNER JOIN vs LEFT JOIN.', "INNER JOIN returns only rows that match on both sides. LEFT JOIN returns all rows from the left table; unmatched right-side rows are NULL. RIGHT JOIN is the mirror. FULL OUTER JOIN keeps both."],
          ['Medium', 'Find customers who have not placed any orders.', "SELECT c.* FROM customers c LEFT JOIN orders o ON o.customer_id = c.id WHERE o.id IS NULL;"],
          ['Medium', 'Join three tables: customers, orders, order_items — get the total revenue per customer.', "SELECT c.id, c.name, SUM(oi.qty * oi.price) AS revenue FROM customers c JOIN orders o ON o.customer_id = c.id JOIN order_items oi ON oi.order_id = o.id GROUP BY c.id, c.name;"],
          ['Hard', 'Self-join: find pairs of employees in the same department.', "SELECT a.name AS emp1, b.name AS emp2 FROM employees a JOIN employees b ON a.department = b.department AND a.id < b.id;"],
        ],
      },
      {
        name: 'GROUP BY & Aggregates',
        questions: [
          ['Easy', 'Find the average order value by month for 2026.', "SELECT DATE_TRUNC('month', order_date) AS m, AVG(total) FROM orders WHERE order_date >= '2026-01-01' GROUP BY 1 ORDER BY 1;"],
          ['Medium', "What's the difference between COUNT(*) and COUNT(column)?", "COUNT(*) counts all rows including NULLs. COUNT(column) counts only non-NULL values in that column."],
          ['Hard', 'Find departments where average salary exceeds the company-wide average.', "SELECT department, AVG(salary) AS dept_avg FROM employees GROUP BY department HAVING AVG(salary) > (SELECT AVG(salary) FROM employees);"],
        ],
      },
      {
        name: 'Window Functions',
        questions: [
          ['Medium', 'Rank employees by salary within each department.', "SELECT name, department, salary, RANK() OVER (PARTITION BY department ORDER BY salary DESC) AS dept_rank FROM employees;"],
          ['Medium', 'Find the running total of revenue by day.', "SELECT order_date, SUM(total) OVER (ORDER BY order_date) AS running_total FROM orders;"],
          ['Hard', 'Find the 7-day moving average of daily orders.', "SELECT order_date, COUNT(*) AS daily_orders, AVG(COUNT(*)) OVER (ORDER BY order_date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS ma_7 FROM orders GROUP BY order_date;"],
          ['Hard', "Find the second-most-recent order per customer.", "SELECT * FROM (SELECT o.*, ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date DESC) AS rn FROM orders o) t WHERE rn = 2;"],
        ],
      },
      {
        name: 'Indian business scenarios',
        questions: [
          ['Medium', 'Calculate GST collected by HSN code and month for 2026.', "SELECT hsn_code, DATE_TRUNC('month', invoice_date) AS m, SUM(taxable_value * gst_rate / 100.0) AS gst_collected FROM invoices WHERE invoice_date >= '2026-01-01' GROUP BY hsn_code, m;"],
          ['Medium', "Find the top 5 cities by total revenue in the last quarter.", "SELECT city, SUM(total) FROM orders WHERE order_date >= NOW() - INTERVAL '90 days' GROUP BY city ORDER BY 2 DESC LIMIT 5;"],
          ['Hard', "Identify customers whose order frequency dropped 50%+ in the last 90 days vs the previous 90 days.", "WITH a AS (SELECT customer_id, COUNT(*) AS recent FROM orders WHERE order_date >= NOW() - INTERVAL '90 days' GROUP BY 1), b AS (SELECT customer_id, COUNT(*) AS prev FROM orders WHERE order_date BETWEEN NOW() - INTERVAL '180 days' AND NOW() - INTERVAL '90 days' GROUP BY 1) SELECT a.customer_id FROM a JOIN b USING(customer_id) WHERE a.recent <= b.prev * 0.5;"],
        ],
      },
    ],
    cta: 'Try AI Interview Prep',
    related: [
      ['/blog/business-analyst-salary-india-2026.html', 'Business Analyst Salary 2026'],
      ['/blog/data-analyst-interview-preparation.html', 'Data Analyst Interview Prep'],
    ],
  },
  {
    slug: 'digital-marketing-interview-questions-2026',
    role: 'Digital Marketing',
    title: 'Digital Marketing Interview Questions for Freshers (2026)',
    desc: 'Digital marketing interview questions for freshers in 2026 — SEO, SEM, social media, GA4, content marketing. Detailed answers + difficulty.',
    heroColor: '#c2410c',
    emoji: '📣',
    intro:
      "Digital-marketing interviews in 2026 test fundamentals across SEO, paid ads, social, analytics and content. This guide collects the most-asked questions for freshers and 1–2 year experienced candidates.",
    groups: [
      {
        name: 'SEO',
        questions: [
          ['Easy', 'What is on-page vs off-page SEO?', 'On-page SEO covers what you control on the page (title, H1, content, schema, internal links). Off-page SEO is reputation: backlinks, mentions, brand searches.'],
          ['Medium', 'How do you research keywords?', 'Combine free tools (Google Keyword Planner, Search Console, AnswerThePublic) with a paid tool (Ahrefs, SEMrush). Cluster by intent (informational, commercial, transactional) and difficulty.'],
          ['Medium', 'What is structured data (schema) and why does it matter?', 'JSON-LD markup that helps Google understand your page (JobPosting, Article, FAQPage, BreadcrumbList). It enables rich results and improves CTR.'],
          ['Hard', 'How would you fix a sudden 30% organic-traffic drop?', 'Check Search Console for manual actions or coverage drops, compare top-landing-pages period-over-period to find the affected URLs, look at SERP positions in tools, and check for site changes (CMS migration, robots.txt, canonical errors).'],
        ],
      },
      {
        name: 'Paid Ads (SEM/SMM)',
        questions: [
          ['Easy', "Explain CPC, CPM, CPA, ROAS.", 'CPC = cost per click. CPM = cost per 1000 impressions. CPA = cost per acquisition (lead or sale). ROAS = revenue / ad spend.'],
          ['Medium', 'How do you structure a Google Ads campaign for a new SaaS product?', "Campaign per intent (brand / category / competitor / generic). Ad groups by tight keyword themes. SKAGs are obsolete in 2026 — use exact + phrase match with broad match limited. Track conversions, not clicks."],
          ['Medium', 'How do you reduce CAC on Meta Ads?', "Refresh creatives weekly, expand audience pools, test landing pages, and improve conversion API events. Watch frequency — above 3 you are burning the audience."],
          ['Hard', 'A campaign has high CTR but low conversions. Diagnose.', "Mismatched intent between ad and landing page, slow load, weak CTA, broken form, irrelevant traffic from broad targeting, or a tracking issue. Inspect heatmap + funnel in order."],
        ],
      },
      {
        name: 'Analytics (GA4)',
        questions: [
          ['Easy', "How is GA4 different from Universal Analytics?", "GA4 is event-based (everything is an event), supports cross-device tracking, and replaces sessions/bounce-rate with engagement metrics."],
          ['Medium', 'How do you measure organic-traffic quality, not just volume?', "Track engagement rate, conversions per source, and conversion rate by landing page. Segment by device + geography. Volume without quality is vanity."],
          ['Hard', 'Set up conversion tracking for a signup form in GA4.', "Create a custom event in GA4 with the relevant parameters (e.g., source, plan). Mark it as a 'key event' (conversion) in the Admin → Events settings. Verify in DebugView."],
        ],
      },
      {
        name: 'Content & Social',
        questions: [
          ['Easy', 'What makes a good blog headline?', "Specific, benefit-led, includes the primary keyword, and ≤60 characters. Numbers and year tags lift CTR."],
          ['Medium', "What's your content calendar for a B2B SaaS startup?", "Mix top-of-funnel (SEO blog posts targeting JTBD queries), mid-funnel (case studies, comparison posts), and bottom-of-funnel (product features, pricing). 1–2 long-form / week, daily LinkedIn distribution."],
          ['Medium', "Which social channel would you prioritise for a D2C brand in India?", "Instagram + WhatsApp Business + Meta Ads for awareness/retargeting. YouTube Shorts for high-intent product education. LinkedIn only if the buyer is a procurement professional."],
        ],
      },
      {
        name: 'Behavioural',
        questions: [
          ['Easy', 'Why digital marketing?', "Connect to data + creativity, the ability to test ideas in days (not quarters), and the broad surface area (SEO, paid, content, analytics)."],
          ['Medium', "Tell me about a campaign you ran.", "STAR. Goal, channels, budget, KPIs, what worked, what didn't, and the learning."],
        ],
      },
    ],
    cta: 'Try AI Interview Prep',
    related: [
      ['/blog/digital-marketing-executive-salary-india-2026.html', 'Digital Marketing Salary 2026'],
      ['/blog/content-writer-salary-india-2026.html', 'Content Writer Salary 2026'],
    ],
  },
];

function buildPage(g) {
  const url = `${BASE}/blog/${g.slug}.html`;
  const totalQ = g.groups.reduce((n, gr) => n + gr.questions.length, 0);
  const today = new Date().toISOString().slice(0, 10);
  const articleLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: g.title,
    author: { '@type': 'Organization', name: 'HireTrack' },
    publisher: { '@type': 'Organization', name: 'HireTrack', url: BASE },
    datePublished: today,
    dateModified: today,
    mainEntityOfPage: url,
  };
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: g.groups
      .flatMap((gr) => gr.questions)
      .slice(0, 12)
      .map(([, q, a]) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
      })),
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE}/` },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${BASE}/blog.html` },
      { '@type': 'ListItem', position: 3, name: g.title, item: url },
    ],
  };

  const summaryTable = g.groups
    .map((gr) => `<tr><td>${esc(gr.name)}</td><td>${esc(gr.questions.length)}</td></tr>`)
    .join('\n      ');

  const groupsHtml = g.groups
    .map(
      (gr) => `
  <h2>${esc(gr.name)}</h2>
  ${gr.questions
    .map(
      ([diff, q, a]) => `
  <div class="art-q">
    <div class="art-q-label"><span class="diff diff-${diff.toLowerCase()}">${esc(diff)}</span> ${esc(q)}</div>
    <p class="art-q-a">${esc(a)}</p>
  </div>`
    )
    .join('\n  ')}`
    )
    .join('\n');

  const relatedHtml = g.related
    .map(([href, label]) => `<li><a href="${esc(href)}">${esc(label)}</a></li>`)
    .join('\n      ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(g.title)} | HireTrack Blog</title>
<meta name="description" content="${esc(g.desc)}">
<meta name="robots" content="index, follow">
<meta property="og:title" content="${esc(g.title)}">
<meta property="og:description" content="${esc(g.desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:type" content="article">
<meta property="og:image" content="${BASE}/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(g.title)}">
<meta name="twitter:description" content="${esc(g.desc)}">
<meta name="twitter:image" content="${BASE}/og-image.png">
<link rel="canonical" href="${esc(url)}">
<link rel="stylesheet" href="../style.css">
<link rel="stylesheet" href="../mobile.css">
<style>
body{padding-top:64px;}
.article-hero{background:linear-gradient(135deg,${g.heroColor},#1e293b);padding:3rem 1.5rem;color:#fff;text-align:center;}
.article-hero .art-cat{display:inline-block;background:rgba(255,255,255,0.2);color:#fff;font-size:0.75rem;font-weight:700;padding:4px 12px;border-radius:20px;margin-bottom:1rem;text-transform:uppercase;}
.article-hero h1{font-size:1.95rem;font-weight:800;max-width:760px;margin:0 auto 1rem;line-height:1.3;}
.article-hero .art-meta{color:rgba(255,255,255,0.75);font-size:0.85rem;}
.article-wrap{max-width:760px;margin:2.5rem auto;padding:0 1.5rem;}
.article-emoji{font-size:4.5rem;text-align:center;margin-bottom:2rem;}
.article-wrap h2{font-size:1.3rem;font-weight:800;color:#0f172a;margin:2rem 0 0.75rem;padding-bottom:0.5rem;border-bottom:2px solid #e2e8f0;}
.article-wrap p{font-size:0.95rem;line-height:1.8;color:#334155;margin-bottom:1rem;}
.art-q{background:#fff;border:1.5px solid #e2e8f0;border-radius:12px;padding:1rem 1.25rem;margin-bottom:0.85rem;}
.art-q-label{font-size:0.95rem;font-weight:700;color:#0f172a;margin-bottom:0.4rem;display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;}
.art-q-a{font-size:0.92rem;color:#334155;line-height:1.7;margin:0;}
.diff{font-size:0.66rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;padding:2px 8px;border-radius:20px;}
.diff-easy{background:#dcfce7;color:#15803d;}
.diff-medium{background:#fef3c7;color:#92400e;}
.diff-hard{background:#fee2e2;color:#b91c1c;}
.art-table{width:100%;border-collapse:collapse;margin:1rem 0 1.5rem;font-size:0.88rem;}
.art-table th{background:#0f172a;color:#fff;padding:0.75rem 1rem;text-align:left;font-size:0.8rem;}
.art-table td{padding:0.6rem 1rem;border-bottom:1px solid #e2e8f0;color:#334155;}
.art-cta{background:linear-gradient(135deg,#1e3a5f,#0f172a);border-radius:14px;padding:2rem;text-align:center;margin:2.5rem 0;color:#fff;}
.art-cta h3{font-size:1.2rem;font-weight:800;margin:0 0 0.5rem;}
.art-cta p{color:#94a3b8;font-size:0.88rem;margin:0 0 1.2rem;}
.art-cta a{display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:0.75rem 2rem;border-radius:8px;font-weight:700;font-size:0.92rem;}
.art-related{background:#f8fafc;border-radius:12px;padding:1rem 1.5rem;margin:2rem 0;}
.art-related h4{margin:0 0 0.5rem;font-size:0.9rem;font-weight:700;color:#0f172a;}
.breadcrumb{font-size:0.8rem;color:#94a3b8;text-align:center;padding:1rem 0 0;}
.breadcrumb a{color:#3b82f6;text-decoration:none;}
@media(max-width:768px){.article-hero h1{font-size:1.4rem;}.article-wrap{padding:0 0.75rem;}body{padding-top:56px;}}
</style>
<script type="application/ld+json">${JSON.stringify([articleLd, faqLd, breadcrumbLd])}</script>
</head>
<body>
<div id="navbar"></div>
<nav class="breadcrumb" aria-label="Breadcrumb">
  <a href="../index.html">Home</a> › <a href="../blog.html">Blog</a> › ${esc(g.title)}
</nav>
<header class="article-hero">
  <span class="art-cat">Interview Prep</span>
  <h1>${esc(g.title)}</h1>
  <div class="art-meta">📅 ${new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} &nbsp;·&nbsp; ${totalQ} questions &nbsp;·&nbsp; ✍️ HireTrack Team</div>
</header>
<article class="article-wrap">
  <div class="article-emoji" aria-hidden="true">${g.emoji}</div>
  <p>${esc(g.intro)}</p>

  <h2>Quick Summary</h2>
  <table class="art-table">
    <thead><tr><th>Section</th><th>Questions</th></tr></thead>
    <tbody>
      ${summaryTable}
    </tbody>
  </table>

  ${groupsHtml}

  <div class="art-cta">
    <h3>Preparing for interviews?</h3>
    <p>Try HireTrack's AI Interview Prep — free for all users.</p>
    <a href="/profile.html#pro/interview-prep">${esc(g.cta)} →</a>
  </div>

  <div class="art-related">
    <h4>Related guides</h4>
    <ul>
      ${relatedHtml}
      <li><a href="/jobs.html">Browse all jobs</a></li>
    </ul>
  </div>
</article>
<footer class="ht-footer">
  <div class="ht-footer-bottom">
    <p class="ht-address" style="font-size:0.78rem;color:rgba(255,255,255,0.55);margin:0 0 0.35rem;">📍 Bengaluru, Karnataka, India</p>
    <p>© <span id="copy-year">2026</span> <span>HireTrack</span> — Find Jobs Across India. Built with ❤️ in Bengaluru.</p>
  </div>
</footer>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="/js/sb-rest-shim.js"></script>
<script src="../app.js"></script>
<script>
  document.getElementById('navbar').innerHTML = renderNavbar('blog');
  var _cy = document.getElementById('copy-year'); if (_cy) _cy.textContent = new Date().getFullYear();
</script>
</body>
</html>
`;
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  for (const g of GUIDES) {
    await fs.writeFile(path.join(outDir, `${g.slug}.html`), buildPage(g), 'utf8');
    console.log(`wrote blog/${g.slug}.html`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
