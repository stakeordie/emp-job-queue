interface Metadata {
  key1: string;
  key2: number;
}

interface AdditionalNetwork {
  strength: number | null;
  triggerWord: string;
  type: string | null;
}

export interface Txt2ImgInput {
  quantity: number;
  batchSize: number;
  model: string;
  additionalNetworks?: {
    [key: string]: AdditionalNetwork;
  };
  controlNets: any[]; // assuming it's an array, replace `any` with the appropriate type if known
  sequential: boolean;
  prompt: string;
  negativePrompt: string;
  scheduler: number;
  steps: number;
  cfgScale: number;
  width: number;
  height: number;
  seed: number;
  clipSkip: number;
}

interface Step {
  $type: string;
  priority?: string;
  timeout?: string;
  retries?: number;
  input: Txt2ImgInput;
}

interface Callback {
  url: string;
  type: string[];
}

interface WorkflowRequest {
  metadata?: Metadata;
  steps: Step[];
  callbacks: Callback[];
}

interface Transaction {
  amount: number;
  id: string;
}

interface Image {
  id: string;
  available: boolean;
  url: string;
  urlExpiresAt: string;
  jobId: string;
}

interface Output {
  images: Image[];
}

interface Job {
  id: string;
  cost: number;
  status: string;
  startedAt: string;
}

interface OutputStep {
  $type: string;
  input: Txt2ImgInput;
  output: Output;
  priority: string;
  jobs: Job[];
  status: string;
  startedAt: string;
}

interface WorkflowResponse {
  id: string;
  createdAt: string;
  transactions: Transaction[];
  status: string;
  startedAt: string;
  steps: OutputStep[];
  callbacks: any[]; // assuming it's an array, replace `any` with the appropriate type if known
}

export class CivitaiApi {
  constructor(
    private baseUrl: string,
    private apiKey: string,
  ) {}

  submitWorkflow(req: WorkflowRequest): Promise<WorkflowResponse> {
    return this.doRequest(
      "POST",
      "/workflows?whatif=false&wait=30&charge=false",
      req,
    );
  }

  private doRequest<T>(
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const fullUrl = `${this.baseUrl}/v2/consumer${path}`;
      fetch(fullUrl, {
        method,
        headers: {
          Authorization: `Basic ${this.apiKey}`,
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify(body),
      })
        .then((response) => {
          if (!response.ok) {
            return reject(new Error(response.statusText));
          }
          return response.json();
        })
        .then((json) => resolve(json));
    });
  }
}
