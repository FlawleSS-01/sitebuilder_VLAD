import "./GenerationCostPanel.css";

export interface GenerationCost {
  text: number;
  images: number;
  favicon: number;
  other: number;
  total: number;
}

/** USD для отображения ($0.XX). */
export function formatGenerationUsd(amount: number): string {
  return amount.toFixed(2);
}

interface GenerationCostPanelProps {
  cost: GenerationCost;
  title?: string;
  compact?: boolean;
  hint?: string;
}

const GenerationCostPanel: React.FC<GenerationCostPanelProps> = ({
  cost,
  title = "Стоимость генерации",
  compact = false,
  hint,
}) => {
  return (
    <div
      className={`generation-cost-panel${compact ? " generation-cost-panel--compact" : ""}`}
    >
      <div className="generation-cost-panel__head">
        <strong>{title}:</strong>{" "}
        <span className="generation-cost-panel__total">
          ${formatGenerationUsd(cost.total)}
        </span>
      </div>
      <div className="generation-cost-breakdown">
        <span>тексты: ${formatGenerationUsd(cost.text)}</span>
        <span>изображения: ${formatGenerationUsd(cost.images)}</span>
        <span>favicon: ${formatGenerationUsd(cost.favicon)}</span>
        <span>прочее/API: ${formatGenerationUsd(cost.other)}</span>
        <span className="generation-cost-breakdown__total">
          итог: ${formatGenerationUsd(cost.total)}
        </span>
      </div>
      {hint && <p className="generation-cost-panel__hint">{hint}</p>}
    </div>
  );
};

export default GenerationCostPanel;
