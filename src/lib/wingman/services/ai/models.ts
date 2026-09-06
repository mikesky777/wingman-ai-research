/**
 * Authoritative model identifiers for the production AI stages (pure).
 *
 * Kept in a client-safe module so Settings can display exactly what production
 * uses without importing server-only provider code. Changing a value here
 * changes the model that stage actually calls — Settings never keeps its own
 * copy.
 */

export const TRIAGE_MODEL = "google/gemini-3.7-flash";
export const DEEP_RESEARCH_MODEL = "google/gemini-3.7-flash";
export const THESIS_MODEL = "google/gemini-3.7-flash";

export const AI_GATEWAY_PROVIDER = "lovable-ai-gateway";
