export interface AiConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
}

export function getAiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig | null {
  const apiKey = normalizeEnvValue(env.AI_API_KEY);
  const model = normalizeEnvValue(env.AI_MODEL);
  const baseUrl = normalizeEnvValue(env.AI_BASE_URL);

  if (!apiKey || !model || !baseUrl) {
    return null;
  }

  return {
    apiKey,
    model,
    baseUrl: baseUrl.replace(/\/+$/, "")
  };
}

function normalizeEnvValue(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
