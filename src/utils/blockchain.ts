import { toChecksumAddress } from "./checksumAddress";
import { privateKeyToAccount } from "viem/accounts";
import { Hex } from "viem";

export function validatePrivatePublicKeyPair(privateKey: string, publicKey: string) {
  if (toChecksumAddress(privateKeyToAccount(privateKey as Hex).address) !== toChecksumAddress(publicKey)) {
    throw new Error('Private-public key pair mismatch');
  }
}