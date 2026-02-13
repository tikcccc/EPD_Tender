type Severity = "major" | "minor" | "info";
type Status = "consistent" | "inconsistent" | "unknown";

type ComplianceCardProps = {
  id: string;
  title: string;
  summary: string;
  severity: Severity;
  status: Status;
  confidence: number;
  tags: string[];
};

export function ComplianceCard(props: ComplianceCardProps) {
  const { id, title, summary, severity, status, confidence, tags } = props;
  return (
    <article className={`c-card ${status === "consistent" ? "is-consistent" : ""}`}>
      <div className="c-card-top">
        <h3>{title}</h3>
        <span className={`c-badge ${severity === "major" ? "is-major" : ""}`}>{severity.toUpperCase()}</span>
      </div>
      <p>{summary}</p>
      <div className="c-card-meta">
        {tags.map((tag) => (
          <span key={tag} className="c-chip">
            {tag}
          </span>
        ))}
      </div>
      <div className="u-muted u-mono">ID: {id} | Confidence: {confidence.toFixed(2)}</div>
    </article>
  );
}
