import { Account, accountFromAny } from '@cosmjs/stargate';
import { InjectiveTypesV1Beta1Account } from '@injectivelabs/core-proto-ts';
import * as Stargate from '@cosmjs/stargate';

const originalAccountFromAny: (input: any) => Account = accountFromAny;

function accountParser(input: any): Account {
    const { typeUrl, value } = input;

    switch (typeUrl) {
        case '/injective.types.v1beta1.EthAccount':
            const account = InjectiveTypesV1Beta1Account.EthAccount.decode(
                value as Uint8Array,
            );
            const baseAccount = account.baseAccount!;
            const pubKey = baseAccount.pubKey;
            return {
                address: baseAccount.address,
                pubkey: pubKey
                    ? {
                          type: '/injective.crypto.v1beta1.ethsecp256k1.PubKey',
                          value: Buffer.from(pubKey.value).toString('base64'),
                      }
                    : null,
                accountNumber: parseInt(baseAccount.accountNumber, 10),
                sequence: parseInt(baseAccount.sequence, 10),
            };
        default:
            return originalAccountFromAny(input);
    }
}

export function overrideAccountParser() {
    Object.defineProperty(Stargate, 'accountFromAny', {
        writable: true,
    }).accountFromAny = accountParser;
}
