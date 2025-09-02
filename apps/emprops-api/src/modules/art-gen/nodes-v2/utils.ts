export function findRefs(data: any): any[] {
  let refs: any[] = [];

  if (Array.isArray(data)) {
    for (const item of data) {
      refs = refs.concat(findRefs(item));
    }
  } else if (typeof data === "object" && data !== null) {
    for (const key in data) {
      if (key === "$ref") {
        refs.push(data[key]);
      } else {
        refs = refs.concat(findRefs(data[key]));
      }
    }
  }

  return refs;
}

export function findRefKeys(data: any): string[] {
  let keys: string[] = [];

  if (Array.isArray(data)) {
    for (const item of data) {
      keys = keys.concat(findRefKeys(item));
    }
  } else if (typeof data === "object" && data !== null) {
    for (const key in data) {
      if (typeof data[key] === "object" && data[key] !== null) {
        if ("$ref" in data[key]) {
          keys.push(key);
        }
        keys = keys.concat(findRefKeys(data[key]));
      }
    }
  }

  return keys;
}
