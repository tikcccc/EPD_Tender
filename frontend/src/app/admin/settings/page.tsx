"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  clearAdminConfigOverride,
  cloneConfig,
  fetchSystemConfig,
  getTemplateOrder,
  readAdminConfigOverride,
  saveAdminConfigOverride,
} from "@/features/tender-ui/config-service";
import type { StandardTemplateEntry, TenderUiConfig } from "@/features/tender-ui/types";

function toTemplateEntries(order: string[]): StandardTemplateEntry[] {
  return order.map((standardId, index) => ({ standard_id: standardId, priority: index + 1 }));
}

function uniqueCheckTypes(input: string): string[] {
  const values = input
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return [...new Set(values)];
}

function sanitizeConfig(config: TenderUiConfig): TenderUiConfig {
  const standardIds = new Set(config.standards_catalog.map((standard) => standard.standard_id));

  const templates = config.templates.map((template) => {
    const seen = new Set<string>();
    const order = template.standards
      .slice()
      .sort((a, b) => a.priority - b.priority)
      .map((entry) => entry.standard_id)
      .filter((standardId) => {
        if (!standardIds.has(standardId) || seen.has(standardId)) {
          return false;
        }
        seen.add(standardId);
        return true;
      });

    return {
      ...template,
      standards: toTemplateEntries(order),
    };
  });

  const defaultTemplateExists = templates.some((template) => template.template_id === config.default_template_id);
  const defaultTemplateId = defaultTemplateExists ? config.default_template_id : templates[0]?.template_id ?? "";

  return {
    ...config,
    templates,
    default_template_id: defaultTemplateId,
    updated_at: new Date().toISOString(),
  };
}

export default function AdminSettingsPage() {
  const [systemConfig, setSystemConfig] = useState<TenderUiConfig | null>(null);
  const [draftConfig, setDraftConfig] = useState<TenderUiConfig | null>(null);
  const [activeTemplateId, setActiveTemplateId] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    let disposed = false;

    async function loadConfig(): Promise<void> {
      setLoading(true);
      setError("");
      setStatus("");

      try {
        const config = await fetchSystemConfig();
        const override = readAdminConfigOverride();
        const initial = override ?? config;

        if (!disposed) {
          setSystemConfig(cloneConfig(config));
          setDraftConfig(cloneConfig(initial));
          setActiveTemplateId(initial.default_template_id || initial.templates[0]?.template_id || "");
        }
      } catch (loadError) {
        if (!disposed) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load config");
          setSystemConfig(null);
          setDraftConfig(null);
        }
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    }

    void loadConfig();

    return () => {
      disposed = true;
    };
  }, []);

  const standards = draftConfig?.standards_catalog ?? [];
  const templates = draftConfig?.templates ?? [];

  const templateOrder = useMemo(() => {
    if (!draftConfig || !activeTemplateId) {
      return [];
    }
    return getTemplateOrder(draftConfig, activeTemplateId);
  }, [activeTemplateId, draftConfig]);

  function updateTemplateOrder(nextOrder: string[]): void {
    if (!activeTemplateId) {
      return;
    }

    setDraftConfig((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        templates: current.templates.map((template) => {
          if (template.template_id !== activeTemplateId) {
            return template;
          }

          return {
            ...template,
            standards: toTemplateEntries(nextOrder),
          };
        }),
      };
    });
  }

  function moveTemplateStandard(standardId: string, direction: -1 | 1): void {
    const index = templateOrder.indexOf(standardId);
    if (index < 0) {
      return;
    }

    const target = index + direction;
    if (target < 0 || target >= templateOrder.length) {
      return;
    }

    const next = templateOrder.slice();
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    updateTemplateOrder(next);
  }

  function toggleTemplateStandard(standardId: string): void {
    if (templateOrder.includes(standardId)) {
      updateTemplateOrder(templateOrder.filter((id) => id !== standardId));
      return;
    }

    updateTemplateOrder([...templateOrder, standardId]);
  }

  function addStandard(): void {
    setDraftConfig((current) => {
      if (!current) {
        return current;
      }

      const standardId = `custom_${Date.now().toString(36)}`;
      return {
        ...current,
        standards_catalog: [
          ...current.standards_catalog,
          {
            standard_id: standardId,
            name: "New Standard",
            description: "Describe what this standard validates.",
            default_priority: current.standards_catalog.length + 1,
            enabled_by_default: false,
            check_types: ["deadline"],
          },
        ],
      };
    });
  }

  function removeStandard(standardId: string): void {
    setDraftConfig((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        standards_catalog: current.standards_catalog.filter((standard) => standard.standard_id !== standardId),
        templates: current.templates.map((template) => {
          const order = template.standards
            .slice()
            .sort((a, b) => a.priority - b.priority)
            .map((entry) => entry.standard_id)
            .filter((id) => id !== standardId);

          return {
            ...template,
            standards: toTemplateEntries(order),
          };
        }),
      };
    });
  }

  function updateStandardField(standardId: string, field: "name" | "description", value: string): void {
    setDraftConfig((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        standards_catalog: current.standards_catalog.map((standard) => {
          if (standard.standard_id !== standardId) {
            return standard;
          }

          return {
            ...standard,
            [field]: value,
          };
        }),
      };
    });
  }

  function updateStandardEnabled(standardId: string, enabled: boolean): void {
    setDraftConfig((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        standards_catalog: current.standards_catalog.map((standard) => {
          if (standard.standard_id !== standardId) {
            return standard;
          }

          return {
            ...standard,
            enabled_by_default: enabled,
          };
        }),
      };
    });
  }

  function updateStandardCheckTypes(standardId: string, value: string): void {
    setDraftConfig((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        standards_catalog: current.standards_catalog.map((standard) => {
          if (standard.standard_id !== standardId) {
            return standard;
          }

          return {
            ...standard,
            check_types: uniqueCheckTypes(value),
          };
        }),
      };
    });
  }

  function saveSettings(): void {
    if (!draftConfig) {
      return;
    }

    const normalized = sanitizeConfig(draftConfig);
    saveAdminConfigOverride(normalized);
    setDraftConfig(cloneConfig(normalized));
    setStatus("Settings saved to admin override. Tender page will read this config on refresh.");
  }

  function resetToSystem(): void {
    if (!systemConfig) {
      return;
    }

    clearAdminConfigOverride();
    const clean = cloneConfig(systemConfig);
    setDraftConfig(clean);
    setActiveTemplateId(clean.default_template_id || clean.templates[0]?.template_id || "");
    setStatus("Override cleared. Reverted to system config.");
  }

  return (
    <main className="c-page-wrap">
      <header className="c-page-header">
        <div>
          <p className="c-page-kicker">Admin Console</p>
          <h1 className="c-page-title">Tender Standard & Template Settings</h1>
          <p className="c-page-subtitle">
            Manage standard catalog and template priority. Tender workspace reads this config as runtime source.
          </p>
        </div>
        <div className="c-inline-actions">
          <Link className="c-btn c-btn-secondary" href="/tender">
            Back To Tender
          </Link>
          <button className="c-btn c-btn-secondary" type="button" onClick={resetToSystem}>
            Reset To System
          </button>
          <button className="c-btn c-btn-primary" type="button" onClick={saveSettings}>
            Save Settings
          </button>
        </div>
      </header>

      {loading ? <p className="c-empty">Loading configuration...</p> : null}
      {error ? <p className="c-alert">{error}</p> : null}
      {status ? <p className="c-notice">{status}</p> : null}

      {!loading && !error && draftConfig ? (
        <div className="c-admin-grid">
          <section className="c-section">
            <div className="c-section-header">
              <div>
                <h2 className="c-section-title">Standard Catalog</h2>
                <p className="c-section-desc">Edit names, check types and defaults for each standard.</p>
              </div>
              <button className="c-btn c-btn-secondary" type="button" onClick={addStandard}>
                Add Standard
              </button>
            </div>

            <div className="c-admin-list">
              {standards.map((standard) => (
                <article key={standard.standard_id} className="c-admin-row">
                  <div className="c-admin-row-head">
                    <p className="c-standard-id">{standard.standard_id}</p>
                    <button className="c-link-btn" type="button" onClick={() => removeStandard(standard.standard_id)}>
                      Remove
                    </button>
                  </div>

                  <div className="c-admin-fields">
                    <label className="c-admin-field">
                      <span className="c-admin-label">Name</span>
                      <input
                        className="c-input"
                        type="text"
                        value={standard.name}
                        onChange={(event) => updateStandardField(standard.standard_id, "name", event.target.value)}
                      />
                    </label>

                    <label className="c-admin-field">
                      <span className="c-admin-label">Check Types (comma separated)</span>
                      <input
                        className="c-input"
                        type="text"
                        value={standard.check_types.join(", ")}
                        onChange={(event) => updateStandardCheckTypes(standard.standard_id, event.target.value)}
                      />
                    </label>
                  </div>

                  <label className="c-admin-field">
                    <span className="c-admin-label">Description</span>
                    <textarea
                      className="c-textarea"
                      value={standard.description}
                      onChange={(event) => updateStandardField(standard.standard_id, "description", event.target.value)}
                    />
                  </label>

                  <label className="c-checkline" htmlFor={`enabled-${standard.standard_id}`}>
                    <input
                      id={`enabled-${standard.standard_id}`}
                      type="checkbox"
                      checked={standard.enabled_by_default}
                      onChange={(event) => updateStandardEnabled(standard.standard_id, event.target.checked)}
                    />
                    <span>Enabled by default</span>
                  </label>
                </article>
              ))}
            </div>
          </section>

          <section className="c-section">
            <div className="c-section-header">
              <div>
                <h2 className="c-section-title">Template & Priority</h2>
                <p className="c-section-desc">Control template membership and order in NEC flow.</p>
              </div>
            </div>

            <div className="c-admin-fields c-admin-fields-2col">
              <label className="c-admin-field">
                <span className="c-admin-label">Default Template</span>
                <select
                  className="c-select-input"
                  value={draftConfig.default_template_id}
                  onChange={(event) => {
                    const nextTemplateId = event.target.value;
                    setDraftConfig((current) =>
                      current
                        ? {
                            ...current,
                            default_template_id: nextTemplateId,
                          }
                        : current,
                    );
                    setActiveTemplateId(nextTemplateId);
                  }}
                >
                  {templates.map((template) => (
                    <option key={template.template_id} value={template.template_id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="c-admin-field">
                <span className="c-admin-label">Template To Edit</span>
                <select
                  className="c-select-input"
                  value={activeTemplateId}
                  onChange={(event) => setActiveTemplateId(event.target.value)}
                >
                  {templates.map((template) => (
                    <option key={template.template_id} value={template.template_id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="c-admin-list">
              {standards.map((standard) => {
                const inTemplate = templateOrder.includes(standard.standard_id);
                const index = templateOrder.indexOf(standard.standard_id);

                return (
                  <article key={standard.standard_id} className="c-admin-template-row">
                    <label className="c-checkline" htmlFor={`template-${standard.standard_id}`}>
                      <input
                        id={`template-${standard.standard_id}`}
                        type="checkbox"
                        checked={inTemplate}
                        onChange={() => toggleTemplateStandard(standard.standard_id)}
                      />
                      <span>
                        {standard.name} <span className="u-muted">({standard.standard_id})</span>
                      </span>
                    </label>

                    {inTemplate ? (
                      <div className="c-priority-controls">
                        <span className="c-badge is-priority">P{index + 1}</span>
                        <button
                          className="c-icon-btn"
                          type="button"
                          disabled={index === 0}
                          onClick={() => moveTemplateStandard(standard.standard_id, -1)}
                        >
                          ↑
                        </button>
                        <button
                          className="c-icon-btn"
                          type="button"
                          disabled={index === templateOrder.length - 1}
                          onClick={() => moveTemplateStandard(standard.standard_id, 1)}
                        >
                          ↓
                        </button>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
