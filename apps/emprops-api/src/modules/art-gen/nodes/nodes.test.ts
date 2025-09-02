import { getDescendantProp, resolveInput } from ".";

describe("resolveInput", () => {
  test("source_output as string", () => {
    const outputs = [
      {
        id: "1",
        name: "other",
        contents: {
          _meta: {},
          parameters: {},
          data: {
            name: "Luis",
          },
        },
      },
    ];
    const nodeCall = {
      id: "2",
      name: "template",
      config: {},
      input: {},
      dependencies: [
        {
          source_id: "1",
          source_output: "name",
          target_input: "first_name",
        },
      ],
    };
    const result = resolveInput(nodeCall, outputs);
    const keys = Object.keys(result);
    expect(keys.length).toBe(1);
    expect(keys).toContain("first_name");
    expect(result.first_name).toBe("Luis");
  });

  test("source_output as array", () => {
    const outputs = [
      {
        id: "1",
        name: "other",
        contents: {
          _meta: {},
          parameters: {},
          data: {
            name: "Luis",
            age: 28,
          },
        },
      },
    ];
    const nodeCall = {
      id: "2",
      name: "template",
      config: {},
      input: {},
      dependencies: [
        {
          source_id: "1",
          source_output: ["name", "age"],
          target_input: "first_name",
        },
      ],
    };
    const result = resolveInput(nodeCall, outputs);
    const keys = Object.keys(result);
    expect(keys.length).toBe(1);
    expect(keys).toContain("first_name");
    expect(result.first_name).toMatchObject({
      name: "Luis",
      age: 28,
    });
  });

  test("source_output with dot notation", () => {
    const outputs = [
      {
        id: "1",
        name: "other",
        contents: {
          _meta: {},
          parameters: {},
          data: {
            name: "Luis",
            age: 28,
            equipment: {
              computer: "Macbook Pro",
            },
          },
        },
      },
    ];
    const nodeCall = {
      id: "2",
      name: "template",
      config: {},
      input: {},
      dependencies: [
        {
          source_id: "1",
          source_output: "equipment.computer",
          target_input: "equipmentName",
        },
      ],
    };
    const result = resolveInput(nodeCall, outputs);
    const keys = Object.keys(result);
    expect(keys.length).toBe(1);
    expect(keys).toContain("equipmentName");
    expect(result.equipmentName).toBe("Macbook Pro");
  });
});

describe("getDescendantProp", () => {
  test("get value", () => {
    const obj = {
      name: "Luis",
    };
    const result = getDescendantProp(obj, "name");
    expect(result).toBe("Luis");
  });
});
