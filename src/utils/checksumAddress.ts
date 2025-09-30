import { getAddress } from 'viem';

export type ChecksumAddress = string & { readonly __brand: 'ChecksumAddress' };

export function toChecksumAddress(address: string): ChecksumAddress {
  try {
    return getAddress(address) as ChecksumAddress;
  } catch (error) {
    throw new Error(`Invalid address: ${address}`);
  }
}

export function isValidAddress(address: string): boolean {
  try {
    getAddress(address);
    return true;
  } catch {
    return false;
  }
}

export function toChecksumAddresses(addresses: string[]): ChecksumAddress[] {
  return addresses.map(address => toChecksumAddress(address));
}