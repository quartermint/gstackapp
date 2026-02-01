import { describe, it, expect } from 'vitest';
import {
  generateRequestId,
  generateTaskId,
  generateConversationId,
  generateNodeId,
  extractTimestampFromRequestId,
} from './id.js';

describe('generateRequestId', () => {
  it('should generate a request ID with correct format', () => {
    const id = generateRequestId();
    expect(id).toMatch(/^req_[a-z0-9]+_[a-f0-9]{12}$/);
  });

  it('should generate unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateRequestId());
    }
    expect(ids.size).toBe(100);
  });

  it('should have a valid base36 timestamp component', () => {
    const id = generateRequestId();
    const match = id.match(/^req_([a-z0-9]+)_/);
    expect(match).toBeTruthy();
    if (match && match[1]) {
      const timestamp = parseInt(match[1], 36);
      expect(timestamp).toBeGreaterThan(0);
      // Should be a reasonable timestamp (after year 2020)
      expect(timestamp).toBeGreaterThan(1577836800000);
    }
  });
});

describe('generateTaskId', () => {
  it('should generate a valid UUID', () => {
    const id = generateTaskId();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(id).toMatch(uuidRegex);
  });

  it('should generate unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateTaskId());
    }
    expect(ids.size).toBe(100);
  });
});

describe('generateConversationId', () => {
  it('should generate a valid UUID', () => {
    const id = generateConversationId();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(id).toMatch(uuidRegex);
  });

  it('should generate unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateConversationId());
    }
    expect(ids.size).toBe(100);
  });
});

describe('generateNodeId', () => {
  it('should generate a node ID with correct format', () => {
    const id = generateNodeId('my-hostname');
    expect(id).toMatch(/^node_my-hostname_[a-f0-9]{8}$/);
  });

  it('should sanitize hostname by lowercasing', () => {
    const id = generateNodeId('MyHostName');
    expect(id).toMatch(/^node_myhostname_[a-f0-9]{8}$/);
  });

  it('should sanitize hostname by replacing non-alphanumeric characters', () => {
    const id = generateNodeId('my.host_name!@#');
    expect(id).toMatch(/^node_my-host-name---_[a-f0-9]{8}$/);
  });

  it('should handle empty hostname', () => {
    const id = generateNodeId('');
    expect(id).toMatch(/^node__[a-f0-9]{8}$/);
  });

  it('should generate unique IDs for same hostname', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateNodeId('test-host'));
    }
    expect(ids.size).toBe(100);
  });
});

describe('extractTimestampFromRequestId', () => {
  it('should extract timestamp from valid request ID', () => {
    const id = generateRequestId();
    const timestamp = extractTimestampFromRequestId(id);
    expect(timestamp).not.toBeNull();
    expect(typeof timestamp).toBe('number');
    if (timestamp !== null) {
      // Should be within last 10 seconds
      const now = Date.now();
      expect(timestamp).toBeLessThanOrEqual(now);
      expect(timestamp).toBeGreaterThan(now - 10000);
    }
  });

  it('should return null for invalid format', () => {
    expect(extractTimestampFromRequestId('invalid')).toBeNull();
    expect(extractTimestampFromRequestId('not_a_request_id')).toBeNull();
    expect(extractTimestampFromRequestId('')).toBeNull();
  });

  it('should return null for malformed request ID', () => {
    expect(extractTimestampFromRequestId('req_')).toBeNull();
    expect(extractTimestampFromRequestId('req_invalid!')).toBeNull();
  });

  it('should handle request IDs with edge case timestamps', () => {
    // Create ID with known timestamp
    const id = 'req_lk2jx_abc123456789';
    const timestamp = extractTimestampFromRequestId(id);
    expect(timestamp).not.toBeNull();
    expect(typeof timestamp).toBe('number');
  });
});
