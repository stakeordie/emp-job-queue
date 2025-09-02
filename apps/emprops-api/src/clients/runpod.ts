import logger from "../logger";

type ComfyWorkflowEndpointRequest = {
  input: {
    workflow: any;
    images: {
      name: string;
      image: string;
    }[];
    output_node_id: string | null;
  };
  componentType?: string;
};

type ComfyWorkflowEndpointBaseResponse = {
  id: string;
  delayTime: number;
  executionTime: number;
};

type ComfyWorkflowEndpointSuccessResponse = {
  output: {
    message: string;
  };
  status: "COMPLETED";
} & ComfyWorkflowEndpointBaseResponse;

type ComfyWorkflowEndpointErrorResponse = {
  error: string;
  status: "FAILED";
} & ComfyWorkflowEndpointBaseResponse;

type ComfyWorkflowEndpointResponse =
  | ComfyWorkflowEndpointSuccessResponse
  | ComfyWorkflowEndpointErrorResponse;

export class RunpodComfyClient {
  constructor(
    private baseURL: string,
    private apiKey?: string,
  ) {}

  async runEndpoint(request: ComfyWorkflowEndpointRequest) {
    const response = await this.doAuthRequest<ComfyWorkflowEndpointResponse>(
      "POST",
      "/runsync",
      request,
    );
    if (response.status === "COMPLETED") {
      if (!response.output.message) throw new Error("No output message");
      return { data: response.output.message, error: null };
    } else {
      return { data: null, error: response.error };
    }
  }

  async doAuthRequest<T>(method: string, path: string, body?: any): Promise<T> {
    const username = process.env.STABLE_DIFFUSION_USERNAME;
    const password = process.env.STABLE_DIFFUSION_PASSWORD;
    const credentials = Buffer.from(`${username}:${password}`).toString(
      "base64",
    );
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Basic ${credentials}`,
      "X-Component-Type": body?.componentType || "basic",
    };
    const finalURL = `${this.baseURL}${path}`;
    logger.info(`Sending request to ${finalURL}`);
    const response = await fetch(finalURL, {
      method,
      body: body ? JSON.stringify(body) : undefined,
      headers,
      signal: AbortSignal.timeout(900000), // 15 minutes
    });
    if (!response.ok) {
      throw new Error(response.statusText);
    }
    if (response.headers.get("Content-Type") === "application/json") {
      return await response.json();
    } else {
      const text = await response.text();
      throw new Error(text);
    }
  }
}
