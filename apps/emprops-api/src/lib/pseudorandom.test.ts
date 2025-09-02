import { Pseudorandom } from "./pseudorandom";

test("pick", () => {
  const pr = new Pseudorandom(
    "0x1b6d7d3b5716b08423674afa46cb18cc4d9e1a275822e32018d418b272d55697",
  );
  const result = pr.pseudorandomPick([
    "John",
    "Mary",
    "Peter",
    "George",
    "Luis",
    "Mario",
    "Mitzy",
  ]);
  expect(result).toBe("George");
});
