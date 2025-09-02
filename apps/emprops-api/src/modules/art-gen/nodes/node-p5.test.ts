import executeNode from "./node-p5";

describe("node-p5", () => {
  test("executeNode", async () => {
    const result = await executeNode(
      {
        basePath: "/tmp",
      },
      {
        code: `
        function setup() {
          createCanvas(512, 512);
        }

        function draw() {
          const backgroundColor = window.backgroundColor || { r: 0, g: 0, b: 0 };
          background(backgroundColor.r, backgroundColor.g, backgroundColor.b);
          ellipse(width / 2, height / 2, 120, 120);
        }
      `,
        hash: "hash",
        variables: {},
      },
    );
    expect(result).toBeTruthy();
  }, 30000);
});
