import { NodeOutputData } from ".";

type Config = unknown;

type Input = {
  template: string;
  variables: Record<string, string>;
};

type Output = {
  result: string;
};

export default async function execute(
  _: Config,
  input: Input,
): Promise<NodeOutputData<Output>> {
  const { variables, template } = input;
  let result = template;
  for (const variable in variables) {
    result = result.replaceAll(`{{${variable}}}`, variables[variable]);
  }
  return Promise.resolve({ _meta: {}, parameters: input, data: { result } });
}
