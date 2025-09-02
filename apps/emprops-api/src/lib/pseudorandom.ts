class Random {
  emrand: () => number;

  constructor(seed: string) {
    const alphabet =
      "123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
    const b58dec = (str: string) =>
      [...str].reduce(
        (p, c) => (p * alphabet.length + alphabet.indexOf(c)) | 0,
        0,
      );
    const hashSlice = seed.slice(2);
    const regex = new RegExp(".{" + ((hashSlice.length / 4) | 0) + "}", "g");
    const hashes = hashSlice.match(regex)?.map((h) => b58dec(h));
    const sfc32 = (a: number, b: number, c: number, d: number) => {
      return () => {
        a |= 0;
        b |= 0;
        c |= 0;
        d |= 0;
        const t = (((a + b) | 0) + d) | 0;
        d = (d + 1) | 0;
        a = b ^ (b >>> 9);
        b = (c + (c << 3)) | 0;
        c = (c << 21) | (c >>> 11);
        c = (c + t) | 0;
        return (t >>> 0) / 4294967296;
      };
    };
    // @ts-expect-error I don't really know if this is going to throw an error.
    this.emrand = sfc32(...hashes);
  }

  decimal() {
    return this.emrand();
  }
}

export class Pseudorandom {
  private random: Random;

  constructor(seed: string) {
    this.random = new Random(seed);
  }

  pseudorandom(min = 0, max = 1) {
    return min + (max - min) * this.random.decimal();
  }

  pseudorandoms(n: number, min: number, max: number) {
    const result = [];
    for (let i = 0; i < n; i++) {
      result.push(this.pseudorandom(min, max));
    }
    return result;
  }
  pseudorandomInteger(min: number, max: number) {
    return Math.floor(this.pseudorandom(min, max + 1));
  }

  pseudorandomIntegers(n: number, min: number, max: number) {
    const result = [];
    for (let i = 0; i < n; i++) {
      result.push(this.pseudorandomInteger(min, max));
    }
    return result;
  }

  pseudorandomBoolean() {
    return this.pseudorandom() < 0.5;
  }

  pseudorandomPick<T>(list: T[]) {
    return list[this.pseudorandomInteger(0, list.length - 1)];
  }

  pseudorandomWeightedPick<T>(list: T[], weights: number[]) {
    const totalWeight = weights.reduce((a, b) => a + b);
    const pick = this.pseudorandom(0, totalWeight);
    let index = 0,
      sum = 0;

    while (index < weights.length && sum + weights[index] < pick) {
      sum += weights[index];
      index++;
    }
    return list[Math.min(list.length - 1, index)];
  }

  pseudorandomPickButNot<T>(list: T[], stinky: T[]) {
    if (list.length == 0) {
      return;
    }
    if (list.length == 1) {
      return list[0];
    }
    let pickedOption;

    let safetyIndex = 0;
    do {
      pickedOption = this.pseudorandomPick(list);
      safetyIndex++;

      // This gets invoked everytime to make sure there are no scenarios with infinite loops
      // due the lack of options in a short array list
      if (safetyIndex++ > list.length * 10) {
        pickedOption = list[0];
        break;
      }
    } while (stinky.includes(pickedOption));
    return pickedOption;
  }

  pseudorandomSelectFromRange(n: number, range: number) {
    const result = [];

    let tmp, a;
    for (let i = 0; i < range; i++) {
      result.push(i);

      a = this.pseudorandomInteger(0, i);

      tmp = result[i];
      result[i] = result[a];
      result[a] = tmp;
    }

    return result.slice(0, n);
  }
}
