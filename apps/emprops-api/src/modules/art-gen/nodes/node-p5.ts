import { PuppeteerClient } from "../../../clients/puppeteer-api";
import { NodeOutputData } from ".";

type Input = {
  code: string;
  hash: string;
  variables: Record<string, unknown>;
};

type Output = {
  image: string;
};

type Config = {
  url: string;
};

export default async function execute(
  config: Config,
  input: Input,
): Promise<NodeOutputData<Output>> {
  const client = new PuppeteerClient(config.url);
  const script = `
      const variables = ${JSON.stringify(input.variables)};
      const hash = "${input.hash}";
      ${input.code}
    `;
  const startTime = Date.now();
  const image = await client.takeScreenshot(script);
  const time = (Date.now() - startTime) / 1000;
  return {
    _meta: {
      time,
      server: null,
    },
    parameters: {},
    data: {
      image,
    },
  };
}
