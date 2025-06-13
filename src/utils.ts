import crypto from "crypto";
import { ServerParameters } from "./types.js"; // Corrected import path

export const getSessionKey = (uuid: string, params: ServerParameters): string => {
  const hash = crypto.createHash("sha256");
  hash.update(JSON.stringify(params));
  return `${uuid}_${hash.digest("hex")}`;
};

export const sanitizeName = (name: string): string => {
  return name.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
};

// Helper function to get the API key, prioritizing argument over environment variable
export const getPluggedinMCPApiKey = (apiKey?: string): string | undefined => {
  // Prioritize argument, then environment variable
  return apiKey ?? process.env.PLUGGEDIN_API_KEY;
};

// Helper function to get the API base URL, prioritizing argument, then env var, then hardcoded default
export const getPluggedinMCPApiBaseUrl = (baseUrl?: string): string | undefined => {
  // Prioritize argument, then environment variable, then fallback
  return baseUrl ?? process.env.PLUGGEDIN_API_BASE_URL ?? 'https://plugged.in';
};

// Helper function to check if debug logging is enabled
export const isDebugEnabled = (): boolean => {
  return process.env.DEBUG === "true";
};

// Helper function to get default environment variables
export const getDefaultEnvironment = (): Record<string, string> => {
  const defaultEnv: Record<string, string> = {};
  if (process.env.PATH) {
    defaultEnv.PATH = process.env.PATH;
  }
  // Add other potentially necessary environment variables here
  // e.g., HOME, USER, LANG, LC_ALL
  if (process.env.HOME) defaultEnv.HOME = process.env.HOME;
  if (process.env.USER) defaultEnv.USER = process.env.USER;
  if (process.env.LANG) defaultEnv.LANG = process.env.LANG;
  if (process.env.LC_ALL) defaultEnv.LC_ALL = process.env.LC_ALL;

  return defaultEnv;
};
