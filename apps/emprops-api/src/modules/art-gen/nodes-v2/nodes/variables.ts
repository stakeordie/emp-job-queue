import { Pseudorandom } from "../../../../lib/pseudorandom";
import { wait } from "../../../../utils";
import { Context, GeneratorNode } from "./js.js";
import { Variable } from "..";

export class VariablesNode extends GeneratorNode {
  name = "variables";

  async execute(ctx: Context, variables: Variable[]) {
    const prng = new Pseudorandom(ctx.hash);
    const result = {} as Record<string, string>;
    for (const variable of variables) {
      if (variable.lock_value && variable.test_value != null) {
        result[variable.name] = variable.test_value;
        continue;
      }
      switch (variable.type) {
        case "pick":
          result[variable.name] = prng.pseudorandomPick(variable.value.values);
          break;
        case "weighted_pick":
          result[variable.name] = prng.pseudorandomWeightedPick(
            variable.value.values,
            variable.value.weights,
          );
          break;
        default:
          throw new Error(`Unknown variable type ${variable.value_type}`);
      }
    }
    await wait(100);
    return { data: result, mimeType: null };
  }
}
