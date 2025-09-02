import lint, { InstructionSet } from "./linter";

test("Some variables aren't being used", () => {
  const result = lint({
    variables: [
      {
        name: "animal_name",
        type: "pick",
        value_type: "strings",
        value: {
          values: ["dog,cat,bird,fish,whale,lion"],
          weights: [1],
          display_names: [""],
        },
        is_feature: false,
        feature_name: "",
        use_display_name: false,
      },
      {
        name: "animals",
        type: "pick",
        value_type: "strings",
        value: {
          values: ["dog,cat,bird,fish,whale,lion"],
          weights: [1],
          display_names: [""],
        },
        is_feature: false,
        feature_name: "",
        use_display_name: false,
      },
    ],
    stable_diffusion_input: {
      prompt:
        "Generate an image of a large {{animals}}, cardboard delivery box on a front porch, which has a bright, rustic wooden finish. It's slightly raining, and the box is visibly wet. The label displays a random address but in a way that the specific details aren't recognizable. The box itself is printed with the logo of an imaginary global shipping company.",
    },
  } as unknown as InstructionSet);

  expect(result.find((r) => r.id == "unused_var")?.messages[0]).toBe(
    "{{animal_name}} not used",
  );
});

test("img2img enabled but not image provided", () => {
  const result = lint({
    stable_diffusion_input: {
      img2img_enabled: true,
      img2img_source: "fixed",
      image: "",
      image_variable: "",
      denoising_strength: 0.75,
    },
  } as unknown as InstructionSet);

  expect(result.find((r) => r.id == "no_img2img_img")?.messages[0]).toBe(
    "Image no selected in img2img",
  );
});

test("Image variables have empty values", () => {
  const result = lint({
    hashes: [
      "1TRVQ3UBCfAqP9nvqT6toKYGXCYMvC1cc4ZfrtqUXTHE17FexiA",
      "gGWIQbvBfCsMzz6vQUZvudtbGbWVZ3qO6JM5HFc80EHdugaIcZE",
    ],
    generations: 2,
    use_custom_hashes: false,
    variables: [
      {
        name: "animal_name",
        type: "pick",
        value_type: "strings",
        value: {
          values: ["dog,cat,bird,fish,whale,lion"],
          weights: [1],
          display_names: [""],
        },
        is_feature: false,
        feature_name: "",
        use_display_name: false,
      },
      {
        name: "box",
        type: "pick",
        value_type: "images",
        value: {
          values: [
            "https://cdn.emprops.ai/flat-files/88d4bff9-4097-49c6-a6b2-0d4d4c7bd67d/3cecd8ee-a3f7-49e3-9560-846fe2b46165.png",
            null,
          ],
          weights: [1],
          display_names: [""],
        },
        is_feature: false,
        feature_name: "",
        use_display_name: false,
      },
    ],
    stable_diffusion_input: {
      override_settings: {
        enable_pnginfo: false,
        sd_model_checkpoint: "v1-5-pruned.ckpt [e1441589a6]",
      },
      prompt:
        "Generate an image of {{animal_name}} a large, cardboard delivery box on a front porch, which has a bright, rustic wooden finish. It's slightly raining, and the box is visibly wet. The label displays a random address but in a way that the specific details aren't recognizable. The box itself is printed with the logo of an imaginary global shipping company.",
      negative_prompt: "",
      sampler_name: "Euler a",
      steps: 20,
      cfg_scale: 7,
      width: 512,
      height: 512,
      img2img_enabled: true,
      img2img_source: "fixed",
      image: "",
      image_variable: "",
      denoising_strength: 0.75,
    },
    p5_input: { enabled: false, code: "" },
    upscaler_input: {
      enabled: false,
      upscaling_resize: 2,
      upscaler_1: "None",
      upscaler_2: "None",
      extras_upscaler_2_visibility: 0,
      gfpgan_visibility: 0,
      codeformer_visibility: 0,
      codeformer_weight: 0,
    },
  } as unknown as InstructionSet);

  expect(result.find((r) => r.id == "empty_var_value")?.messages[0]).toBe(
    "{{box}} includes empty values",
  );
});

test("Image variables have empty values", () => {
  const result = lint({
    hashes: [
      "1TRVQ3UBCfAqP9nvqT6toKYGXCYMvC1cc4ZfrtqUXTHE17FexiA",
      "gGWIQbvBfCsMzz6vQUZvudtbGbWVZ3qO6JM5HFc80EHdugaIcZE",
      "gGWIQbvBfCsMzz6vQUZvudtbGbWVZ3qO6JM5HFc80EHdugaIcZE",
      "gGWIQbvBfCsMzz6vQUZvudtbGbWVZ3qO6JM5HFc80EHdugaIcZE",
      "gGWIQbvBfCsMzz6vQUZvudtbGbWVZ3qO6JM5HFc80EHdugaIcZE",
      "gGWIQbvBfCsMzz6vQUZvudtbGbWVZ3qO6JM5HFc80EHdugaIcZE",
      "gGWIQbvBfCsMzz6vQUZvudtbGbWVZ3qO6JM5HFc80EHdugaIcZE",
    ],
    generations: 7,
    use_custom_hashes: false,
    variables: [
      {
        name: "animal_name",
        type: "pick",
        value_type: "strings",
        value: {
          values: ["dog,cat,bird,fish,whale,lion"],
          weights: [1],
          display_names: [""],
        },
        is_feature: false,
        feature_name: "",
        use_display_name: false,
      },
      {
        name: "box",
        type: "pick",
        value_type: "images",
        value: {
          values: [
            "https://cdn.emprops.ai/flat-files/88d4bff9-4097-49c6-a6b2-0d4d4c7bd67d/3cecd8ee-a3f7-49e3-9560-846fe2b46165.png",
            null,
          ],
          weights: [1],
          display_names: [""],
        },
        is_feature: false,
        feature_name: "",
        use_display_name: false,
      },
    ],
    stable_diffusion_input: {
      override_settings: {
        enable_pnginfo: false,
        sd_model_checkpoint: "v1-5-pruned.ckpt [e1441589a6]",
      },
      prompt:
        "Generate an image of {{animal_name}} a large, cardboard delivery box on a front porch, which has a bright, rustic wooden finish. It's slightly raining, and the box is visibly wet. The label displays a random address but in a way that the specific details aren't recognizable. The box itself is printed with the logo of an imaginary global shipping company.",
      negative_prompt: "",
      sampler_name: "Euler a",
      steps: 20,
      cfg_scale: 7,
      width: 512,
      height: 512,
      img2img_enabled: true,
      img2img_source: "fixed",
      image: "",
      image_variable: "",
      denoising_strength: 0.75,
    },
    p5_input: { enabled: false, code: "" },
    upscaler_input: {
      enabled: false,
      upscaling_resize: 2,
      upscaler_1: "None",
      upscaler_2: "None",
      extras_upscaler_2_visibility: 0,
      gfpgan_visibility: 0,
      codeformer_visibility: 0,
      codeformer_weight: 0,
    },
  } as unknown as InstructionSet);

  expect(result.find((r) => r.id == "generation_limit")?.messages[0]).toBe(
    "Generations limit exceeded",
  );
});

test("Image include information", () => {
  const result = lint({
    hashes: [
      "1TRVQ3UBCfAqP9nvqT6toKYGXCYMvC1cc4ZfrtqUXTHE17FexiA",
      "gGWIQbvBfCsMzz6vQUZvudtbGbWVZ3qO6JM5HFc80EHdugaIcZE",
      "gGWIQbvBfCsMzz6vQUZvudtbGbWVZ3qO6JM5HFc80EHdugaIcZE",
      "gGWIQbvBfCsMzz6vQUZvudtbGbWVZ3qO6JM5HFc80EHdugaIcZE",
      "gGWIQbvBfCsMzz6vQUZvudtbGbWVZ3qO6JM5HFc80EHdugaIcZE",
      "gGWIQbvBfCsMzz6vQUZvudtbGbWVZ3qO6JM5HFc80EHdugaIcZE",
      "gGWIQbvBfCsMzz6vQUZvudtbGbWVZ3qO6JM5HFc80EHdugaIcZE",
    ],
    generations: 7,
    use_custom_hashes: false,
    variables: [
      {
        name: "animal_name",
        type: "pick",
        value_type: "strings",
        value: {
          values: ["dog,cat,bird,fish,whale,lion"],
          weights: [1],
          display_names: [""],
        },
        is_feature: false,
        feature_name: "",
        use_display_name: false,
      },
      {
        name: "box",
        type: "pick",
        value_type: "images",
        value: {
          values: [
            "https://cdn.emprops.ai/flat-files/88d4bff9-4097-49c6-a6b2-0d4d4c7bd67d/3cecd8ee-a3f7-49e3-9560-846fe2b46165.png",
            null,
          ],
          weights: [1],
          display_names: [""],
        },
        is_feature: false,
        feature_name: "",
        use_display_name: false,
      },
    ],
    stable_diffusion_input: {
      override_settings: {
        enable_pnginfo: true,
        sd_model_checkpoint: "v1-5-pruned.ckpt [e1441589a6]",
      },
      prompt:
        "Generate an image of {{animal_name}} a large, cardboard delivery box on a front porch, which has a bright, rustic wooden finish. It's slightly raining, and the box is visibly wet. The label displays a random address but in a way that the specific details aren't recognizable. The box itself is printed with the logo of an imaginary global shipping company.",
      negative_prompt: "",
      sampler_name: "Euler a",
      steps: 20,
      cfg_scale: 7,
      width: 512,
      height: 512,
      img2img_enabled: true,
      img2img_source: "fixed",
      image: "",
      image_variable: "",
      denoising_strength: 0.75,
    },
    p5_input: { enabled: false, code: "" },
    upscaler_input: {
      enabled: false,
      upscaling_resize: 2,
      upscaler_1: "None",
      upscaler_2: "None",
      extras_upscaler_2_visibility: 0,
      gfpgan_visibility: 0,
      codeformer_visibility: 0,
      codeformer_weight: 0,
    },
  } as unknown as InstructionSet);

  expect(result.find((r) => r.id == "png_info_enabled")?.messages[0]).toBe(
    "PNG metadata discloses token generation details",
  );
});

test("P5 code not provided", () => {
  const result = lint({
    hashes: [
      "1TRVQ3UBCfAqP9nvqT6toKYGXCYMvC1cc4ZfrtqUXTHE17FexiA",
      "gGWIQbvBfCsMzz6vQUZvudtbGbWVZ3qO6JM5HFc80EHdugaIcZE",
      "gGWIQbvBfCsMzz6vQUZvudtbGbWVZ3qO6JM5HFc80EHdugaIcZE",
      "gGWIQbvBfCsMzz6vQUZvudtbGbWVZ3qO6JM5HFc80EHdugaIcZE",
      "gGWIQbvBfCsMzz6vQUZvudtbGbWVZ3qO6JM5HFc80EHdugaIcZE",
      "gGWIQbvBfCsMzz6vQUZvudtbGbWVZ3qO6JM5HFc80EHdugaIcZE",
      "gGWIQbvBfCsMzz6vQUZvudtbGbWVZ3qO6JM5HFc80EHdugaIcZE",
    ],
    generations: 7,
    use_custom_hashes: false,
    variables: [
      {
        name: "animal_name",
        type: "pick",
        value_type: "strings",
        value: {
          values: ["dog,cat,bird,fish,whale,lion"],
          weights: [1],
          display_names: [""],
        },
        is_feature: false,
        feature_name: "",
        use_display_name: false,
      },
      {
        name: "box",
        type: "pick",
        value_type: "images",
        value: {
          values: [
            "https://cdn.emprops.ai/flat-files/88d4bff9-4097-49c6-a6b2-0d4d4c7bd67d/3cecd8ee-a3f7-49e3-9560-846fe2b46165.png",
            null,
          ],
          weights: [1],
          display_names: [""],
        },
        is_feature: false,
        feature_name: "",
        use_display_name: false,
      },
    ],
    stable_diffusion_input: {
      override_settings: {
        enable_pnginfo: true,
        sd_model_checkpoint: "v1-5-pruned.ckpt [e1441589a6]",
      },
      prompt:
        "Generate an image of {{animal_name}} a large, cardboard delivery box on a front porch, which has a bright, rustic wooden finish. It's slightly raining, and the box is visibly wet. The label displays a random address but in a way that the specific details aren't recognizable. The box itself is printed with the logo of an imaginary global shipping company.",
      negative_prompt: "",
      sampler_name: "Euler a",
      steps: 20,
      cfg_scale: 7,
      width: 512,
      height: 512,
      img2img_enabled: true,
      img2img_source: "fixed",
      image: "",
      image_variable: "",
      denoising_strength: 0.75,
    },
    p5_input: { enabled: true, code: "" },
    upscaler_input: {
      enabled: false,
      upscaling_resize: 2,
      upscaler_1: "None",
      upscaler_2: "None",
      extras_upscaler_2_visibility: 0,
      gfpgan_visibility: 0,
      codeformer_visibility: 0,
      codeformer_weight: 0,
    },
  } as unknown as InstructionSet);

  expect(result.find((r) => r.id == "no_p5_code")?.messages[0]).toBe(
    "P5js code not found",
  );
});
