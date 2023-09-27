import { getBalance, send } from '../../wallet/wallet';
import Config from '../../../config.json';
import { ChainName } from '../../wallet/types';
import { prettifyDenom } from '../../main';
export async function runFlushAsync() {
    console.log('Running Flush');

    try {
        const balanceToFlush = await getBalance(
            Config.autoswap.targetChainName as ChainName,
            Config.autoswap.targetDenom,
        );

        if (balanceToFlush == 0) {
            console.log(
                `Skipping Flush: ${prettifyDenom(
                    Config.autoswap.targetChainName as ChainName,
                    Config.autoswap.targetDenom,
                )} balance is 0!`,
            );
            return;
        }

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
