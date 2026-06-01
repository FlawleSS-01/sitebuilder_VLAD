import "./AutoGenerationOverlay.css";
import GenerationCostPanel, {
  type GenerationCost,
} from "./GenerationCostPanel";

export interface AutoStep {
  key: string;
  label: string;
  status: "pending" | "running" | "done" | "error" | "skipped";
  error?: string;
}

interface AutoGenerationOverlayProps {
  steps: AutoStep[];
  status: "pending" | "running" | "done" | "error";
  error?: string;
  cost?: GenerationCost;
}

const AutoGenerationOverlay: React.FC<AutoGenerationOverlayProps> = ({
  steps,
  status,
  error,
  cost,
}) => {
  const isDone = status === "done";
  const isError = status === "error";

  return (
    <div className="auto-gen-overlay" role="dialog" aria-modal="true">
      <div className="auto-gen-panel">
        <h2>
          {isDone
            ? "Сайт готов"
            : isError
              ? "Ошибка автогенерации"
              : "Идёт автогенерация сайта…"}
        </h2>
        {error && (
          <div className="auto-gen-error">
            <strong>Ошибка:</strong> {error}
          </div>
        )}
        <ul className="auto-gen-steps">
          {steps.map((step) => (
            <li
              key={step.key}
              className={`auto-gen-step auto-gen-step--${step.status}`}
            >
              <span className="auto-gen-step-icon">
                {step.status === "done"
                  ? "✓"
                  : step.status === "running"
                    ? "…"
                    : step.status === "error"
                      ? "!"
                      : "○"}
              </span>
              <span className="auto-gen-step-label">{step.label}</span>
              {step.error && (
                <span className="auto-gen-step-error">{step.error}</span>
              )}
            </li>
          ))}
        </ul>
        {cost && (
          <GenerationCostPanel
            cost={cost}
            compact
            title={
              isDone
                ? "Стоимость генерации"
                : "Текущая оценка стоимости"
            }
          />
        )}
        {!isDone && !isError && (
          <p className="auto-gen-hint">
            Не закрывайте вкладку. Процесс продолжится на сервере, но прогресс
            обновляется здесь.
          </p>
        )}
      </div>
    </div>
  );
};

export default AutoGenerationOverlay;
