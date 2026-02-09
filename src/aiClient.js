/**
 * AI Client for generating human-friendly explanations
 *
 * Supports multiple AI providers:
 *   - openrouter: OpenRouter API (access to multiple models)
 *   - claude: Anthropic Claude API
 *   - openai: OpenAI API
 *   - gemini: Google Gemini API
 *   - ollama: Local Ollama instance
 *
 * Configuration via environment variables:
 *   OPENROUTER_API_KEY - For OpenRouter
 *   ANTHROPIC_API_KEY  - For Claude
 *   OPENAI_API_KEY     - For OpenAI
 *   IA_GEMINI_API_KEY     - For Gemini
 *   OLLAMA_URL         - For Ollama (default: http://localhost:11434)
 */

// Provider configurations
const PROVIDERS = {
  openrouter: {
    name: "OpenRouter",
    apiUrl: "https://openrouter.ai/api/v1/chat/completions",
    envKey: "OPENROUTER_API_KEY",
    defaultModel: "anthropic/claude-3-haiku",
    models: [
      { id: "anthropic/claude-3-haiku", name: "Claude 3 Haiku" },
      { id: "anthropic/claude-3-sonnet", name: "Claude 3 Sonnet" },
      { id: "anthropic/claude-3-opus", name: "Claude 3 Opus" },
      { id: "openai/gpt-4o-mini", name: "GPT-4o Mini" },
      { id: "openai/gpt-4o", name: "GPT-4o" },
      { id: "google/gemini-pro", name: "Gemini Pro" },
      { id: "meta-llama/llama-3-70b-instruct", name: "Llama 3 70B" }
    ]
  },
  claude: {
    name: "Claude (Anthropic)",
    apiUrl: "https://api.anthropic.com/v1/messages",
    envKey: "ANTHROPIC_API_KEY",
    defaultModel: "claude-3-haiku-20240307",
    models: [
      { id: "claude-3-haiku-20240307", name: "Claude 3 Haiku" },
      { id: "claude-3-sonnet-20240229", name: "Claude 3 Sonnet" },
      { id: "claude-3-opus-20240229", name: "Claude 3 Opus" },
      { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet" }
    ]
  },
  openai: {
    name: "OpenAI",
    apiUrl: "https://api.openai.com/v1/chat/completions",
    envKey: "OPENAI_API_KEY",
    defaultModel: "gpt-4o-mini",
    models: [
      { id: "gpt-4o-mini", name: "GPT-4o Mini" },
      { id: "gpt-4o", name: "GPT-4o" },
      { id: "gpt-4-turbo", name: "GPT-4 Turbo" },
      { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo" }
    ]
  },
  gemini: {
    name: "Google Gemini",
    apiUrl: "https://generativelanguage.googleapis.com/v1beta/models",
    envKey: "IA_GEMINI_API_KEY",
    defaultModel: "gemini-3-flash-preview",
    models: [
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash (Recommended)" },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
      { id: "gemini-3-flash-preview", name: "Gemini 3 Flash Preview" },
      { id: "gemini-3-pro-preview", name: "Gemini 3 Pro Preview" }
    ]
  },
  ollama: {
    name: "Ollama (Local)",
    apiUrl: process.env.OLLAMA_URL || "http://localhost:11434",
    envKey: null, // No API key needed
    defaultModel: "llama3",
    models: [
      { id: "llama3", name: "Llama 3" },
      { id: "llama3:70b", name: "Llama 3 70B" },
      { id: "mistral", name: "Mistral" },
      { id: "mixtral", name: "Mixtral" },
      { id: "codellama", name: "Code Llama" },
      { id: "phi3", name: "Phi-3" }
    ]
  }
};

/**
 * Get available providers and their models
 */
export function getAvailableProviders() {
  const available = [];

  for (const [id, config] of Object.entries(PROVIDERS)) {
    const hasKey = config.envKey ? !!process.env[config.envKey] : true;
    available.push({
      id,
      name: config.name,
      available: hasKey || id === 'ollama',
      models: config.models,
      defaultModel: config.defaultModel
    });
  }

  return available;
}

/**
 * Get the default provider (first one with API key configured)
 */
export function getDefaultProvider() {
  // Priority order - Gemini first as default
  const priority = ['gemini', 'openrouter', 'claude', 'openai', 'ollama'];

  for (const providerId of priority) {
    const config = PROVIDERS[providerId];
    if (config.envKey && process.env[config.envKey]) {
      return providerId;
    }
  }

  // Fallback to ollama (no key needed)
  return 'ollama';
}

/**
 * Generate an explanation using the AI
 *
 * @param {object} prompt - Safe prompt from buildExplainerPrompt()
 * @param {object} options - Configuration options
 * @param {string} options.provider - AI provider (openrouter, claude, openai, gemini, ollama)
 * @param {string} options.model - Model to use
 * @param {string} options.apiKey - API key (overrides env var)
 * @returns {object} AI-generated explanation
 */
export async function generateExplanation(prompt, options = {}) {
  const provider = options.provider || getDefaultProvider();
  const providerConfig = PROVIDERS[provider];

  if (!providerConfig) {
    return {
      success: false,
      error: "INVALID_PROVIDER",
      message: `Unknown provider: ${provider}`
    };
  }

  const apiKey = options.apiKey || (providerConfig.envKey ? process.env[providerConfig.envKey] : null);
  const model = options.model || providerConfig.defaultModel;

  // Handle unverified signatures - return fixed response, don't call AI
  if (prompt.skipAI) {
    return {
      success: true,
      source: "fixed",
      explanation: prompt.fixedResponse,
      metadata: prompt.metadata
    };
  }

  // Validate API key (except for Ollama)
  if (provider !== 'ollama' && !apiKey) {
    return {
      success: false,
      error: "NO_API_KEY",
      message: `${providerConfig.name} API key is required. Set ${providerConfig.envKey} environment variable.`
    };
  }

  // Validate prompt safety before sending
  const { validatePromptSafety } = await import("./explainerPrompt.js");
  const safetyCheck = validatePromptSafety(prompt);
  if (!safetyCheck.safe) {
    return {
      success: false,
      error: "UNSAFE_PROMPT",
      message: "Prompt contains potentially unsafe content",
      issues: safetyCheck.issues
    };
  }

  try {
    let response;

    switch (provider) {
      case 'openrouter':
        response = await callOpenRouter(prompt, apiKey, model);
        break;
      case 'claude':
        response = await callClaude(prompt, apiKey, model);
        break;
      case 'openai':
        response = await callOpenAI(prompt, apiKey, model);
        break;
      case 'gemini':
        response = await callGemini(prompt, apiKey, model);
        break;
      case 'ollama':
        response = await callOllama(prompt, model);
        break;
      default:
        throw new Error(`Provider ${provider} not implemented`);
    }

    return {
      success: true,
      source: "ai",
      provider,
      model,
      explanation: response,
      metadata: prompt.metadata
    };
  } catch (error) {
    return {
      success: false,
      error: "API_ERROR",
      message: error.message,
      provider,
      model
    };
  }
}

/**
 * Call OpenRouter API
 */
async function callOpenRouter(prompt, apiKey, model) {
  const response = await fetch(PROVIDERS.openrouter.apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": "https://github.com/signguard-ai",
      "X-Title": "SignGuard AI"
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user }
      ],
      temperature: 0.3,
      max_tokens: 500
    }),
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[OpenRouter] API error (${response.status}):`, errorBody);
    throw new Error(`OpenRouter API error (${response.status})`);
  }

  const data = await response.json();
  return parseOpenAIResponse(data);
}

/**
 * Call Anthropic Claude API
 */
async function callClaude(prompt, apiKey, model) {
  const response = await fetch(PROVIDERS.claude.apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      max_tokens: 500,
      system: prompt.system,
      messages: [
        { role: "user", content: prompt.user }
      ]
    }),
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[Claude] API error (${response.status}):`, errorBody);
    throw new Error(`Claude API error (${response.status})`);
  }

  const data = await response.json();

  if (!data.content || data.content.length === 0) {
    throw new Error("No response from Claude");
  }

  return {
    text: data.content[0].text.trim(),
    raw: data.content[0].text
  };
}

/**
 * Call OpenAI API
 */
async function callOpenAI(prompt, apiKey, model) {
  const response = await fetch(PROVIDERS.openai.apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user }
      ],
      temperature: 0.3,
      max_tokens: 500
    }),
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[OpenAI] API error (${response.status}):`, errorBody);
    throw new Error(`OpenAI API error (${response.status})`);
  }

  const data = await response.json();
  return parseOpenAIResponse(data);
}

/**
 * Call Google Gemini API
 */
async function callGemini(prompt, apiKey, model) {
  const url = `${PROVIDERS.gemini.apiUrl}/${model}:generateContent?key=${apiKey}`;

  console.log(`[Gemini] Calling model: ${model}`);
  console.log(`[Gemini] URL: ${PROVIDERS.gemini.apiUrl}/${model}:generateContent`);

  const requestBody = {
    contents: [{
      parts: [{
        text: `${prompt.system}\n\n${prompt.user}`
      }]
    }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 1024
    }
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(60000)
    });

    console.log(`[Gemini] Response status: ${response.status}`);

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[Gemini] Error response:`, errorBody);
      throw new Error(`Gemini API error (${response.status})`);
    }

    const data = await response.json();
    console.log(`[Gemini] Response received, candidates:`, data.candidates?.length || 0);

    if (!data.candidates || data.candidates.length === 0) {
      console.error(`[Gemini] No candidates in response:`, JSON.stringify(data, null, 2));
      throw new Error("No response from Gemini");
    }

    const text = data.candidates[0].content?.parts?.[0]?.text;
    if (!text) {
      console.error(`[Gemini] Empty text in response:`, JSON.stringify(data.candidates[0], null, 2));
      throw new Error("Empty response from Gemini");
    }

    console.log(`[Gemini] Success! Response length: ${text.length} chars`);

    return {
      text: text.trim(),
      raw: text
    };
  } catch (error) {
    console.error(`[Gemini] Exception:`, error.message);
    throw error;
  }
}

/**
 * Call local Ollama API
 */
async function callOllama(prompt, model) {
  const baseUrl = process.env.OLLAMA_URL || "http://localhost:11434";

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user }
      ],
      stream: false,
      options: {
        temperature: 0.3
      }
    }),
    signal: AbortSignal.timeout(60000) // Longer timeout for local models
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[Ollama] API error (${response.status}):`, errorBody);
    throw new Error(`Ollama API error (${response.status})`);
  }

  const data = await response.json();

  if (!data.message?.content) {
    throw new Error("No response from Ollama");
  }

  return {
    text: data.message.content.trim(),
    raw: data.message.content
  };
}

/**
 * Parse OpenAI-style response (used by OpenRouter and OpenAI)
 */
function parseOpenAIResponse(response) {
  if (!response.choices || response.choices.length === 0) {
    throw new Error("No response from AI model");
  }

  const content = response.choices[0].message?.content;
  if (!content) {
    throw new Error("Empty response from AI model");
  }

  return {
    text: content.trim(),
    raw: content
  };
}

/**
 * Check if any API key is configured
 */
export function hasApiKey() {
  return !!(
    process.env.OPENROUTER_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.IA_GEMINI_API_KEY
  );
}

/**
 * Get the first available API key
 */
export function getApiKey() {
  return (
    process.env.OPENROUTER_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.IA_GEMINI_API_KEY ||
    null
  );
}

export default {
  generateExplanation,
  getAvailableProviders,
  getDefaultProvider,
  hasApiKey,
  getApiKey
};
