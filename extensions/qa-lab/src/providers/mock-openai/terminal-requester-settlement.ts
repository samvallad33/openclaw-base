import { asOptionalRecord } from "openclaw/plugin-sdk/string-coerce-runtime";

type TerminalRequester = {
  caseName: string;
  childSessionKey: string;
  agentId: string;
  sessionKey: string;
  sessionId: string;
};

type RequesterIdentity = Omit<TerminalRequester, "childSessionKey" | "sessionId">;

type SessionReader = {
  call(method: string, params: unknown, options: { timeoutMs: number }): Promise<unknown>;
};

export type QaTerminalRequesterSettlement = {
  bindGateway(gateway: SessionReader): void;
  settle(gateway: SessionReader): Promise<void>;
};

export function createTerminalRequesterSettleGate() {
  const settledChildren = new Set<string>();
  const requesters = new Map<string, TerminalRequester>();
  const generations = new Map<string, string>();
  let reader: SessionReader | undefined;
  const requesterKey = (requester: RequesterIdentity) =>
    `${requester.caseName}\n${requester.agentId}\n${requester.sessionKey}`;
  const readSession = async (gateway: SessionReader, requester: RequesterIdentity) => {
    const response = asOptionalRecord(
      await gateway.call(
        "sessions.list",
        {
          agentId: requester.agentId,
          search: requester.sessionKey,
          excludeSubagents: true,
          limit: 100,
        },
        { timeoutMs: 10_000 },
      ),
    );
    return Array.isArray(response?.sessions)
      ? response.sessions
          .map(asOptionalRecord)
          .find((row) => row?.key === requester.sessionKey && row.agentId === requester.agentId)
      : undefined;
  };
  const waiters = new Map<string, { promise: Promise<void>; finish: (error?: Error) => void }>();
  const childKey = (caseName: string, childSessionKey: string) => `${caseName}\n${childSessionKey}`;
  const markSettled = (key: string) => {
    settledChildren.add(key);
    const requester = requesters.get(key);
    if (requester) {
      generations.delete(requesterKey(requester));
    }
    requesters.delete(key);
    waiters.get(key)?.finish();
  };
  return {
    bindGateway(this: void, gateway: SessionReader) {
      reader = gateway;
    },
    async captureRequester(caseName: string, runtimeText: string) {
      const runtime = /\bRuntime:\s*([^\n]+)/u.exec(runtimeText)?.[1];
      const agentId = runtime && /\bagent=([^\s|]+)/u.exec(runtime)?.[1];
      const sessionKey = runtime && /\bsession=([^\s|]+)/u.exec(runtime)?.[1];
      if (!agentId || !sessionKey) {
        return undefined;
      }
      const requester = { caseName, agentId, sessionKey };
      const key = requesterKey(requester);
      const captured = generations.get(key);
      if (captured) {
        return { ...requester, sessionId: captured };
      }
      if (!reader) {
        throw new Error("terminal requester Gateway reader is not bound");
      }
      const session = await readSession(reader, requester);
      if (typeof session?.sessionId !== "string" || !session.sessionId) {
        throw new Error(`terminal requester session is unavailable: ${requester.sessionKey}`);
      }
      // Capture before the mock releases the spawn request. Prompt bytes omit
      // transcript generations; only the session owner supplies that identity.
      generations.set(key, session.sessionId);
      return { ...requester, sessionId: session.sessionId };
    },
    onResponseSent(requester: TerminalRequester) {
      const key = childKey(requester.caseName, requester.childSessionKey);
      // Provider completion precedes parent cleanup. The scenario's existing
      // readiness loop supplies the exact session's authoritative liveness.
      requesters.set(key, requester);
    },
    async settle(this: void, gateway: SessionReader) {
      for (const [key, requester] of requesters) {
        const session = await readSession(gateway, requester);
        if (
          requesters.get(key) === requester &&
          session?.sessionId === requester.sessionId &&
          session?.hasActiveRun === false &&
          session.status === "done" &&
          session.abortedLastRun !== true
        ) {
          markSettled(key);
        }
      }
    },
    async waitUntilSettled(this: void, caseName: string, childSessionKey: string) {
      const key = childKey(caseName, childSessionKey);
      if (settledChildren.has(key)) {
        return;
      }
      const existing = waiters.get(key);
      if (existing) {
        return await existing.promise;
      }
      let finish!: (error?: Error) => void;
      const promise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          finish(new Error(`terminal requester did not settle: ${caseName} (${childSessionKey})`));
        }, 30_000);
        finish = (error) => {
          clearTimeout(timeout);
          waiters.delete(key);
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
      });
      waiters.set(key, { promise, finish });
      await promise;
    },
    stop() {
      for (const waiter of waiters.values()) {
        waiter.finish(new Error("terminal requester fixture stopped"));
      }
      requesters.clear();
      generations.clear();
      settledChildren.clear();
    },
  };
}
