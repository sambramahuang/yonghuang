import type { LegalDocument } from "../types";

// Illustrative demo dataset only — citations and outcomes are fictional.
// Shaped so a real graph backend can replace it: each ChangeEvent.blastRadius
// entry is an edge to another document node in this same corpus.

export const DOCUMENTS: LegalDocument[] = [
  {
    id: "doc-pdpa",
    title: "Personal Data Protection Act 2012",
    citation: "Cap. 26, PDPA",
    type: "Act",
    practiceAreas: ["Data Protection", "Technology"],
    lastUpdated: "2026-07-14",
    summary:
      "Primary statute governing collection, use and disclosure of personal data in Singapore.",
    clauses: [
      {
        id: "pdpa-c1",
        documentId: "doc-pdpa",
        heading: "s.13 — Consent required",
        text: "An organisation shall not collect, use or disclose personal data about an individual unless the individual gives, or is deemed to have given, consent under this Act.",
        status: "good_law",
      },
      {
        id: "pdpa-c2",
        documentId: "doc-pdpa",
        heading: "s.14 — Deemed consent by notification",
        text: "An individual is deemed to consent to the collection, use or disclosure of personal data for a purpose if the organisation has provided notification of that purpose and the individual does not opt out within a reasonable period.",
        status: "in_progress",
        changeEvent: {
          id: "ce-pdpa-1",
          type: "amendment",
          date: "2026-08-03",
          source: "PDPC Consultation Paper on Consent for AI Training Data (Aug 2026)",
          summary:
            "Proposed amendment narrows 'deemed consent by notification' so it no longer covers use of personal data to train third-party AI models.",
          detail:
            "The PDPC's consultation paper proposes that deemed consent by notification cannot be relied on where personal data is used to train an AI model made available to, or by, a third party. If enacted, any workflow currently relying on notification-based deemed consent for AI training data will need a fresh legal basis (explicit consent or another exception). Consultation closes 30 Sep 2026; amendment expected to take effect Q1 2027.",
          blastRadius: [
            {
              documentId: "doc-ai-guidelines",
              title:
                "PDPC Advisory Guidelines on the PDPA for AI Recommendation & Decision Systems",
              citation: "PDPC Advisory Guidelines (Rev. 2025)",
              relationship: "interprets this provision",
            },
            {
              documentId: "doc-ai-vendor-template",
              title: "AI Vendor Due Diligence & Data Licence Template",
              citation: "Internal template, v4.2",
              relationship: "clause drafted on assumption of deemed consent",
            },
            {
              documentId: "doc-dp-playbook",
              title: "Data Protection Compliance Playbook",
              citation: "Internal playbook, v9",
              relationship: "checklist step references this consent basis",
            },
          ],
        },
      },
      {
        id: "pdpa-c3",
        documentId: "doc-pdpa",
        heading: "s.24 — Protection obligation",
        text: "An organisation shall make reasonable security arrangements to prevent unauthorised access, collection, use, disclosure or similar risks.",
        status: "good_law",
      },
    ],
  },
  {
    id: "doc-ai-guidelines",
    title:
      "PDPC Advisory Guidelines on the PDPA for AI Recommendation & Decision Systems",
    citation: "PDPC Advisory Guidelines (Rev. 2025)",
    type: "Guideline",
    practiceAreas: ["Data Protection", "Technology"],
    lastUpdated: "2025-11-20",
    summary:
      "PDPC guidance on applying PDPA consent and accountability obligations to AI-driven recommendation and decision systems.",
    clauses: [
      {
        id: "aig-c1",
        documentId: "doc-ai-guidelines",
        heading: "§4.2 — Notification as a basis for AI training use",
        text: "Organisations may rely on deemed consent by notification under s.14 PDPA where personal data is repurposed to train an in-house recommendation model, subject to the notification clearly describing the training use.",
        status: "in_progress",
        changeEvent: {
          id: "ce-aig-1",
          type: "regulatory_guidance",
          date: "2026-08-03",
          source: "Same PDPC consultation as PDPA s.14 (Aug 2026)",
          summary:
            "This section will be withdrawn or rewritten once the underlying s.14 PDPA amendment is finalised.",
          detail:
            "This paragraph directly depends on deemed consent by notification remaining available for AI training use. Once the PDPA amendment above is enacted, this guidance is expected to be withdrawn or replaced with a stricter standard requiring explicit consent.",
          blastRadius: [
            {
              documentId: "doc-ai-vendor-template",
              title: "AI Vendor Due Diligence & Data Licence Template",
              citation: "Internal template, v4.2",
              relationship: "template relies on this guidance as authority",
            },
          ],
        },
      },
    ],
  },
  {
    id: "doc-employment-act",
    title: "Employment Act 1968",
    citation: "Cap. 91, Employment Act",
    type: "Act",
    practiceAreas: ["Employment"],
    lastUpdated: "2026-06-02",
    summary:
      "Primary statute governing terms and conditions of employment in Singapore.",
    clauses: [
      {
        id: "ea-c1",
        documentId: "doc-employment-act",
        heading: "s.10 — Termination of contract",
        text: "Either party to a contract of service may terminate the contract by giving the other party notice in writing, and 'without notice' termination requires payment in lieu of notice.",
        status: "good_law",
      },
      {
        id: "ea-c2",
        documentId: "doc-employment-act",
        heading: "s.14 — Dismissal (established interpretation)",
        text: "An employer shall not dismiss an employee without just cause or excuse; the long-standing position was that reliance on an algorithmic performance score alone, without further human review, could constitute just cause where the score methodology was disclosed in the employment contract.",
        status: "overturned",
        changeEvent: {
          id: "ce-ea-1",
          type: "overturned",
          date: "2026-06-02",
          source: "Court of Appeal in Goh v Straits Manufacturing Pte Ltd [2026] SGCA 7",
          summary:
            "Court of Appeal holds that disclosure of an algorithmic scoring methodology alone is not sufficient for 'just cause'; meaningful human review is now required.",
          detail:
            "The Court of Appeal overturned the High Court's earlier position and held that dismissal based solely on an algorithmic performance score, even where the scoring methodology was disclosed to the employee, does not by itself amount to just cause or excuse under s.14. Employers must show meaningful human review of the algorithmic output before relying on it to dismiss. Any HR process, template, or advisory built on the old 'disclosure is enough' standard is now non-compliant.",
          blastRadius: [
            {
              documentId: "doc-hr-playbook",
              title: "HR Compliance Playbook — Performance Management & Exit",
              citation: "Internal playbook, v6",
              relationship: "termination checklist assumes disclosure-only standard",
            },
            {
              documentId: "doc-termination-template",
              title: "Algorithmic Performance Termination Letter Template",
              citation: "Internal template, v2.1",
              relationship: "template clause cites the overturned standard",
            },
            {
              documentId: "doc-client-advisory-algo",
              title:
                "Client Advisory: Navigating Algorithmic Decision-Making Risk",
              citation: "Client advisory, Mar 2026 edition",
              relationship: "advisory relies on the overturned High Court position",
            },
          ],
        },
      },
    ],
  },
  {
    id: "doc-case-lim",
    title: "Lim v Apex Fintech Pte Ltd",
    citation: "[2026] SGHC 112 (on appeal to SGCA)",
    type: "Case",
    practiceAreas: ["Employment", "Technology", "Insurance"],
    lastUpdated: "2026-08-25",
    summary:
      "High Court decision on whether an insurer's algorithmic underwriting model constitutes indirect discrimination; appeal to the Court of Appeal pending and widely expected to be seminal.",
    clauses: [
      {
        id: "lim-c1",
        documentId: "doc-case-lim",
        heading: "Holding — algorithmic proxy discrimination",
        text: "The High Court held that an underwriting model that uses postal sector as a proxy variable may constitute indirect discrimination even without intent, where the proxy correlates strongly with a protected characteristic.",
        status: "seminal_pending",
        changeEvent: {
          id: "ce-lim-1",
          type: "pending_appeal",
          date: "2026-08-25",
          source: "Notice of Appeal filed to the Court of Appeal, 25 Aug 2026",
          summary:
            "Seminal case on algorithmic proxy discrimination now before the Court of Appeal; outcome could redefine 'discrimination' across employment and insurance underwriting models.",
          detail:
            "Apex Fintech has appealed. Practitioners widely regard this as the case that will settle whether proxy variables in automated decision systems can found a discrimination claim without evidence of intent. Any advisory, underwriting policy, or HR screening tool that relies on facially neutral variables correlated with protected characteristics should be treated as at risk pending the Court of Appeal's decision, expected H1 2027.",
          blastRadius: [
            {
              documentId: "doc-employment-act",
              title: "Employment Act 1968",
              citation: "Cap. 91, s.14",
              relationship: "discrimination reasoning may extend to dismissal disputes",
            },
            {
              documentId: "doc-insurance-notice",
              title: "MAS Notice on Fair Dealing in Underwriting",
              citation: "MAS Notice 123 (Subsidiary Legislation)",
              relationship: "underwriting fairness standard directly at issue",
            },
            {
              documentId: "doc-client-advisory-algo",
              title:
                "Client Advisory: Navigating Algorithmic Decision-Making Risk",
              citation: "Client advisory, Mar 2026 edition",
              relationship: "advisory's discrimination-risk section is provisional pending appeal",
            },
            {
              documentId: "doc-hr-playbook",
              title: "HR Compliance Playbook — Performance Management & Exit",
              citation: "Internal playbook, v6",
              relationship: "screening step uses a similar proxy variable",
            },
          ],
        },
      },
    ],
  },
  {
    id: "doc-insurance-notice",
    title: "MAS Notice on Fair Dealing in Underwriting",
    citation: "MAS Notice 123 (Subsidiary Legislation)",
    type: "Subsidiary Legislation",
    practiceAreas: ["Insurance", "Financial Services"],
    lastUpdated: "2025-04-11",
    summary:
      "MAS notice setting fair dealing expectations for insurers' underwriting and pricing models.",
    clauses: [
      {
        id: "ins-c1",
        documentId: "doc-insurance-notice",
        heading: "§3.1 — Non-discriminatory pricing factors",
        text: "An insurer shall not use a pricing factor that has the effect of unfairly discriminating against a class of policyholders, whether or not that effect was intended.",
        status: "seminal_pending",
        changeEvent: {
          id: "ce-ins-1",
          type: "pending_appeal",
          date: "2026-08-25",
          source: "Pending Court of Appeal decision in Lim v Apex Fintech Pte Ltd",
          summary:
            "Scope of 'unfair discrimination' under this notice depends on the pending Court of Appeal ruling on proxy variables.",
          detail:
            "This notice already prohibits unintended discriminatory effect, but the pending appeal will determine how directly a proxy variable must correlate with a protected characteristic before it counts as discriminatory. Underwriting models cleared today could fail the standard the Court of Appeal ultimately sets.",
          blastRadius: [],
        },
      },
    ],
  },
  {
    id: "doc-companies-act",
    title: "Companies Act 1967",
    citation: "Cap. 50, Companies Act",
    type: "Act",
    practiceAreas: ["Corporate"],
    lastUpdated: "2026-05-19",
    summary:
      "Primary statute governing incorporation, governance and administration of companies in Singapore.",
    clauses: [
      {
        id: "ca-c1",
        documentId: "doc-companies-act",
        heading: "s.157 — Directors' duties",
        text: "A director shall at all times act honestly and use reasonable diligence in the discharge of the duties of the office.",
        status: "good_law",
      },
      {
        id: "ca-c2",
        documentId: "doc-companies-act",
        heading: "s.201B — Proposed AI oversight duty (Bill, 2nd reading)",
        text: "[Proposed] A director of a company that deploys an AI system materially affecting stakeholders shall ensure reasonable oversight arrangements are in place for that system.",
        status: "in_progress",
        changeEvent: {
          id: "ce-ca-1",
          type: "amendment",
          date: "2026-05-19",
          source: "Companies (Amendment) Bill 2026, read a second time in Parliament",
          summary:
            "New proposed director's duty of AI oversight would extend s.157 fiduciary duties to AI system governance.",
          detail:
            "If passed, this would be the first explicit statutory director's duty tied to AI oversight in Singapore. Board charters, governance playbooks, and director induction materials that do not yet address AI oversight will need updating before the provision comes into force (expected within 6 months of assent).",
          blastRadius: [
            {
              documentId: "doc-governance-playbook",
              title: "Board Governance & Director Induction Playbook",
              citation: "Internal playbook, v3",
              relationship: "director duties section will be incomplete",
            },
          ],
        },
      },
    ],
  },
  {
    id: "doc-competition-guidelines",
    title: "CCCS Guidelines on the Treatment of Digital Mergers",
    citation: "CCCS Guidelines (2025 ed.)",
    type: "Guideline",
    practiceAreas: ["Competition", "Technology"],
    lastUpdated: "2025-09-01",
    summary:
      "Guidance on how the Competition and Consumer Commission of Singapore assesses mergers involving digital platforms and data assets.",
    clauses: [
      {
        id: "cg-c1",
        documentId: "doc-competition-guidelines",
        heading: "§6 — Data assets as a merger factor",
        text: "The Commission will consider the combined data assets of merging parties as a factor in assessing likely competitive effects, separate from market share.",
        status: "good_law",
      },
    ],
  },
  {
    id: "doc-hr-playbook",
    title: "HR Compliance Playbook — Performance Management & Exit",
    citation: "Internal playbook, v6",
    type: "Internal Playbook",
    practiceAreas: ["Employment"],
    lastUpdated: "2026-01-10",
    summary:
      "Firm-wide internal playbook guiding HR on performance reviews, algorithmic scoring, and termination procedure.",
    clauses: [
      {
        id: "hrp-c1",
        documentId: "doc-hr-playbook",
        heading: "Step 4 — Terminating on algorithmic score",
        text: "Provided the scoring methodology has been disclosed to the employee in their contract, HR may proceed to issue a termination letter citing the score as just cause, without a separate manager review step.",
        status: "overturned",
        changeEvent: {
          id: "ce-hrp-1",
          type: "overturned",
          date: "2026-06-02",
          source: "Court of Appeal in Goh v Straits Manufacturing Pte Ltd [2026] SGCA 7",
          summary:
            "This step now produces non-compliant terminations — the Court of Appeal requires meaningful human review before relying on an algorithmic score.",
          detail:
            "Following Goh v Straits Manufacturing, this step must be amended to insert a mandatory, documented manager review before any termination letter citing an algorithmic score is issued. Terminations processed under the current wording after 2 Jun 2026 carry wrongful dismissal risk.",
          blastRadius: [
            {
              documentId: "doc-termination-template",
              title: "Algorithmic Performance Termination Letter Template",
              citation: "Internal template, v2.1",
              relationship: "downstream template also non-compliant",
            },
          ],
        },
      },
      {
        id: "hrp-c2",
        documentId: "doc-hr-playbook",
        heading: "Step 6 — Screening variables",
        text: "Recruitment screening may use postal sector as a locality-fit signal alongside other factors.",
        status: "seminal_pending",
        changeEvent: {
          id: "ce-hrp-2",
          type: "pending_appeal",
          date: "2026-08-25",
          source: "Pending Court of Appeal decision in Lim v Apex Fintech Pte Ltd",
          summary:
            "This screening variable is the same type of proxy at issue in a pending seminal Court of Appeal case.",
          detail:
            "Postal sector is the same class of proxy variable under scrutiny in Lim v Apex Fintech. If the Court of Appeal finds such proxies can found an indirect discrimination claim without intent, this screening step will need to be withdrawn or justified with a documented business necessity test.",
          blastRadius: [],
        },
      },
    ],
  },
  {
    id: "doc-termination-template",
    title: "Algorithmic Performance Termination Letter Template",
    citation: "Internal template, v2.1",
    type: "Template Clause",
    practiceAreas: ["Employment"],
    lastUpdated: "2025-12-02",
    summary:
      "Standard-form termination letter template citing algorithmic performance scores.",
    clauses: [
      {
        id: "tt-c1",
        documentId: "doc-termination-template",
        heading: "Recital 2",
        text: "Your employment is terminated with immediate effect on the basis of your disclosed performance score of [X], as previously communicated to you as a basis for termination under your contract of service.",
        status: "overturned",
        changeEvent: {
          id: "ce-tt-1",
          type: "overturned",
          date: "2026-06-02",
          source: "Court of Appeal in Goh v Straits Manufacturing Pte Ltd [2026] SGCA 7",
          summary:
            "Recital no longer supports 'just cause' on its own; must reference a documented human review step.",
          detail:
            "Add a recital confirming a named manager conducted and documented a substantive review of the score and surrounding context before this letter was issued.",
          blastRadius: [
            {
              documentId: "doc-hr-playbook",
              title: "HR Compliance Playbook — Performance Management & Exit",
              citation: "Internal playbook, v6",
              relationship: "source playbook step also non-compliant",
            },
          ],
        },
      },
    ],
  },
  {
    id: "doc-ai-vendor-template",
    title: "AI Vendor Due Diligence & Data Licence Template",
    citation: "Internal template, v4.2",
    type: "Template Clause",
    practiceAreas: ["Technology", "Data Protection"],
    lastUpdated: "2026-02-18",
    summary:
      "Standard due diligence questionnaire and data licence clauses used when onboarding third-party AI vendors.",
    clauses: [
      {
        id: "avt-c1",
        documentId: "doc-ai-vendor-template",
        heading: "Clause 8 — Lawful basis warranty",
        text: "Vendor warrants that personal data supplied for model training was collected on the basis of deemed consent by notification in accordance with s.14 PDPA.",
        status: "in_progress",
        changeEvent: {
          id: "ce-avt-1",
          type: "amendment",
          date: "2026-08-03",
          source: "PDPC Consultation Paper on Consent for AI Training Data (Aug 2026)",
          summary:
            "This warranty basis is expected to become unavailable once the PDPA amendment takes effect.",
          detail:
            "Once s.14 PDPA is amended, this warranty will no longer be a valid lawful basis for AI training data. The clause should be redrafted to require explicit consent or another valid exception ahead of the expected Q1 2027 effective date.",
          blastRadius: [],
        },
      },
    ],
  },
  {
    id: "doc-dp-playbook",
    title: "Data Protection Compliance Playbook",
    citation: "Internal playbook, v9",
    type: "Internal Playbook",
    practiceAreas: ["Data Protection"],
    lastUpdated: "2026-03-05",
    summary:
      "Firm-wide playbook for assessing lawful basis and PDPA compliance across new products and vendors.",
    clauses: [
      {
        id: "dpp-c1",
        documentId: "doc-dp-playbook",
        heading: "Checklist item 5 — AI training data basis",
        text: "Confirm notification has been issued to data subjects and no opt-out has been received within 14 days; this satisfies the consent requirement for use of the data in AI model training.",
        status: "in_progress",
        changeEvent: {
          id: "ce-dpp-1",
          type: "amendment",
          date: "2026-08-03",
          source: "PDPC Consultation Paper on Consent for AI Training Data (Aug 2026)",
          summary:
            "Checklist step will fail to satisfy the amended consent standard once PDPA s.14 is narrowed.",
          detail:
            "Flag this checklist item for revision now so it is ready to switch to an explicit-consent standard the moment the PDPA amendment is gazetted, rather than discovering the gap during an audit.",
          blastRadius: [],
        },
      },
    ],
  },
  {
    id: "doc-client-advisory-algo",
    title: "Client Advisory: Navigating Algorithmic Decision-Making Risk",
    citation: "Client advisory, Mar 2026 edition",
    type: "Client Advisory",
    practiceAreas: ["Employment", "Technology", "Insurance"],
    lastUpdated: "2026-03-15",
    summary:
      "Client-facing advisory summarising legal risk in deploying algorithmic scoring and underwriting tools.",
    clauses: [
      {
        id: "cla-c1",
        documentId: "doc-client-advisory-algo",
        heading: "§2 — Termination risk",
        text: "Advisory previously stated that disclosed algorithmic scoring, without more, is a defensible basis for termination.",
        status: "overturned",
        changeEvent: {
          id: "ce-cla-1",
          type: "overturned",
          date: "2026-06-02",
          source: "Court of Appeal in Goh v Straits Manufacturing Pte Ltd [2026] SGCA 7",
          summary:
            "This section of the advisory is now incorrect and should be reissued to clients.",
          detail:
            "Clients who received this advisory should be notified that meaningful human review is now required before relying on an algorithmic score to dismiss an employee.",
          blastRadius: [],
        },
      },
      {
        id: "cla-c2",
        documentId: "doc-client-advisory-algo",
        heading: "§4 — Discrimination risk in underwriting and screening",
        text: "Advisory flags proxy-variable discrimination as an emerging, unsettled risk area pending the outcome of a closely watched High Court decision.",
        status: "seminal_pending",
        changeEvent: {
          id: "ce-cla-2",
          type: "pending_appeal",
          date: "2026-08-25",
          source: "Pending Court of Appeal decision in Lim v Apex Fintech Pte Ltd",
          summary:
            "This section's risk rating will need updating once the Court of Appeal rules.",
          detail:
            "Keep this section flagged as provisional. Depending on the direction of the Court of Appeal's ruling, the risk rating for proxy-variable screening and underwriting could move from 'emerging' to 'high' across every client relying on this advisory.",
          blastRadius: [],
        },
      },
    ],
  },
  {
    id: "doc-governance-playbook",
    title: "Board Governance & Director Induction Playbook",
    citation: "Internal playbook, v3",
    type: "Internal Playbook",
    practiceAreas: ["Corporate"],
    lastUpdated: "2026-05-19",
    summary:
      "Induction and governance reference materials for boards and newly appointed directors.",
    clauses: [
      {
        id: "gp-c1",
        documentId: "doc-governance-playbook",
        heading: "§3 — Director duties reference table",
        text: "Reference table of statutory director duties under s.157 of the Companies Act.",
        status: "in_progress",
        changeEvent: {
          id: "ce-gp-1",
          type: "amendment",
          date: "2026-05-19",
          source: "Companies (Amendment) Bill 2026, read a second time in Parliament",
          summary:
            "Reference table is missing the proposed AI oversight duty and will be incomplete once the Bill passes.",
          detail:
            "Add a row for the proposed s.201B AI oversight duty now, so director induction materials are ready the moment the amendment comes into force.",
          blastRadius: [],
        },
      },
    ],
  },
];
