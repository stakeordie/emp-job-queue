import { Request } from "express";
import { isServiceKeyAuth, splitByOccurrences } from "./index";

export function buildDefaultPagedQuery(req: Request) {
  const orderBy = parseOrderQueryString(req.query.order as string);
  const { skip, take } = parsePageQueryString(req.query);
  const where = parseWhereQueryString(req.query as Record<string, string>);
  return {
    skip,
    take,
    where,
    orderBy,
  };
}

export function buildDefaultAuthPagedQuery(
  req: Request,
  authFieldName = "user_id",
) {
  const userId = getUserId(req);
  const orderBy = parseOrderQueryString(req.query.order as string);
  const { skip, take } = parsePageQueryString(req.query);
  const where = parseWhereQueryString(req.query as Record<string, string>);
  return {
    skip,
    take,
    where: {
      [authFieldName]: userId,
      ...where,
    },
    orderBy,
  };
}

export function buildRelationAuthPagedQuery(
  req: Request,
  relation: string,
  authFieldName = "user_id",
) {
  const userId = getUserId(req);
  const orderBy = parseOrderQueryString(req.query.order as string);
  const { skip, take } = parsePageQueryString(req.query);
  const where = parseWhereQueryString(req.query as Record<string, string>);
  return {
    skip,
    take,
    where: {
      [relation]: {
        [authFieldName]: userId,
      },
      ...where,
    },
    orderBy,
  };
}

export function buildDefaultAuthIdentifiedQuery<T>(
  req: Request,
  authFieldName = "user_id",
) {
  let id: T = req.params.id as unknown as T;
  if (!isNaN(Number(id))) id = Number(id) as T;
  const userId = getUserId(req);
  return {
    where: {
      id,
      [authFieldName]: userId,
    },
  };
}

export function buildBulkAuthIdentifiedResourceQuery(req: Request) {
  const where = parseWhereQueryString(req.query as Record<string, string>);
  return {
    where,
  };
}

export function parseOrderQueryString(queryString?: string) {
  if (!queryString) return {};
  const values = queryString.split(",");
  return values
    .map((it) => it.split("."))
    .filter((it) => {
      const [field, direction] = it;
      return field && direction;
    })
    .map((it) => {
      const [field, direction] = it;
      return {
        [field]: direction,
      };
    });
}

export function parsePageQueryString(queryString: any) {
  if (!queryString) return {};
  const { page, size } = queryString;
  if (typeof page === "undefined" || typeof size === "undefined") return {};
  const thePage = Number(page);
  const theSize = Number(size);
  return {
    skip: thePage * theSize,
    take: theSize,
  };
}

export function parseWhereQueryString(queryObject: Record<string, string>) {
  if (!queryObject) return {};
  const keys = Object.keys(queryObject).filter(
    (it) =>
      ![
        "page",
        "size",
        "order",
        "bulk",
        "include",
        "require_api_keys",
      ].includes(it),
  );
  const result = {} as Record<string, any>;
  for (const key of keys) {
    const queryObjectValue = queryObject[key];
    if (key === "or") {
      result.OR = parseConditionalQuery(queryObjectValue);
    } else if (key === "and") {
      result.AND = parseConditionalQuery(queryObjectValue);
    } else if (typeof queryObjectValue === "string") {
      const [op, rawValue] = splitByOccurrences(queryObjectValue, ".", 2);
      const value = stringToValue(rawValue);
      result[key] = operatorAndValueToQuery(op, value);
    }
  }
  return result;
}

function parseConditionalQuery(queryObjectValue: any) {
  const parts = queryObjectValue.split(",");
  return parts.map((it: string) => {
    const [prop, op, rawValue] = splitByOccurrences(it, ".", 3);
    const value = stringToValue(rawValue);
    return { [prop]: operatorAndValueToQuery(op, value) };
  });
}

function stringToValue(value: string) {
  if (value === "null") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}

function operatorAndValueToQuery(op: string, value: any) {
  switch (op) {
    case "eq":
      return value;
    case "neq":
      return {
        not: value,
      };
    case "nonEmpty":
      return {
        not: {
          equals: "",
        },
      };
    case "contains":
      return {
        contains: value,
        mode: "insensitive",
      };
    case "startsWith":
      return {
        startsWith: value,
      };
    case "endsWith":
      return {
        endsWith: value,
      };
    case "in": {
      const valuesArray = value.split(",").map((val: any) => {
        // Check if the value is numeric
        return isNaN(val) ? val : Number(val);
      });

      return {
        in: valuesArray,
      };
    }
    case "has": {
      return {
        has: value,
      };
    }
    case "hasSome": {
      const valuesArray = decodeURIComponent(value)
        .split(",")
        .map((val: string) => val.trim());
      return {
        hasSome: valuesArray,
      };
    }
    default:
      return value;
  }
}

export function getUserId(req: Request) {
  return isServiceKeyAuth(req) ? undefined : (req.headers["user_id"] as string);
}
