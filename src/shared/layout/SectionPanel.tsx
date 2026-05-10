import type { ReactNode } from "react";

type SectionPanelProps = {
  title: string;
  eyebrow?: string;
  metadata?: ReactNode;
  controls?: ReactNode;
  children: ReactNode;
};

export function SectionPanel({ title, eyebrow, metadata, controls, children }: SectionPanelProps) {
  return (
    <section className="scientific-section">
      <div className="scientific-section-header">
        <div className="min-w-0">
          {eyebrow && <div className="section-eyebrow">{eyebrow}</div>}
          <h2 className="section-title">{title}</h2>
          {metadata && <div className="section-metadata">{metadata}</div>}
        </div>
      </div>
      {controls && <div className="section-controls">{controls}</div>}
      <div className="section-body">{children}</div>
    </section>
  );
}
