/** Every expression supplied in Changli's EXP3 folder. */
export const expressionChoices = [
  { id: 'heart-eyes', label: 'Heart eyes', file: '爱心眼.exp3.json' },
  { id: 'blush', label: 'Blush', file: '脸红.exp3.json' },
  { id: 'angry', label: 'Angry', file: '生气.exp3.json' },
  { id: 'white-eyes', label: 'White eyes', file: '白眼.exp3.json' },
  { id: 'dark-face', label: 'Dark face', file: '黑脸.exp3.json' },
  { id: 'eye-cover', label: 'Eye cover', file: '眼罩.exp3.json' },
  { id: 'coat', label: 'Coat on / off', file: '外套穿脱.exp3.json' },
] as const;

export type ExpressionId = typeof expressionChoices[number]['id'];
export type ExpressionParameter = { Id: string; Value: number; Blend?: 'Add' | 'Multiply' | 'Overwrite' };
export type ModelExpression = { Parameters: ExpressionParameter[] };

export async function loadExpressions(signal: AbortSignal): Promise<Map<ExpressionId, ModelExpression>> {
  const entries = await Promise.all(expressionChoices.map(async choice => {
    const response = await fetch(`${import.meta.env.BASE_URL}models/changli/EXP3/${choice.file}`, { signal });
    if (!response.ok) throw new Error(`Could not load ${choice.label}.`);
    const expression: ModelExpression = await response.json();
    if (!Array.isArray(expression.Parameters) || expression.Parameters.some(p => typeof p.Id !== 'string' || !Number.isFinite(p.Value))) {
      throw new Error(`Invalid expression: ${choice.label}.`);
    }
    return [choice.id, expression] as const;
  }));
  return new Map(entries);
}
