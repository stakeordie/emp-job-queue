import execute from "./node-pseudorandom";

test("pick", async () => {
  const config = {
    hash: "0x1b6d7d3b5716b08423674afa46cb18cc4d9e1a275822e32018d418b272d55697",
  };
  const input = {
    name: {
      type: "pick" as const,
      value: {
        values: ["John", "Mary", "Peter"],
      },
    },
  };
  const result = await execute(config, input);
  expect(Object.keys(result.data)).toContain("name");
  expect(result.data["name"]).toBe("Mary");
});

test("weighted_pick", async () => {
  const config = {
    hash: "0x1b6d7d3b5716b08423674afa46cb18cc4d9e1a275822e32018d418b272d55697",
  };
  const input = {
    name: {
      type: "weighted_pick" as const,
      value: {
        values: ["John", "Mary", "Peter"],
        weights: [1, 1, 98],
      },
    },
  };
  const result = await execute(config, input);
  expect(Object.keys(result.data)).toContain("name");
  expect(result.data["name"]).toBe("Peter");
});

test("multiple", async () => {
  const config = {
    hash: "0x1b6d7d3b5716b08423674afa46cb18cc4d9e1a275822e32018d418b272d55697",
  };
  const input = {
    name: {
      type: "weighted_pick" as const,
      value: {
        values: ["John", "Mary", "Peter"],
        weights: [1, 1, 98],
      },
    },
    job: {
      type: "pick" as const,
      value: {
        values: ["Engineer", "Other"],
      },
    },
  };
  const result = await execute(config, input);
  const keys = Object.keys(result.data);
  expect(keys).toContain("name");
  expect(keys).toContain("job");
  expect(result.data["name"]).toBe("Peter");
  expect(result.data["job"]).toBe("Engineer");
});
