import { GenerationInput } from "./art-gen";

type RuleLevel = "warn" | "error";

// Rules
type RuleApplicationResult = {
  applies: boolean;
  messages: string[];
};

type Rule = {
  id: string;
  apply: (inset: GenerationInput) => RuleApplicationResult;
  level: RuleLevel;
};

type RuleResult = {
  id: string;
  messages: string[];
  level: RuleLevel;
};

const defaultRules: Rule[] = [
  {
    id: "unused_char_str_var",
    level: "warn",
    apply(inset: GenerationInput) {
      const p5VariablesUsed = inset.p5_input.enabled
        ? getP5VariablesInText(inset?.p5_input?.code)
        : [];
      const used: string[] = removeDuplicates([
        ...p5VariablesUsed,
        ...getVariablesInText(inset?.stable_diffusion_input?.prompt),
        ...getVariablesInText(inset?.stable_diffusion_input?.negative_prompt),
      ]);

      const messages = inset?.variables
        ?.filter((v) => !used.includes(v.name) && v.value_type == "strings")
        ?.map(
          (v) => `Character string variable {{${v.name}}} is not being used.`,
        );
      const applies = messages.length > 0 ? true : false;
      return {
        applies,
        messages,
      };
    },
  },
  {
    id: "unused_images_var",
    level: "warn",
    apply(inset: GenerationInput) {
      const imgVarUsed = inset.stable_diffusion_input?.image_variable;
      const messages =
        inset?.variables
          ?.filter((v) => v.name !== imgVarUsed && v.value_type == "images")
          .map((v) => `Images variable {{${v.name}}} is not being used.`) || [];
      const applies = messages.length > 0 ? true : false;
      return {
        applies,
        messages,
      };
    },
  },
  {
    id: "no_img2img_var",
    level: "error",
    apply(inset: GenerationInput) {
      const { stable_diffusion_input, p5_input } = inset || {};
      return generateMessage(
        stable_diffusion_input?.img2img_enabled &&
          !p5_input?.enabled &&
          stable_diffusion_input?.img2img_source == "variable" &&
          !stable_diffusion_input?.image_variable,
        "No image have been selected for img2img (var)",
      );
    },
  },
  {
    id: "no_img2img_const",
    level: "error",
    apply(inset: GenerationInput) {
      const { stable_diffusion_input, p5_input } = inset || {};
      return generateMessage(
        stable_diffusion_input?.img2img_enabled &&
          !p5_input?.enabled &&
          stable_diffusion_input?.img2img_source == "fixed" &&
          !stable_diffusion_input?.image,
        "No image have been selected for img2img (const)",
      );
    },
  },
  {
    id: "empty_var_value",
    level: "error",
    apply(inset: GenerationInput) {
      const { variables } = inset || {};

      const messages =
        variables
          ?.filter(
            (v) =>
              v.value_type == "images" &&
              v.value.values.filter((value: any) => !value).length > 0,
          )
          .map((v) => `Variable {{${v.name}}} has an empty value.`) || [];
      const applies = messages?.length > 0 ? true : false;
      return {
        applies,
        messages,
      };
    },
  },
  {
    id: "generation_limit",
    level: "error",
    apply(inset: GenerationInput) {
      const { hashes, generations } = inset || {};
      let result: RuleApplicationResult = {
        applies: false,
        messages: [],
      };

      result = generateMessage(
        !generations,
        "Cannot generate 0 images.",
        result,
      );
      result = generateMessage(
        hashes?.length !== generations,
        "hashes and generation must match.",
        result,
      );
      result = generateMessage(
        generations && generations > 10,
        "You can't generate more than 10 images.",
        result,
      );

      return result;
    },
  },
  {
    id: "png_info_enabled",
    level: "warn",
    apply(inset: GenerationInput) {
      const { stable_diffusion_input } = inset || {};

      return generateMessage(
        stable_diffusion_input?.override_settings?.enable_pnginfo,
        "PNG info is enabled and will leak your sketchbook settings.",
      );
    },
  },
  {
    id: "no_p5_code",
    level: "warn",
    apply(inset: GenerationInput) {
      const { p5_input } = inset || {};

      return generateMessage(
        p5_input?.enabled && !p5_input?.code,
        "There's no P5.js code to execute.",
      );
    },
  },
  {
    id: "no_seed_value",
    level: "error",
    apply(inset: GenerationInput) {
      const { stable_diffusion_input } = inset || {};
      const isVariableAndEmpty =
        stable_diffusion_input.seed_enabled &&
        stable_diffusion_input.seed_source == "variable" &&
        !stable_diffusion_input.seed_variable;

      let result: RuleApplicationResult = {
        applies: false,
        messages: [],
      };
      result = generateMessage(
        isVariableAndEmpty,
        "Seed variable is not selected.",
        result,
      );

      return result;
    },
  },
];

function extendDefaultRules(rules?: Rule[]): Rule[] {
  if (!rules) return defaultRules;
  const filtered = defaultRules.filter(
    (dr) => !rules.find((r) => r.id == dr.id),
  );
  return [...filtered, ...rules];
}

const RulesRegistry: Record<string, Rule[]> = {
  v1: extendDefaultRules(),
  // Add more versions and rules as needed
};

function lint(
  instructionSet: GenerationInput,
  level: "error" | "warn" | "all" = "all",
): RuleResult[] {
  const version = instructionSet.version || "v1";
  const rules = RulesRegistry[version];

  if (typeof rules === "undefined") {
    throw new Error(`Unsupported version: ${instructionSet.version}`);
  }

  return rules
    .map((rule) => {
      const { applies, messages } = rule.apply(instructionSet);

      return applies
        ? {
            id: rule.id,
            messages,
            level: rule.level,
          }
        : null;
    })
    .filter(
      (v) => v && (level !== "all" ? v.level == level : true),
    ) as RuleResult[];
}

export default lint;

function getVariablesInText(text?: string) {
  if (!text) return [];
  // Use a regular expression to capture words wrapped with {{}}
  const regex = /{{([^{}]+)}}/g;

  // Use match to retrieve captured groups
  const matches = text.match(regex);

  // Extract words from the captured groups
  const wordsArray = matches
    ? matches.map((match) => match.replace(/{{|}}/g, "").trim())
    : [];

  return wordsArray;
}
function getP5VariablesInText(text?: string) {
  if (!text) return [];
  // Use a regular expression to capture words in variables.variablename format or variables['variablename'] or variables["variablename"]
  const regex = /variables\.[\w]+|variables\['[\w]+'\]|variables\["[\w]+"\]/g;

  // Use match to retrieve captured groups
  const matches = text.match(regex);

  // Extract words from the captured groups
  let wordsArray = matches
    ? matches.map((match) => match.replace(/{{|}}/g, "").trim())
    : [];
  // Get variable name in variables.variablename format or variables['variablename'] or variables["variablename"]
  wordsArray = wordsArray.map((element) => {
    const variableName = (
      element.split(".")[1] || element.split("[")[1].split("]")[0]
    ).toString();
    // Remove any ' or " from the variable name
    return variableName.replace(/'/g, "").replace(/"/g, "");
  });

  return wordsArray;
}

function removeDuplicates(arr: string[]) {
  return arr.filter((v, i, a) => a.indexOf(v) === i);
}
function generateMessage(
  predicate: unknown,
  msg: string,
  result?: RuleApplicationResult,
): RuleApplicationResult {
  const r = result || {
    applies: false,
    messages: [],
  };

  if (predicate) {
    r.applies = true;
    r.messages.push(msg);
  }

  return r;
}
