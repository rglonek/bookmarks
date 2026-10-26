import dns from 'node:dns';
import { BlockList, isIP } from 'node:net';

// Addresses that are not on the public internet: loopback, private networks,
// link-local (including the cloud metadata server at 169.254.169.254),
// carrier-grade NAT, multicast, reserved and documentation ranges, and IPv6
// forms that embed an IPv4 address. The metadata function must never be
// usable to reach these.
const blocked = new BlockList();

for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
]) {
  blocked.addSubnet(network, prefix, 'ipv4');
}

for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96], // NAT64
  ['64:ff9b:1::', 48],
  ['100::', 64], // discard
  ['2001::', 32], // Teredo
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
]) {
  blocked.addSubnet(network, prefix, 'ipv6');
}

// IPv4-mapped IPv6 addresses (::ffff:a.b.c.d) need no rule of their own:
// BlockList checks them against the IPv4 rules. (A ::ffff:0:0/96 rule would
// also match every plain IPv4 address.)
export function isPublicAddress(address) {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, 'ipv4');
  if (family === 6) return !blocked.check(address, 'ipv6');
  return false;
}

/**
 * A drop-in for dns.lookup that fails unless every address the name resolves
 * to is public. Used as the HTTP agents' lookup, so the check happens on the
 * address actually connected to (no gap for DNS rebinding).
 */
export function publicOnlyLookup(hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error);
    if (addresses.length === 0 || addresses.some(entry => !isPublicAddress(entry.address))) {
      const refused = new Error(`Refusing to connect to a non-public address for ${hostname}`);
      refused.code = 'EBLOCKED';
      return callback(refused);
    }
    if (options.all) return callback(null, addresses);
    return callback(null, addresses[0].address, addresses[0].family);
  });
}
