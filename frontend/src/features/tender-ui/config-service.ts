import { ADMIN_CONFIG_STORAGE_KEY } from "./default-config";
import type {
  DocumentReference,
  StandardDefinition,
  StandardTemplate,
  TenderUiConfig,
} from "./types";

export type ConfigSource = "system" | "admin_override";

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isStandardDefinition(value: unknown): value is StandardDefinition {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<StandardDefinition>;
  return (
    typeof candidate.standard_id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.description === "string" &&
    typeof candidate.default_priority === "number" &&
    typeof candidate.enabled_by_default === "boolean" &&
    isStringArray(candidate.check_types)
  );
}

function isStandardTemplate(value: unknown): value is StandardTemplate {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<StandardTemplate>;
  return (
    typeof candidate.template_id === "string" &&
    typeof candidate.name === "string" &&
    Array.isArray(candidate.standards) &&
    candidate.standards.every(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        typeof entry.standard_id === "string" &&
        typeof entry.priority === "number",
    )
  );
}

function isDocumentReference(value: unknown): value is DocumentReference {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<DocumentReference>;
  return (
    typeof candidate.document_id === "string" &&
    typeof candidate.file_name === "string" &&
    typeof candidate.display_name === "string"
  );
}

export function isTenderUiConfig(value: unknown): value is TenderUiConfig {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<TenderUiConfig>;
  return (
    typeof candidate.schema_version === "string" &&
    typeof candidate.updated_at === "string" &&
    typeof candidate.default_template_id === "string" &&
    Array.isArray(candidate.standards_catalog) &&
    candidate.standards_catalog.every(isStandardDefinition) &&
    Array.isArray(candidate.templates) &&
    candidate.templates.every(isStandardTemplate) &&
    Array.isArray(candidate.documents) &&
    candidate.documents.every(isDocumentReference)
  );
}

export function cloneConfig(config: TenderUiConfig): TenderUiConfig {
  return JSON.parse(JSON.stringify(config)) as TenderUiConfig;
}

export async function fetchSystemConfig(): Promise<TenderUiConfig> {
  const response = await fetch("/api/admin/config", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load system config: ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  if (!isTenderUiConfig(payload)) {
    throw new Error("Invalid system config payload.");
  }

  return payload;
}

export function readAdminConfigOverride(): TenderUiConfig | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(ADMIN_CONFIG_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isTenderUiConfig(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveAdminConfigOverride(config: TenderUiConfig): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(ADMIN_CONFIG_STORAGE_KEY, JSON.stringify(config));
}

export function clearAdminConfigOverride(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(ADMIN_CONFIG_STORAGE_KEY);
}

export function resolveActiveConfig(systemConfig: TenderUiConfig): {
  config: TenderUiConfig;
  source: ConfigSource;
} {
  const override = readAdminConfigOverride();
  if (!override) {
    return { config: cloneConfig(systemConfig), source: "system" };
  }

  return { config: cloneConfig(override), source: "admin_override" };
}

export function getTemplateOrder(config: TenderUiConfig, templateId: string): string[] {
  const template = config.templates.find((item) => item.template_id === templateId);
  if (!template) {
    return [];
  }

  return template.standards
    .slice()
    .sort((a, b) => a.priority - b.priority)
    .map((entry) => entry.standard_id);
}

export function getDefaultSelectedOrder(config: TenderUiConfig): string[] {
  const templateOrder = getTemplateOrder(config, config.default_template_id);
  if (templateOrder.length > 0) {
    return templateOrder;
  }

  return config.standards_catalog
    .slice()
    .sort((a, b) => a.default_priority - b.default_priority)
    .filter((standard) => standard.enabled_by_default)
    .map((standard) => standard.standard_id);
}

export function toDocumentMap(config: TenderUiConfig): Record<string, DocumentReference> {
  return Object.fromEntries(config.documents.map((document) => [document.document_id, document]));
}

export function getDefaultDocument(config: TenderUiConfig): DocumentReference {
  if (config.documents.length > 0) {
    return config.documents[0];
  }

  return {
    document_id: "unknown",
    file_name: "unknown.pdf",
    display_name: "Unknown Document",
  };
}

export function normalizeTemplate(config: TenderUiConfig, templateId: string): TenderUiConfig {
  const standardIds = new Set(config.standards_catalog.map((standard) => standard.standard_id));

  const templates = config.templates.map((template) => {
    if (template.template_id !== templateId) {
      return template;
    }

    const filtered = template.standards
      .filter((entry) => standardIds.has(entry.standard_id))
      .slice()
      .sort((a, b) => a.priority - b.priority)
      .map((entry, index) => ({ standard_id: entry.standard_id, priority: index + 1 }));

    return { ...template, standards: filtered };
  });

  return { ...config, templates };
}
