import { NodeOutputData } from ".";
import { Pseudorandom } from "../../../lib/pseudorandom";

type Config = {
  hash: string;
};

type PickType = {
  values: string[];
};

type WeightedPickType = {
  values: string[];
  weights: number[];
};

export type IntegerPickType = {
  min: number;
  max: number;
};

type Variable = {
  type: "pick" | "weighted_pick" | "integer";
  value: PickType | WeightedPickType | IntegerPickType;
};

type Input = Record<string, Variable>;

export default async function execute(
  config: Config,
  input: Input,
): Promise<NodeOutputData<Record<string, any>>> {
  const result = {
    hash: config.hash,
  } as Record<string, any>;

  const pseudoRandom = new Pseudorandom(config.hash);
  for (const key of Object.keys(input)) {
    const variable = input[key];
    if (variable.type === "pick") {
      const pick = variable.value as PickType;
      result[key] = pseudoRandom.pseudorandomPick(pick.values);
    } else if (variable.type === "weighted_pick") {
      const weightedPick = variable.value as WeightedPickType;
      result[key] = pseudoRandom.pseudorandomWeightedPick(
        weightedPick.values,
        weightedPick.weights,
      );
    } else if (variable.type === "integer") {
      const integerPick = variable.value as IntegerPickType;
      result[key] = pseudoRandom.pseudorandomInteger(
        integerPick.min,
        integerPick.max,
      );
    } else {
      throw new Error(`Unknown variable type ${variable.type}`);
    }
  }

  return Promise.resolve({
    _meta: {},
    parameters: input,
    data: result,
  });
}
