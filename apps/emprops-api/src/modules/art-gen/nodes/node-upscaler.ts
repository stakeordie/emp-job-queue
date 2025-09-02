import { NodeOutputData } from ".";
import {
  Config,
  ExtraSingleImageRequest,
  ExtraSingleImageResponse,
  StableDiffusionClient,
} from "../../../clients/stable-diffusion-client";

export default async function execute(
  config: Config,
  input: ExtraSingleImageRequest,
): Promise<NodeOutputData<ExtraSingleImageResponse>> {
  const client = new StableDiffusionClient(config);
  const response = await client.extraSingleImage(input);
  if (
    response.status !== 200 ||
    response.headers.get("content-type") !== "application/json"
  ) {
    throw new Error(response.statusText);
  }
  const data = await response.json();
  if (data.status === "FAILED") {
    throw new Error(data.output.errors);
  }
  const time = response.headers.get("x-process-time");
  const server = response.headers.get("x-server");
  const output = !data.output ? data : data.output;
  const { image: _, ...parameters } = input;
  return {
    _meta: {
      time,
      server,
    },
    parameters,
    data: output,
  };
}
