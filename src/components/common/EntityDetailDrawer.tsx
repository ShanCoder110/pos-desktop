import type { ReactNode } from "react";
import { Clock, Pencil } from "lucide-react";
import { Button } from "@/components/common/Button";
import { Drawer } from "@/components/common/Drawer";
import { cn, formatDetailDate } from "@/utils/format";

export type DetailSummaryTone = "neutral" | "owe" | "advance" | "ok" | "danger" | "warn";

export type DetailSummaryCard = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: DetailSummaryTone;
  icon?: ReactNode;
};

export type DetailField = {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  emptyHint?: string;
};

export type DetailIdentity = {
  name: string;
  reference?: string;
  referenceLabel?: string;
  badge?: ReactNode;
  icon?: ReactNode;
  tone?: "teal" | "blue" | "violet" | "amber" | "rose";
};

export type DetailActionTone = "accent" | "warn" | "info" | "edit" | "danger";

export type DetailAction = {
  label: string;
  description?: string;
  icon?: ReactNode;
  tone?: DetailActionTone;
  onClick: () => void;
};

function actionToneClass(tone?: DetailActionTone) {
  return cn(
    tone === "accent" && "is-accent",
    tone === "warn" && "is-warn",
    tone === "info" && "is-info",
    tone === "edit" && "is-edit",
    tone === "danger" && "is-danger",
  );
}

export type DetailMeta = {
  createdAt?: string;
  updatedAt?: string;
};

function summaryToneClass(tone?: DetailSummaryTone) {
  return cn(
    tone === "owe" && "is-owe",
    tone === "advance" && "is-advance",
    tone === "ok" && "is-ok",
    tone === "danger" && "is-danger",
    tone === "warn" && "is-warn",
  );
}

function fieldIsEmpty(value: ReactNode) {
  if (value === null || value === undefined || value === false) return true;
  if (typeof value === "string") return value.trim() === "" || value.trim() === "—";
  return false;
}

export function EntityDetailPanel({
  identity,
  summaries = [],
  fieldsSectionTitle = "Details",
  fields,
  onEditFields,
  actions = [],
  meta,
}: {
  identity?: DetailIdentity;
  summaries?: DetailSummaryCard[];
  fieldsSectionTitle?: string;
  fields: DetailField[];
  onEditFields?: () => void;
  actions?: DetailAction[];
  meta?: DetailMeta;
}) {
  return (
    <div className="entity-detail">
      {identity ? (
        <div className="entity-detail-hero">
          <div
            className={cn(
              "entity-detail-avatar",
              identity.tone ? `is-${identity.tone}` : "is-teal",
            )}
          >
            {identity.icon ?? identity.name.trim().charAt(0).toUpperCase()}
          </div>
          <div className="entity-detail-hero-copy">
            <div className="entity-detail-hero-top">
              <h3>{identity.name}</h3>
              {identity.badge}
            </div>
            {identity.reference ? (
              <p className="entity-detail-reference">
                {identity.referenceLabel ? <span>{identity.referenceLabel}</span> : null}
                <code>{identity.reference}</code>
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {summaries.length ? (
        <div className={cn("entity-detail-summaries", summaries.length === 1 && "is-single")}>
          {summaries.map((card) => (
            <div
              key={card.label}
              className={cn("entity-detail-summary", summaryToneClass(card.tone))}
            >
              {card.icon ? <span className="entity-detail-summary-icon">{card.icon}</span> : null}
              <div className="entity-detail-summary-body">
                <span className="entity-detail-summary-label">{card.label}</span>
                <div className="entity-detail-summary-value">
                  <strong>{card.value}</strong>
                  {card.hint ? <small>{card.hint}</small> : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <section className="entity-detail-section">
        <header className="entity-detail-section-head">
          <h4>{fieldsSectionTitle}</h4>
          {onEditFields ? (
            <Button size="sm" icon={<Pencil size={13} />} onClick={onEditFields}>
              Edit
            </Button>
          ) : null}
        </header>
        <dl className="entity-detail-fields">
          {fields.map((field) => {
            const empty = fieldIsEmpty(field.value);
            return (
              <div key={field.label} className="entity-detail-field">
                {field.icon ? <span className="entity-detail-field-icon">{field.icon}</span> : null}
                <div className="entity-detail-field-copy">
                  <dt>{field.label}</dt>
                  <dd className={empty && field.emptyHint ? "is-empty" : undefined}>
                    {empty && field.emptyHint ? "—" : field.value}
                    {empty && field.emptyHint ? <small>{field.emptyHint}</small> : null}
                  </dd>
                </div>
              </div>
            );
          })}
        </dl>
      </section>

      {actions.length ? (
        <div className="entity-detail-actions">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={cn("entity-detail-action", actionToneClass(action.tone))}
              onClick={action.onClick}
            >
              {action.icon ? (
                <span className="entity-detail-action-icon">{action.icon}</span>
              ) : null}
              <span className="entity-detail-action-copy">
                <strong>{action.label}</strong>
                {action.description ? <small>{action.description}</small> : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {meta && (meta.createdAt || meta.updatedAt) ? (
        <div className="entity-detail-meta">
          <Clock size={13} aria-hidden />
          <div className="entity-detail-meta-copy">
            {meta.createdAt ? <span>Created {formatDetailDate(meta.createdAt)}</span> : null}
            {meta.updatedAt ? <span>Updated {formatDetailDate(meta.updatedAt)}</span> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function EntityDetailDrawer({
  open,
  title,
  subtitle,
  onClose,
  identity,
  summaries,
  fieldsSectionTitle,
  fields,
  onEditFields,
  actions,
  meta,
  size = "md",
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  identity?: DetailIdentity;
  summaries?: DetailSummaryCard[];
  fieldsSectionTitle?: string;
  fields: DetailField[];
  onEditFields?: () => void;
  actions?: DetailAction[];
  meta?: DetailMeta;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  return (
    <Drawer
      open={open}
      title={title}
      subtitle={subtitle ? <p className="ui-drawer-subtitle">{subtitle}</p> : undefined}
      onClose={onClose}
      size={size}
      footer={<Button onClick={onClose}>Close</Button>}
    >
      <EntityDetailPanel
        identity={identity}
        summaries={summaries}
        fieldsSectionTitle={fieldsSectionTitle}
        fields={fields}
        onEditFields={onEditFields}
        actions={actions}
        meta={meta}
      />
    </Drawer>
  );
}
