import { TenderAppShell } from "../../components/layout/TenderAppShell";
import { ComplianceCard } from "../../components/report/ComplianceCard";
import { PdfWorkspace } from "../../components/pdf/PdfWorkspace";

export default function TenderPage() {
  return (
    <TenderAppShell
      sidebar={
        <div style={{ padding: "16px", display: "grid", gap: "16px" }}>
          <ComplianceCard
            id="EMP-001-DL"
            title="Environmental Management Plan (PART 1)"
            summary="The Contractor shall submit the draft EMP for review and revision."
            severity="major"
            status="consistent"
            confidence={0.95}
            tags={["Environmental Management Plan", "Supervising Officer"]}
          />
        </div>
      }
      workspace={<PdfWorkspace fileName="I-EP_SP_174_20-COC-0.pdf" currentPage={1} />}
    />
  );
}
