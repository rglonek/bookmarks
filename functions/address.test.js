// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { isPublicAddress } from './address.js';

describe('isPublicAddress', () => {
  it('allows public addresses', () => {
    for (const address of ['104.20.23.154', '172.66.147.243', '8.8.8.8', '2606:4700::6810:1', '::ffff:8.8.8.8']) {
      expect(isPublicAddress(address), address).toBe(true);
    }
  });

  it('refuses loopback, private, link-local and metadata addresses', () => {
    for (const address of [
      '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
      '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '198.18.0.1',
      '::1', '::', 'fe80::1', 'fd00::1', 'ff02::1',
      '::ffff:127.0.0.1', '::ffff:169.254.169.254', '::ffff:7f00:1', '64:ff9b::7f00:1', '2002:7f00:1::',
    ]) {
      expect(isPublicAddress(address), address).toBe(false);
    }
  });

  it('refuses things that are not IP addresses', () => {
    expect(isPublicAddress('localhost')).toBe(false);
    expect(isPublicAddress('')).toBe(false);
  });
});
