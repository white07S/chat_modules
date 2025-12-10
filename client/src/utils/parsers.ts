import JSON5 from 'json5';

export interface SqlParseResult {
  rows: Array<Record<string, unknown>>;
  error?: string;
}

export interface ChartParseResult {
  option: Record<string, unknown> | null;
  error?: string;
}

const stripCodeFences = (input: string): string => {
  let text = input.trim();

  if (text.startsWith('```')) {
    text = text.replace(/^```(?:[\w+-]+)?\s*/i, '');
  }

  if (text.endsWith('```')) {
    text = text.replace(/```$/i, '');
  }

  return text.trim();
};

const cleanText = (value?: string | null): string => {
  if (!value) {
    return '';
  }
  return stripCodeFences(value);
};

export const safeJsonParse = <T = unknown>(rawText?: string | null): T | undefined => {
  if (!rawText) {
    return undefined;
  }

  const cleaned = cleanText(rawText);

  try {
    return JSON5.parse(cleaned) as T;
  } catch (error) {
    return undefined;
  }
};

export const collectTextFromToolContent = (content: unknown): string => {
  if (!content) {
    return '';
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }
        if (part && typeof part === 'object' && 'text' in part) {
          const textPart = (part as { text?: string }).text;
          return textPart || '';
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  if (typeof content === 'string') {
    return content;
  }

  if (typeof content === 'object' && 'text' in (content as { text?: string })) {
    return ((content as { text?: string }).text) || '';
  }

  return '';
};

export const parseSqlResult = (rawText?: string | null): SqlParseResult => {
  if (!rawText) {
    return { rows: [] };
  }

  const cleaned = cleanText(rawText);

  try {
    const parsed = JSON5.parse(cleaned);

    if (Array.isArray(parsed)) {
      return { rows: parsed as Array<Record<string, unknown>> };
    }

    if (parsed && typeof parsed === 'object') {
      return { rows: [parsed as Record<string, unknown>] };
    }

    return {
      rows: [],
      error: 'SQL result was not an array or object.',
    };
  } catch (error) {
    return {
      rows: [],
      error: error instanceof Error ? error.message : 'Failed to parse SQL result.',
    };
  }
};

export const parseChartSpec = (rawText?: string | null): ChartParseResult => {
  if (!rawText) {
    return {
      option: null,
      error: 'No chart specification returned.',
    };
  }

  const cleaned = cleanText(rawText);

  try {
    const parsed = JSON5.parse(cleaned);
    if (parsed && typeof parsed === 'object') {
      return {
        option: parsed as Record<string, unknown>,
      };
    }

    return {
      option: null,
      error: 'Chart specification is not a valid object.',
    };
  } catch (error) {
    return {
      option: null,
      error: error instanceof Error ? error.message : 'Failed to parse chart specification.',
    };
  }
};
