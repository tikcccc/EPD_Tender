import type { DocumentReference, StandardDefinition, StandardTemplate } from "./types";

export const STANDARDS_CATALOG: StandardDefinition[] = [
  {
    standard_id: "deadline",
    name: "Deadline Compliance",
    description: "Validate tender clauses that define hard deadlines and submission windows.",
    default_priority: 1,
    enabled_by_default: true,
    check_types: ["deadline"],
  },
  {
    standard_id: "documentation",
    name: "Document Completeness",
    description: "Ensure required forms, copies and evidence fields are complete and traceable.",
    default_priority: 2,
    enabled_by_default: true,
    check_types: ["deadline"],
  },
  {
    standard_id: "design_checker",
    name: "Design Checker Workflow",
    description: "Verify clauses requiring certification or consent by design checker workflows.",
    default_priority: 3,
    enabled_by_default: true,
    check_types: ["deadline"],
  },
  {
    standard_id: "consent_path",
    name: "Supervising Officer Consent",
    description: "Track contractual consent pathways tied to contract stages and notifications.",
    default_priority: 4,
    enabled_by_default: false,
    check_types: ["deadline"],
  },
  {
    standard_id: "reporting",
    name: "Monthly Reporting",
    description: "Confirm periodic reporting obligations and fixed cutoff dates.",
    default_priority: 5,
    enabled_by_default: false,
    check_types: ["deadline"],
  },
];

export const NEC_TEMPLATE: StandardTemplate = {
  template_id: "nec-default-v1",
  name: "NEC Default Template",
  standards: [
    { standard_id: "deadline", priority: 1 },
    { standard_id: "documentation", priority: 2 },
    { standard_id: "design_checker", priority: 3 },
  ],
};

export const NEC_PRIORITY_ORDER = NEC_TEMPLATE.standards
  .slice()
  .sort((a, b) => a.priority - b.priority)
  .map((entry) => entry.standard_id);

export const DOCUMENT_MAP: Record<string, DocumentReference> = {
  main_coc: {
    document_id: "main_coc",
    file_name: "I-EP_SP_174_20-COC-0.pdf",
    display_name: "Conditions of Contract",
  },
  "I-EP_SP_174_20-ER-0": {
    document_id: "I-EP_SP_174_20-ER-0",
    file_name: "I-EP_SP_174_20-ER-0.pdf",
    display_name: "Employer's Requirements",
  },
};

export const DEFAULT_DOCUMENT: DocumentReference = DOCUMENT_MAP.main_coc;
