// The engine asks a model for one short JSON answer per lead. Any of these can serve it; when none is set up, drafts
// fall back to fixed text, so a run never depends on a model being available.
import Anthropic from "@anthropic-ai/sdk";

export interface TextModel {
  /** Short provider name, stored with each run. */
  readonly name: string;
  complete(system: string, user: string): Promise<string>;
}

/** Workers AI through the Worker's `AI` binding: free tier, no key. */
export class WorkersAiBinding implements TextModel {
  readonly name: string;
  constructor(
    private ai: { run(model: string, input: unknown): Promise<unknown> },
    private model = "@cf/mistralai/mistral-small-3.1-24b-instruct",
  ) {
    this.name = `workers-ai:${model}`;
  }
  async complete(system: string, user: string) {
    const out = (await this.ai.run(this.model, {
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 200,
    })) as { response?: unknown };
    return typeof out.response === "string" ? out.response : JSON.stringify(out.response ?? "");
  }
}

/** Workers AI over its REST API, for the command line outside Cloudflare. */
export class WorkersAiRest implements TextModel {
  readonly name: string;
  constructor(
    private accountId: string,
    private token: string,
    private model = "@cf/mistralai/mistral-small-3.1-24b-instruct",
    private fetchImpl: typeof fetch = fetch,
  ) {
    this.name = `workers-ai:${model}`;
  }
  async complete(system: string, user: string) {
    const res = await this.fetchImpl(
      `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${this.model}`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          max_tokens: 200,
        }),
      },
    );
    if (!res.ok) throw new Error(`Workers AI answered ${res.status}`);
    const body = (await res.json()) as { result?: { response?: unknown } };
    const r = body.result?.response;
    return typeof r === "string" ? r : JSON.stringify(r ?? "");
  }
}

/** Claude through the official SDK. */
export class AnthropicModel implements TextModel {
  readonly name: string;
  private client: Anthropic;
  constructor(
    apiKey: string,
    private model = "claude-opus-5-5",
  ) {
    this.client = new Anthropic({ apiKey });
    this.name = `anthropic:${model}`;
  }
  async complete(system: string, user: string) {
    // One sentence and a key, so low effort is plenty. Fallbacks re-run a declined request on another model.
    const res = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: 4000,
      system,
      messages: [{ role: "user", content: user }],
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    } as unknown as Parameters<typeof this.client.beta.messages.create>[0] & { stream?: false });
    if (res.stop_reason === "refusal") throw new Error("The model declined this post.");
    return res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  }
}

/** Answers from a list, for tests. */
export class FakeModel implements TextModel {
  readonly name = "fake";
  calls: { system: string; user: string }[] = [];
  constructor(private answers: (string | Error)[]) {}
  async complete(system: string, user: string) {
    this.calls.push({ system, user });
    const next = this.answers.shift() ?? "";
    if (next instanceof Error) throw next;
    return next;
  }
}

/** The first JSON object in a model's answer, or null. */
export function readJson<T>(text: string): T | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
