import { SyntheticRecord } from "@/lib/data/schema";
import { StrategyAction } from "@/lib/agent/strategy";
import { Rng } from "@/lib/data/seed";

const API_BASE = "https://api.razorpay.com/v1";
const TIMEOUT_MS = 5000;
const RATE_LIMIT_PAUSE_MS = 60000;

export interface ApiCallRecord {
  endpoint: string;
  method: string;
  request: object;
  response: object;
  simulated: boolean;
}

export interface ExecutionResult {
  success: boolean;
  api_call?: ApiCallRecord;
  error?: { type: string; message: string; handled: boolean };
}

const ENDPOINTS: Partial<Record<StrategyAction, { path: string; method: string }>> = {
  RETRY_IN_24H: { path: "/payment-links", method: "POST" },
  RETRY_IN_48H: { path: "/payment-links", method: "POST" },
  RETRY_IMMEDIATELY: { path: "/payments/{id}/retry", method: "POST" },
  REQUEST_CARD_UPDATE: { path: "/payment-links", method: "POST" },
  CART_REMINDER_WHATSAPP: { path: "/payment-links", method: "POST" },
  SMS_PAYMENT_LINK: { path: "/payment-links", method: "POST" },
  EMAIL_CART_RECOVERY: { path: "/payment-links", method: "POST" },
  MANDATE_RETRY: { path: "/subscriptions/{id}/retry", method: "POST" },
  CARD_UPDATE_REQUEST: { path: "/payment-links", method: "POST" },
  GENTLE_REMINDER: { path: "/invoices/{id}/remind", method: "POST" },
  FIRM_NOTICE: { path: "/invoices/{id}/remind", method: "POST" },
  PAYMENT_PLAN_OFFER: { path: "/invoices", method: "POST" },
};

function buildRequest(action: StrategyAction, record: SyntheticRecord): Record<string, unknown> {
  switch (action) {
    case "MANDATE_RETRY":
      return {
        subscription_id: `sub_${record.record_id}`,
        amount: record.amount,
        currency: record.currency,
      };
    case "GENTLE_REMINDER":
    case "FIRM_NOTICE":
    case "PAYMENT_PLAN_OFFER":
      return {
        invoice_id: `inv_${record.record_id}`,
        amount: record.amount,
        remind_via: ["sms", "email"],
      };
    default:
      return {
        amount: record.amount,
        currency: record.currency,
        reference_id: record.record_id,
        customer: {
          name: record.customer_name,
          email: record.customer_email,
          contact: record.customer_phone,
        },
      };
  }
}

export class RazorpayExecutor {
  private keyId?: string;
  private keySecret?: string;

  constructor(keyId?: string, keySecret?: string) {
    this.keyId = keyId;
    this.keySecret = keySecret;
  }

  get simulated(): boolean {
    return !this.keyId || !this.keySecret || this.keyId.includes("xxxx");
  }

  async execute(
    action: StrategyAction,
    record: SyntheticRecord,
    successProbability: number,
    rng: Rng,
  ): Promise<ExecutionResult> {
    const endpoint = ENDPOINTS[action] ?? { path: "/payment-links", method: "POST" };
    const request = buildRequest(action, record);

    if (this.simulated) {
      return this.simulate(endpoint.path, endpoint.method, request, successProbability, rng);
    }

    try {
      const response = await this.callWithRetry(endpoint.path, endpoint.method, request);
      return {
        success: true,
        api_call: {
          endpoint: endpoint.path,
          method: endpoint.method,
          request,
          response,
          simulated: false,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === "rate_limited") {
        await new Promise((r) => setTimeout(r, Math.min(RATE_LIMIT_PAUSE_MS, 1000)));
        try {
          const response = await this.rawCall(endpoint.path, endpoint.method, request);
          return {
            success: true,
            api_call: {
              endpoint: endpoint.path,
              method: endpoint.method,
              request,
              response,
              simulated: false,
            },
          };
        } catch (retryErr) {
          const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
          return {
            success: false,
            api_call: { endpoint: endpoint.path, method: endpoint.method, request, response: {}, simulated: false },
            error: { type: "rate_limited", message: retryMsg, handled: true },
          };
        }
      }
      return {
        success: false,
        api_call: { endpoint: endpoint.path, method: endpoint.method, request, response: {}, simulated: false },
        error: { type: "api_error", message, handled: true },
      };
    }
  }

  private simulate(
    endpoint: string,
    method: string,
    request: object,
    successProbability: number,
    rng: Rng,
  ): ExecutionResult {
    const success = rng.float() < successProbability;
    return {
      success,
      api_call: {
        endpoint,
        method,
        request,
        response: {
          id: `sim_${Math.floor(rng.float() * 1e10).toString(36)}`,
          status: success ? "captured" : "failed",
          amount: (request as { amount: number }).amount,
          simulated: true,
        },
        simulated: true,
      },
    };
  }

  private async callWithRetry(
    path: string,
    method: string,
    body: object,
  ): Promise<object> {
    try {
      return await this.rawCall(path, method, body);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === "timeout") {
        await new Promise((r) => setTimeout(r, 2000));
        return this.rawCall(path, method, body);
      }
      throw err;
    }
  }

  private async rawCall(path: string, method: string, body: object): Promise<object> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64")}`,
        },
        body: method === "GET" ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      if (res.status === 429) throw new Error("rate_limited");
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      return await res.json();
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error("timeout");
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

export function outcomeForAction(action: StrategyAction): "escalated" | "skipped" | null {
  if (
    action === "ESCALATE_TO_MANUAL" ||
    action === "ESCALATE_TO_CHURN_PREVENTION" ||
    action === "ESCALATE_LEGAL"
  ) {
    return "escalated";
  }
  if (action === "SKIP") return "skipped";
  if (action === "NO_ACTION") return "skipped";
  return null;
}
