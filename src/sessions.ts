import { getMcpServers } from "./fetch-pluggedinmcp.js";
import { ServerParameters } from "./types.js"; // Corrected import path
import {
  ConnectedClient,
  createPluggedinMCPClient,
  connectPluggedinMCPClient,
} from "./client.js";
import { getSessionKey } from "./utils.js";

const _sessions: Record<string, ConnectedClient> = {};

// Removed logger

export const getSession = async (
  sessionKey: string,
  uuid: string,
  params: ServerParameters
): Promise<ConnectedClient | undefined> => {
  if (sessionKey in _sessions) {
    return _sessions[sessionKey];
  } else {
    // Close existing session for this UUID if it exists with a different hash
    const old_session_keys = Object.keys(_sessions).filter((k) =>
      k.startsWith(`${uuid}_`)
    );

    await Promise.allSettled(
      old_session_keys.map(async (old_session_key) => {
        await _sessions[old_session_key].cleanup();
        delete _sessions[old_session_key];
      })
    );

    const { client, transport } = createPluggedinMCPClient(params);
    if (!client || !transport) {
      return;
    }

    const newClient = await connectPluggedinMCPClient(client, transport);
    if (!newClient) {
      return;
    }

    _sessions[sessionKey] = newClient;
    
    // Maintain global.sessions
    if (!(global as any).sessions) {
      (global as any).sessions = {};
    }
    (global as any).sessions[sessionKey] = newClient;

    return newClient;
  }
};

export const initSessions = async (): Promise<void> => {
  const serverParams = await getMcpServers(true);

  await Promise.allSettled(
    Object.entries(serverParams).map(async ([uuid, params]) => {
      const sessionKey = getSessionKey(uuid, params);
      try {
        await getSession(sessionKey, uuid, params);
      } catch (error) {
        // Log errors during initial session establishment attempt
        // logger.error(`Failed to initialize session for ${params.name || uuid} during initSessions:`, error); // Removed logging
      }
    })
  );
};

export const cleanupAllSessions = async (): Promise<void> => {
  await Promise.allSettled(
    Object.entries(_sessions).map(async ([sessionKey, session]) => {
      await session.cleanup();
      delete _sessions[sessionKey];
      
      // Clean up from global.sessions
      if ((global as any).sessions && (global as any).sessions[sessionKey]) {
        delete (global as any).sessions[sessionKey];
      }
    })
  );
};
