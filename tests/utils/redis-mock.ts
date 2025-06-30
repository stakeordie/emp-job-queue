// Advanced Redis mock for testing job broker logic
import { jest } from '@jest/globals';

export class RedisMock {
  private data = new Map<string, any>();
  private sortedSets = new Map<string, Array<{ member: string, score: number }>>();
  private hashes = new Map<string, Map<string, string>>();
  private lists = new Map<string, any[]>();
  private pubsubChannels = new Map<string, Set<Function>>();

  // String operations
  get = jest.fn((key: string) => {
    return Promise.resolve(this.data.get(key) || null);
  });

  set = jest.fn((key: string, value: any) => {
    this.data.set(key, value);
    return Promise.resolve('OK');
  });

  del = jest.fn((...keys: string[]) => {
    let deleted = 0;
    keys.forEach(key => {
      if (this.data.delete(key)) deleted++;
      if (this.sortedSets.delete(key)) deleted++;
      if (this.hashes.delete(key)) deleted++;
      if (this.lists.delete(key)) deleted++;
    });
    return Promise.resolve(deleted);
  });

  // Sorted set operations (critical for priority queue)
  zadd = jest.fn((key: string, ...args: any[]) => {
    if (!this.sortedSets.has(key)) {
      this.sortedSets.set(key, []);
    }
    
    const set = this.sortedSets.get(key)!;
    let added = 0;
    
    // Parse score-member pairs
    for (let i = 0; i < args.length; i += 2) {
      const score = parseFloat(args[i]);
      const member = args[i + 1];
      
      // Remove existing member if it exists
      const existingIndex = set.findIndex(item => item.member === member);
      if (existingIndex >= 0) {
        set.splice(existingIndex, 1);
      } else {
        added++;
      }
      
      // Insert in sorted order
      const insertIndex = set.findIndex(item => item.score > score);
      if (insertIndex >= 0) {
        set.splice(insertIndex, 0, { member, score });
      } else {
        set.push({ member, score });
      }
    }
    
    return Promise.resolve(added);
  });

  zrange = jest.fn((key: string, start: number, stop: number, withScores?: string) => {
    const set = this.sortedSets.get(key) || [];
    const slice = set.slice(start, stop === -1 ? undefined : stop + 1);
    
    if (withScores === 'WITHSCORES') {
      const result: (string | number)[] = [];
      slice.forEach(item => {
        result.push(item.member, item.score);
      });
      return Promise.resolve(result);
    }
    
    return Promise.resolve(slice.map(item => item.member));
  });

  zrem = jest.fn((key: string, ...members: string[]) => {
    const set = this.sortedSets.get(key) || [];
    let removed = 0;
    
    members.forEach(member => {
      const index = set.findIndex(item => item.member === member);
      if (index >= 0) {
        set.splice(index, 1);
        removed++;
      }
    });
    
    return Promise.resolve(removed);
  });

  zcard = jest.fn((key: string) => {
    const set = this.sortedSets.get(key) || [];
    return Promise.resolve(set.length);
  });

  // Hash operations
  hget = jest.fn((key: string, field: string) => {
    const hash = this.hashes.get(key);
    return Promise.resolve(hash?.get(field) || null);
  });

  hset = jest.fn((key: string, ...args: any[]) => {
    if (!this.hashes.has(key)) {
      this.hashes.set(key, new Map());
    }
    
    const hash = this.hashes.get(key)!;
    let added = 0;
    
    // Parse field-value pairs
    for (let i = 0; i < args.length; i += 2) {
      const field = args[i];
      const value = args[i + 1];
      
      if (!hash.has(field)) {
        added++;
      }
      hash.set(field, value);
    }
    
    return Promise.resolve(added);
  });

  hdel = jest.fn((key: string, ...fields: string[]) => {
    const hash = this.hashes.get(key);
    if (!hash) return Promise.resolve(0);
    
    let deleted = 0;
    fields.forEach(field => {
      if (hash.delete(field)) {
        deleted++;
      }
    });
    
    return Promise.resolve(deleted);
  });

  hgetall = jest.fn((key: string) => {
    const hash = this.hashes.get(key);
    if (!hash) return Promise.resolve({});
    
    const result: Record<string, string> = {};
    hash.forEach((value, field) => {
      result[field] = value;
    });
    
    return Promise.resolve(result);
  });

  // List operations
  lpush = jest.fn((key: string, ...values: any[]) => {
    if (!this.lists.has(key)) {
      this.lists.set(key, []);
    }
    
    const list = this.lists.get(key)!;
    list.unshift(...values.reverse());
    
    return Promise.resolve(list.length);
  });

  rpop = jest.fn((key: string) => {
    const list = this.lists.get(key);
    if (!list || list.length === 0) {
      return Promise.resolve(null);
    }
    
    return Promise.resolve(list.pop());
  });

  llen = jest.fn((key: string) => {
    const list = this.lists.get(key) || [];
    return Promise.resolve(list.length);
  });

  // Pub/Sub operations
  publish = jest.fn((channel: string, message: string) => {
    const subscribers = this.pubsubChannels.get(channel) || new Set();
    subscribers.forEach(callback => {
      setTimeout(() => callback(channel, message), 0);
    });
    return Promise.resolve(subscribers.size);
  });

  subscribe = jest.fn((channel: string) => {
    if (!this.pubsubChannels.has(channel)) {
      this.pubsubChannels.set(channel, new Set());
    }
    return Promise.resolve();
  });

  on = jest.fn((event: string, callback: Function) => {
    if (event === 'message') {
      // Store callback for all channels
      this.pubsubChannels.forEach(subscribers => {
        subscribers.add(callback);
      });
    }
    return this;
  });

  // Lua script execution (for atomic operations)
  eval = jest.fn((script: string, numKeys: number, ...args: any[]) => {
    // Mock basic Lua scripts used in job broker
    if (script.includes('zrange') && script.includes('zrem')) {
      // Job claim script
      const key = args[0];
      const count = parseInt(args[numKeys]) || 1;
      
      const set = this.sortedSets.get(key) || [];
      const claimed = set.splice(0, count);
      
      return Promise.resolve(claimed.map(item => item.member));
    }
    
    return Promise.resolve(null);
  });

  // Pipeline operations
  pipeline = jest.fn(() => {
    const commands: Array<() => Promise<any>> = [];
    
    const pipelineObj = {
      zadd: jest.fn((...args: any[]) => {
        commands.push(() => this.zadd(...args));
        return pipelineObj;
      }),
      zrem: jest.fn((...args: any[]) => {
        commands.push(() => this.zrem(...args));
        return pipelineObj;
      }),
      hset: jest.fn((...args: any[]) => {
        commands.push(() => this.hset(...args));
        return pipelineObj;
      }),
      exec: jest.fn(() => {
        return Promise.all(commands.map(cmd => cmd()));
      })
    };
    
    return pipelineObj;
  });

  // Connection methods
  connect = jest.fn(() => Promise.resolve());
  disconnect = jest.fn(() => Promise.resolve());
  quit = jest.fn(() => Promise.resolve());

  // Test utilities
  clear() {
    this.data.clear();
    this.sortedSets.clear();
    this.hashes.clear();
    this.lists.clear();
    this.pubsubChannels.clear();
  }

  getState() {
    return {
      data: Object.fromEntries(this.data),
      sortedSets: Object.fromEntries(this.sortedSets),
      hashes: Object.fromEntries(
        Array.from(this.hashes.entries()).map(([key, map]) => [
          key,
          Object.fromEntries(map)
        ])
      ),
      lists: Object.fromEntries(this.lists)
    };
  }
}

export const createRedisMock = () => new RedisMock();