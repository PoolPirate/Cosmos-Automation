import { getBalance, send } from '../../wallet/wallet';
import Config from '../../../config.json';
import { ChainName } from '../../wallet/types';
export async function runFlushAsync() {
    try {
        const balanceToFlush = await getBalance(
            Config.autoswap.targetChainName as ChainName,
            Config.autoswap.targetDenom,
        );
        await send(
            Config.autoswap.targetChainName as ChainName,
            Config.autoswap.targetAddress,
            Config.autoswap.targetDenom,
            balanceToFlush,
        );
    } catch (error) {
        console.error(`Flushing failed: ${error}`);
    }
}
