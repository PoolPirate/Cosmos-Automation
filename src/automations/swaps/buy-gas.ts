import { Chain } from '../../wallet/wallet';

export async function runBuyGas(chain: Chain) {
    if (chain != Chain.Osmosis) {
        throw 'Unsupported';
    }
}
